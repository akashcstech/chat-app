import { useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { MAX_LENGTH } from "@/lib/chat-store";

export function MessageInput({ onSend }: { onSend: (content: string) => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const tooLong = value.length > MAX_LENGTH;
  const canSend = value.trim().length > 0 && !tooLong;

  function submit() {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
    ref.current?.focus();
  }

  return (
    <div className="border-t border-border bg-card px-3 py-3 sm:px-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          onPaste={(e) => e.preventDefault()}
          onCopy={(e) => e.preventDefault()}
          onCut={(e) => e.preventDefault()}
          placeholder="Type a message…"
          aria-label="Message"
          className="max-h-40 min-h-[42px] flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="flex h-[42px] items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
        >
          <SendHorizontal className="size-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </div>
      {tooLong && (
        <p className="mx-auto mt-2 max-w-3xl text-xs text-destructive">
          Message is too long ({value.length}/{MAX_LENGTH}).
        </p>
      )}
    </div>
  );
}
