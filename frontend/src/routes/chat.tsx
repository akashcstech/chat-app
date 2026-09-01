import { createFileRoute } from "@tanstack/react-router";
import { Loader2, LogOut, WifiOff } from "lucide-react";
import { MessageBubble } from "@/components/MessageBubble";
import { MessageInput } from "@/components/MessageInput";
import { DbCapacityBar } from "@/components/DbCapacityBar";
import { useChat } from "@/hooks/useChat";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Private Chat \u2014 One-to-one messaging" },
      {
        name: "description",
        content: "A private, paginated one-to-one chat room for two people.",
      },
      { property: "og:title", content: "Private Chat \u2014 One-to-one messaging" },
      {
        property: "og:description",
        content: "A private, paginated one-to-one chat room for two people.",
      },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const {
    user,
    peer,
    messages,
    nextCursor,
    loading,
    loadingOlder,
    error,
    connected,
    scrollRef,
    topSentinelRef,
    onScroll,
    handleSend,
    handleLogout,
    handleReset,
  } = useChat();

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
      {/* Header */}
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
                    Connecting\u2026
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

      {/* Capacity Bar */}
      <DbCapacityBar currentUser={user} onReset={handleReset} />

      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-3 py-4 sm:px-4"
      >
        <div
          role="list"
          aria-label="Chat messages"
          className="mx-auto flex max-w-3xl flex-col gap-2"
        >
          {/* Sentinel: IntersectionObserver fires here to load older messages */}
          <div ref={topSentinelRef} aria-hidden="true" />

          {loadingOlder && (
            <div className="flex justify-center py-2">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!nextCursor && messages.length > 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              This is the beginning of your conversation.
            </p>
          )}
          {messages.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No messages yet. Say hello
            </p>
          )}
          {messages.map((m) => (
            <div role="listitem" key={m.id}>
              <MessageBubble message={m} mine={m.senderId === user.id} />
            </div>
          ))}
        </div>
      </div>

      {/* Reconnect toast */}
      {!connected && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-2 text-center text-xs font-medium text-amber-700 dark:text-amber-400"
        >
          <WifiOff className="size-3 shrink-0" />
          Reconnecting to server\u2026 Messages will be delivered when connection is restored.
        </div>
      )}

      {/* Error banner */}
      {error && (
        <p className="bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Input */}
      <MessageInput onSend={handleSend} />
    </div>
  );
}
