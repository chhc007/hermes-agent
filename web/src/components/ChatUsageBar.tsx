import { useI18n } from "@/i18n";
import type { ChatUsage } from "@/lib/chat-event-stream";
import { cn } from "@/lib/utils";

/** Compact token-count formatting: 1.2k / 34.5k / 1.1m (matches TUI fmtK). */
function fmtK(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

/**
 * Live context-window usage bar for the bubble chat surface. Mirrors the TUI
 * status-bar context readout (`ui-tui/src/components/appChrome.tsx`):
 * `used/max tok` + a fill bar, plus a compaction-count chip when the context
 * has been compressed. Renders nothing when no context gauge is available.
 */
export function ChatUsageBar({
  usage,
  className,
}: {
  usage: ChatUsage | null;
  className?: string;
}) {
  const { t } = useI18n();
  if (!usage) return null;

  const pct = usage.context_percent;
  const hasGauge = Boolean(usage.context_max && usage.context_used != null);
  const label = hasGauge
    ? `${fmtK(usage.context_used ?? 0)}/${fmtK(usage.context_max ?? 0)} tok`
    : (usage.total ?? 0) > 0
      ? `${fmtK(usage.total ?? 0)} tok`
      : "";
  if (!label && !(usage.compressions ?? 0)) return null;

  const compressions = typeof usage.compressions === "number" ? usage.compressions : 0;
  const pctClamped = hasGauge && pct != null ? Math.max(0, Math.min(100, pct)) : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1 text-[11px] leading-none",
        "text-text-tertiary",
        className,
      )}
      title={t.chat.contextUsageTitle ?? "Context window usage"}
    >
      {hasGauge && (
        <div
          className="relative h-1 w-16 overflow-hidden rounded-full bg-secondary/40"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pctClamped)}
          aria-label={label}
        >
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500",
              pctClamped >= 90
                ? "bg-destructive"
                : pctClamped >= 70
                  ? "bg-warning"
                  : "bg-primary/70",
            )}
            style={{ width: `${pctClamped}%` }}
          />
        </div>
      )}
      {label && <span className="font-mono tabular-nums">{label}</span>}
      {compressions > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded border border-border/60 bg-secondary/30 px-1 py-0.5"
          title={t.chat.compressionsTitle ?? "Context compressions"}
        >
          🗜️×{compressions}
        </span>
      )}
    </div>
  );
}
