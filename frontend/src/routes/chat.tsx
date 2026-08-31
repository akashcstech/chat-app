import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { MessageBubble } from "@/components/MessageBubble";
import { MessageInput } from "@/components/MessageInput";
import {
  getMessages,
  getSession,
  getSince,
  logout,
  otherUser,
  sendMessage,
  type ChatUser,
  type Message,
} from "@/lib/chat-store";

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    setUser(session);
    const page = getMessages();
    setMessages(page.messages);
    setHasMore(page.hasMore);
    setLoading(false);
  }, [navigate]);

  // Near-real-time: poll for new messages (swap for WebSockets later).
  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => {
      setMessages((prev) => {
        const last = prev[prev.length - 1]?.id ?? null;
        const fresh = getSince(last);
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, [user]);

  useEffect(() => {
    if (atBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 60 && hasMore && !loadingOlder) {
      setLoadingOlder(true);
      const before = messages[0]?.id;
      window.setTimeout(() => {
        const prevHeight = el.scrollHeight;
        const page = before ? getMessages({ before }) : getMessages();
        setMessages((m) => [...page.messages, ...m]);
        setHasMore(page.hasMore);
        setLoadingOlder(false);
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight - prevHeight;
        });
      }, 250);
    }
  }, [hasMore, loadingOlder, messages]);

  function handleSend(content: string) {
    if (!user) return;
    try {
      const msg = sendMessage(user.id, content);
      atBottomRef.current = true;
      setMessages((m) => [...m, msg]);
      setError(null);
    } catch {
      setError("Unable to send message. Please try again.");
    }
  }

  function handleLogout() {
    logout();
    navigate({ to: "/login" });
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const peer = otherUser(user.id);

  return (
    <div className="flex h-[100dvh] flex-col bg-muted/40">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {peer.name.charAt(0)}
            </span>
            <div className="leading-tight">
              <h1 className="text-sm font-semibold">{peer.name}</h1>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-chart-2" />
                Online
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-accent"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {loadingOlder && (
            <div className="flex justify-center py-2">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!hasMore && !loading && messages.length > 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              This is the beginning of your conversation.
            </p>
          )}
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
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

      {error && (
        <p className="bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">{error}</p>
      )}

      <MessageInput onSend={handleSend} />
    </div>
  );
}
