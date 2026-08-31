import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogOut, Loader2, WifiOff } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { MessageBubble } from "@/components/MessageBubble";
import { MessageInput } from "@/components/MessageInput";
import { DbCapacityBar } from "@/components/DbCapacityBar";
import {
  getSession,
  getPeerUser,
  getMessages,
  logout,
  sendMessage,
  type ChatUser,
  type Message,
} from "@/lib/chat-store";

const BACKEND_URL = "http://localhost:4000";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Private Chat — One-to-one messaging" },
      {
        name: "description",
        content: "A private, paginated one-to-one chat room for two people.",
      },
      { property: "og:title", content: "Private Chat — One-to-one messaging" },
      {
        property: "og:description",
        content: "A private, paginated one-to-one chat room for two people.",
      },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<ChatUser | null>(null);
  const [peer, setPeer] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const socketRef = useRef<Socket | null>(null);

  // ── Bootstrap: verify session, load peer & first message page ──────────
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
          getMessages({ limit: 50 }),
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
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // ── Socket.IO — connect after session is confirmed ───────────────────────
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
          // Deduplicate (our own sent messages are already added optimistically)
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, incoming];
        });
      },
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  // ── Auto-scroll to bottom when new messages arrive ───────────────────────
  useEffect(() => {
    if (atBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages]);

  // ── Scroll handler — load older messages on scroll to top ────────────────
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;

    if (el.scrollTop < 60 && nextCursor && !loadingOlder) {
      setLoadingOlder(true);
      const cursor = nextCursor;
      const prevHeight = el.scrollHeight;
      getMessages({ limit: 50, before: cursor })
        .then((page) => {
          setMessages((m) => [...page.messages, ...m]);
          setNextCursor(page.nextCursor);
          requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight - prevHeight;
          });
        })
        .catch(() => setError("Failed to load older messages."))
        .finally(() => setLoadingOlder(false));
    }
  }, [nextCursor, loadingOlder]);

  // ── Send ─────────────────────────────────────────────────────────────────
  async function handleSend(content: string) {
    if (!user) return;
    setError(null);
    try {
      const msg = await sendMessage(content);
      atBottomRef.current = true;
      // Optimistic add — socket event will be de-duped
      setMessages((m) => [...m, msg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message.");
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async function handleLogout() {
    await logout();
    navigate({ to: "/login" });
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const peerName = peer?.name ?? "Chat Partner";
  const peerInitial = peerName.charAt(0).toUpperCase();

  return (
    <div className="flex h-[100dvh] flex-col bg-muted/40">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {peerInitial}
            </span>
            <div className="leading-tight">
              <h1 className="text-sm font-semibold">{peerName}</h1>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {connected ? (
                  <>
                    <span className="size-1.5 rounded-full bg-chart-2" />
                    Online
                  </>
                ) : (
                  <>
                    <WifiOff className="size-3" />
                    Connecting…
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            id="logout-btn"
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-accent"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* ── Capacity Bar ──────────────────────────────────────── */}
      <DbCapacityBar
        currentUser={user}
        onReset={async () => {
          // After a DB wipe, clear local state and reload first page
          setMessages([]);
          setNextCursor(null);
          const page = await getMessages({ limit: 50 });
          setMessages(page.messages);
          setNextCursor(page.nextCursor);
        }}
      />

      {/* ── Message list ──────────────────────────────────────── */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {loadingOlder && (
            <div className="flex justify-center py-2">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!nextCursor && !loading && messages.length > 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              This is the beginning of your conversation.
            </p>
          )}
          {!loading && messages.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No messages yet. Say hello 👋
            </p>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} mine={m.senderId === user.id} />
          ))}
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <p className="bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">{error}</p>
      )}

      {/* ── Input ───────────────────────────────────────────────────────── */}
      <MessageInput onSend={handleSend} />
    </div>
  );
}
