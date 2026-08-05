/**
 * ToolCallBlock — a collapsible card rendering one tool invocation inside an
 * assistant message. Shows the tool name, a running/complete/error status
 * badge, a truncated args summary, an optional output preview, and the
 * duration. Expandable/collapsible via the header.
 */

import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Loader2,
  Wrench,
} from "lucide-react";
import { useState } from "react";

import type { ToolCallInfo } from "@/lib/chat-event-stream";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<ToolCallInfo["status"], string> = {
  running: "running",
  complete: "done",
  error: "error",
};

const STATE_CLASSES: Record<ToolCallInfo["status"], string> = {
  running: "border-midground/15 bg-midground/8 text-midground",
  complete: "border-success/30 bg-success/15 text-success",
  error: "border-destructive/30 bg-destructive/15 text-destructive",
};

function formatDuration(seconds?: number): string | null {
  if (seconds === undefined || seconds < 0) return null;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m${secs}s`;
}

export function ToolCallBlock({ tool }: { tool: ToolCallInfo }) {
  const [open, setOpen] = useState(tool.status === "running");
  const hasBody = Boolean(
    tool.args_text ||
      tool.preview ||
      tool.error ||
      tool.summary ||
      tool.result_text,
  );

  const toggle = () => setOpen((v) => !v);
  const spin = tool.status === "running";

  return (
    <div className="rounded-md border border-border/70 bg-secondary/30">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 px-2.5 py-1.5 text-left",
          "transition-colors hover:bg-secondary/60",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {/* Status glyph */}
        <span className="grid size-4 shrink-0 place-items-center">
          {spin ? (
            <Loader2 className="size-3.5 animate-spin text-text-secondary" />
          ) : tool.status === "complete" ? (
            <CheckCircle2 className="size-3.5 text-success" />
          ) : (
            <CircleAlert className="size-3.5 text-destructive" />
          )}
        </span>

        {/* Tool name */}
        <Wrench className="size-3.5 shrink-0 text-text-secondary" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
          {tool.name}
        </span>

        {formatDuration(tool.duration_s) && (
          <span className="shrink-0 font-mono text-[10px] text-text-tertiary">
            {formatDuration(tool.duration_s)}
          </span>
        )}

        <span
          className={cn(
            "inline-flex items-center border px-1.5 py-0 text-[10px] font-compressed tracking-[0.2em] leading-none",
            STATE_CLASSES[tool.status],
          )}
        >
          {STATE_LABEL[tool.status]}
        </span>

        {hasBody && (
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-text-tertiary transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </button>

      {open && hasBody && (
        <div className="space-y-2 border-t border-border/50 px-2.5 py-2">
          {tool.args_text && (
            <pre className="whitespace-pre-wrap break-words rounded border border-border/50 bg-background/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-foreground/90">
              {tool.args_text}
            </pre>
          )}

          {(tool.error || tool.summary) && (
            <div
              className={cn(
                "rounded bg-background/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed",
                tool.error ? "text-destructive" : "text-foreground/90",
              )}
            >
              {tool.error ?? tool.summary}
            </div>
          )}

          {(tool.preview || tool.result_text) && (
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded bg-background/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-text-secondary">
              {tool.result_text ?? tool.preview}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
