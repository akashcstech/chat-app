import { memo } from "react";
import { Check, CheckCheck } from "lucide-react";
import { formatTime, type Message } from "@/lib/chat-store";
import { cn } from "@/lib/utils";

export const MessageBubble = memo(function MessageBubble({
  message,
  mine,
}: {
  message: Message;
  mine: boolean;
}) {
  return (
    <div className={cn("flex w-full animate-message-pop", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[65%] select-none",
          mine
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-card text-card-foreground border border-border",
        )}
      >
        {/* React escapes content, so XSS payloads render as plain text. */}
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-[10px]",
            mine ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          <span>{formatTime(message.createdAt)}</span>
          {mine &&
            (message.status === "read" ? (
              <CheckCheck className="size-3" />
            ) : message.status === "delivered" ? (
              <CheckCheck className="size-3 opacity-70" />
            ) : (
              <Check className="size-3 opacity-70" />
            ))}
        </div>
      </div>
    </div>
  );
});
