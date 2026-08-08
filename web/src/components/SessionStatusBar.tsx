import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { SessionMeta, LiveSubagent } from "@/lib/chat-event-stream";
import { fmtDuration } from "@/lib/duration";

/**
 * Session status strip for the bubble chat surface — mirrors the TUI status
 * rule (`ui-tui/src/components/appChrome.tsx`): busy indicator, model +
 * reasoning effort, cwd, subagent HUD and background-task count. Renders
 * nothing until the first session.info.
 */
export function SessionStatusBar({
  meta,
  subagents,
  sessionStartedAt,
  bgCount,
  queuedCount,
  className,
}: {
  meta: SessionMeta;
  subagents: LiveSubagent[];
  /** Epoch ms when the session started (null = unknown → no timer). */
  sessionStartedAt?: number | null;
  bgCount?: number;
  queuedCount?: number;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  // Re-tick every second so the session duration stays live.
  useEffect(() => {
    if (!meta.running || !sessionStartedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [meta.running, sessionStartedAt]);

  const model = [meta.model, meta.reasoningEffort ? `⚙${meta.reasoningEffort}` : ""]
    .filter(Boolean)
    .join(" ");
  const cwd = meta.cwd && meta.cwd !== "." ? meta.cwd : "";
  const runningSubagents = subagents.filter((s) => s.status !== "complete");
  const subagentLabel =
    runningSubagents.length > 0
      ? `⛓ ${runningSubagents.length}`
      : "";
  const bgLabel = bgCount && bgCount > 0 ? `${bgCount} bg` : "";
  const queuedLabel = queuedCount && queuedCount > 0 ? `${queuedCount} queued` : "";

  const segments: string[] = [];
  if (model) segments.push(model);
  if (cwd) segments.push(cwd);
  if (subagentLabel) segments.push(subagentLabel);
  if (bgLabel) segments.push(bgLabel);
  if (queuedLabel) segments.push(queuedLabel);

  return (
    <div
      className={cn(
        "flex min-h-0 shrink-0 items-center gap-2 overflow-hidden px-1 text-[11px] leading-none",
        "text-text-tertiary",
        className,
      )}
    >
      {/* Busy indicator */}
      <span
        className={cn(
          "inline-flex items-center gap-1 font-medium",
          meta.running ? "text-primary" : "text-text-tertiary",
        )}
        title={meta.running ? "Agent is working" : "Idle"}
      >
        {meta.running ? "●" : "○"}
      </span>

      {/* Model + reasoning + cwd + subagent/bg/queued */}
      {segments.length > 0 && (
        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          {segments.map((seg, i) => (
            <span key={i} className="truncate">
              {seg}
            </span>
          ))}
        </span>
      )}

      {/* Session duration (when known) */}
      {meta.running && sessionStartedAt && (
        <span className="ml-auto shrink-0 font-mono tabular-nums">
          {fmtDuration(now - sessionStartedAt)}
        </span>
      )}
    </div>
  );
}
