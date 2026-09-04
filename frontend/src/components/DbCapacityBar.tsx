import { useCallback, useEffect, useRef, useState } from "react";
import { Download, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDbStats, exportAndReset, MESSAGE_CAP } from "@/lib/chat-store";
import type { ChatUser } from "@/lib/chat-store";

interface Props {
  /** Pass the logged-in user so we can show the export button only for user 2. */
  currentUser: ChatUser;
  /** Callback fired after a successful export+reset so the chat can refresh. */
  onReset?: () => void;
  /** When this value changes, the counter is re-fetched immediately. Pass messages.length. */
  refreshKey?: number;
}

const POLL_INTERVAL_MS = 15_000; // refresh counter every 15 s
const WARN_THRESHOLD = 0.8; // show warning colour above 80 %

export function DbCapacityBar({ currentUser, onReset, refreshKey }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const { messageCount } = await getDbStats();
      setCount(messageCount);
    } catch {
      // silently ignore transient errors
    }
  }, []);

  useEffect(() => {
    fetchStats();
    timerRef.current = setInterval(fetchStats, POLL_INTERVAL_MS);

    // Pause polling while the tab is hidden — resume + refresh when visible again.
    function handleVisibility() {
      if (document.hidden) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
      } else {
        fetchStats();
        timerRef.current = setInterval(fetchStats, POLL_INTERVAL_MS);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchStats]);

  // Instant refresh whenever the parent signals a change (new message sent/received).
  useEffect(() => {
    if (refreshKey !== undefined) {
      fetchStats();
    }
  }, [refreshKey, fetchStats]);

  const ratio = count !== null ? Math.min(count / MESSAGE_CAP, 1) : 0;
  const pct = Math.round(ratio * 100);
  const isWarning = ratio >= WARN_THRESHOLD;
  const isCritical = ratio >= 0.95;

  async function handleExport() {
    if (!window.confirm(
      "⚠️ This will export ALL messages to a CSV file and then permanently delete them from the database.\n\nAre you sure?"
    )) return;

    setExporting(true);
    setExportError(null);
    setExportDone(false);

    try {
      await exportAndReset();
      setCount(0);
      setExportDone(true);
      onReset?.();
      // Clear the done badge after 5 s
      setTimeout(() => setExportDone(false), 5000);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      id="db-capacity-bar"
      className={cn(
        "w-full px-4 py-2 flex flex-col gap-1 border-b border-border transition-colors duration-500",
        isCritical
          ? "bg-destructive/10"
          : isWarning
          ? "bg-amber-500/10"
          : "bg-card",
      )}
    >
      {/* Top row: label + count + export button */}
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isCritical && (
            <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
          )}
          {isWarning && !isCritical && (
            <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
          )}
          <span>
            Database Capacity:{" "}
            <span
              className={cn(
                "font-semibold tabular-nums",
                isCritical
                  ? "text-destructive"
                  : isWarning
                  ? "text-amber-500"
                  : "text-foreground",
              )}
            >
              {count !== null ? count.toLocaleString() : "…"}
            </span>
            {" / "}
            <span className="text-foreground">{MESSAGE_CAP.toLocaleString()}</span>
            {" messages"}
            {count !== null && (
              <span className="ml-1 text-muted-foreground">({pct}%)</span>
            )}
          </span>
        </div>

        {/* Export button — backend enforces User 2 restriction */}
        {currentUser.isAdmin && (
          <button
            id="export-reset-btn"
            onClick={handleExport}
            disabled={exporting}
            title="Export all messages to CSV and reset the database (Admin only)"
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition",
              isCritical
                ? "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
              "disabled:opacity-60",
            )}
          >
            {exporting ? (
              <Loader2 className="size-3 animate-spin" />
            ) : exportDone ? (
              <CheckCircle2 className="size-3 text-chart-2" />
            ) : (
              <Download className="size-3" />
            )}
            {exporting ? "Exporting…" : exportDone ? "Done!" : "Export & Reset"}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mx-auto w-full max-w-3xl">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              isCritical
                ? "bg-destructive"
                : isWarning
                ? "bg-amber-500"
                : ratio > 0.5
                ? "bg-chart-4"
                : "bg-chart-2",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Error message */}
      {exportError && (
        <p className="mx-auto w-full max-w-3xl text-xs text-destructive">
          {exportError}
        </p>
      )}
    </div>
  );
}
