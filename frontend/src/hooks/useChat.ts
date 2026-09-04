/**
 * useChat — encapsulates all data, socket, and scroll logic for ChatPage.
 *
 * Returns everything the UI needs; ChatPage is left as a pure render component.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { io, Socket } from "socket.io-client";
import {
  getSession,
  getPeerUser,
  getMessages,
  logout,
  sendMessage,
  getDbStats,
  type ChatUser,
  type Message,
} from "@/lib/chat-store";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000";

export function useChat() {
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────────────
  const [user, setUser] = useState<ChatUser | null>(null);
  const [peer, setPeer] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [isCapReached, setIsCapReached] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const socketRef = useRef<Socket | null>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  // Keep stable refs for the IntersectionObserver callback (avoids stale closures).
  const nextCursorRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  const scrollThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync with state.
  useEffect(() => { nextCursorRef.current = nextCursor; }, [nextCursor]);
  useEffect(() => { loadingOlderRef.current = loadingOlder; }, [loadingOlder]);

  // ── Bootstrap: verify session, load peer & first message page ─────────────
  
  const refreshStats = useCallback(async () => {
    try {
      const stats = await getDbStats();
      setIsCapReached(stats.messageCount >= stats.cap);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const session = await getSession();
        if (!session) {
          navigate({ to: "/login" });
          return;
        }
        const [peerUser, page] = await Promise.all([
          getPeerUser(),
          getMessages(),
          refreshStats(),
        ]);
        if (cancelled) return;
        setUser(session);
        setPeer(peerUser);
        setMessages(page.messages);
        setNextCursor(page.nextCursor);
      } catch {
        if (!cancelled) setError("Failed to load chat. Is the backend running?");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    bootstrap();
    return () => { cancelled = true; };
  }, [navigate, refreshStats]);

  // ── Socket.IO — connect after session is confirmed ─────────────────────────
  useEffect(() => {
    if (!user) return;

    const socket = io(BACKEND_URL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    socket.on(
      "message:new",
      (msg: {
        id: string;
        senderId: string;
        receiverId: string;
        content: string;
        createdAt: string;
      }) => {
        const incoming: Message = {
          id: msg.id,
          senderId: msg.senderId,
          receiverId: msg.receiverId,
          content: msg.content,
          createdAt: new Date(msg.createdAt).getTime(),
          status: "read",
        };
        setMessages((prev) => {
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, incoming];
        });
        refreshStats();
      },
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, refreshStats]);

  // ── Auto-scroll to bottom when new messages arrive ─────────────────────────
  useEffect(() => {
    if (atBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages]);

  // ── Load older messages (used by IntersectionObserver) ────────────────────
  const loadOlderMessages = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingOlderRef.current || !nextCursorRef.current) return;

    const cursor = nextCursorRef.current;
    const prevHeight = el.scrollHeight;
    setLoadingOlder(true);
    loadingOlderRef.current = true;

    getMessages({ before: cursor })
      .then((page) => {
        setMessages((m) => [...page.messages, ...m]);
        setNextCursor(page.nextCursor);
        // Preserve scroll position after prepending older messages.
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight - prevHeight;
        });
      })
      .catch(() => setError("Failed to load older messages."))
      .finally(() => setLoadingOlder(false));
  }, []);

  // ── IntersectionObserver — fires when sentinel at list-top enters view ─────
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadOlderMessages();
        }
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadOlderMessages]);

  // ── Scroll handler — track atBottom only; load-more is handled by observer ─
  const onScroll = useCallback(() => {
    if (scrollThrottleRef.current) return;
    scrollThrottleRef.current = setTimeout(() => {
      scrollThrottleRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    }, 100);
  }, []);

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (content: string) => {
    if (!user || isCapReached) return;
    setError(null);
    atBottomRef.current = true;
    try {
      await sendMessage(content);
      refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message.");
      if (err instanceof Error && err.message.toLowerCase().includes('limit reached')) {
        refreshStats(); // aggressively force update if the server just blocked us
      }
    }
  }, [user, isCapReached, refreshStats]);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    await logout();
    navigate({ to: "/login" });
  }, [navigate]);

  // ── DB reset (passed to DbCapacityBar) ────────────────────────────────────
  const handleReset = useCallback(async () => {
    setMessages([]);
    setNextCursor(null);
    const page = await getMessages();
    setMessages(page.messages);
    setNextCursor(page.nextCursor);
    refreshStats();
  }, [refreshStats]);

  return {
    user,
    peer,
    messages,
    nextCursor,
    loading,
    loadingOlder,
    error,
    connected,
    isCapReached,
    scrollRef,
    topSentinelRef,
    onScroll,
    handleSend,
    handleLogout,
    handleReset,
  };
}
