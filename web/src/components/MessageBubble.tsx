/**
 * MessageBubble — renders a single ChatMessage as a chat bubble.
 *
 *  - assistant: left-aligned card containing a collapsible thinking block, an
 *    optional list of ToolCallBlocks, and the markdown body, rendered in
 *    `message.segments` arrival order (streaming-safe).
 *  - user:      right-aligned, accent-tinted bubble.
 *  - system:    centered, muted one-liner.
 *
 * Messages without `segments` (historical / transitional payloads) fall back
 * to the legacy three-region layout driven by `message.text` /
 * `message.thinking` / `message.tools`.
 */

import { ChevronRight, Sparkles } from "lucide-react";
import { memo, useState } from "react";

import type {
  ChatMessage,
  ChatSegment,
  ToolCallInfo,
  ToolSegment,
} from "@/lib/chat-event-stream";
import { cn } from "@/lib/utils";

import { Markdown } from "./Markdown";
import { ToolCallBlock } from "./ToolCallBlock";

export const MessageBubble = memo(function MessageBubble({
  message,
}: {
  message: ChatMessage;
}) {
  if (message.role === "system") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[80%] rounded-md bg-secondary/40 px-3 py-1.5 text-center text-xs text-text-secondary">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-primary/10 px-3 py-2 text-sm leading-relaxed text-foreground">
          {message.text}
        </div>
      </div>
    );
  }

  return <AssistantBubble message={message} />;
});

/** Convert a ToolSegment into the ToolCallInfo shape ToolCallBlock expects.
 *  Shared so the streaming (segments) and legacy-history paths render one
 *  consistent card shape. */
export function segToToolInfo(seg: ToolSegment): ToolCallInfo {
  return {
    tool_id: seg.toolId,
    name: seg.name,
    args_text: seg.argsText,
    status: seg.status,
    summary: seg.summary,
    duration_s: seg.durationS,
    result_text: seg.resultText,
    error: seg.error,
  };
}

function AssistantBubble({ message }: { message: ChatMessage }) {
  const streaming = message.status === "streaming";

  // Fresh messages carry the ordered `segments` array; historic/transitional
  // payloads fall back to the legacy independent fields.
  const hasSegments =
    Array.isArray(message.segments) && message.segments.length > 0;

  if (hasSegments) {
    return (
      <BodyFrame>
        <SegmentSequence message={message} streaming={streaming} />
      </BodyFrame>
    );
  }

  return (
    <BodyFrame>
      <LegacyBody message={message} streaming={streaming} />
    </BodyFrame>
  );
}

/** Shared shell: agent identity row + the bubble card. */
function BodyFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-1.5 px-1 text-text-tertiary">
        <Sparkles className="size-3" />
        <span className="font-mondwest text-[11px] tracking-wide text-resonant">hermes</span>
      </div>
      <div className="max-w-[92%] rounded-lg rounded-tl-sm border border-border/70 bg-secondary/20 px-3 py-2">
        {children}
      </div>
    </div>
  );
}

/** Render segments in arrival order. */
function SegmentSequence({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming: boolean;
}) {
  const segments = message.segments as ChatSegment[];

  // Only the last TEXT segment may still be streaming; any earlier text
  // segment is finished and renders as Markdown.
  const lastTextIdx = segments.reduce<number>(
    (acc, s, i) => (s.kind === "text" ? i : acc),
    -1,
  );

  return (
    <div className="space-y-1.5">
      {segments.map((seg, i) => (
        <Segment
          key={segmentKey(seg, i)}
          seg={seg}
          isStreamingText={streaming && i === lastTextIdx}
        />
      ))}
    </div>
  );
}

function segmentKey(seg: ChatSegment, index: number): string {
  switch (seg.kind) {
    case "tool":
      return `tool-${seg.toolId}`;
    case "thinking":
      return `thinking-${index}`;
    case "text":
      return `text-${index}`;
  }
}

function Segment({
  seg,
  isStreamingText,
}: {
  seg: ChatSegment;
  isStreamingText: boolean;
}) {
  switch (seg.kind) {
    case "thinking":
      return <ThinkingBlock text={seg.text} />;
    case "tool":
      return <ToolCallBlock tool={segToToolInfo(seg)} />;
    case "text": {
      if (seg.text.trim().length === 0) return null;
      if (isStreamingText) {
        return (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {seg.text}
            <StreamingCaret />
          </div>
        );
      }
      return <Markdown content={seg.text} />;
    }
    default:
      return null;
  }
}

/**
 * Legacy three-region layout — used only when a message has no `segments`
 * (historical/transitional payloads built before the segment model).
 */
function LegacyBody({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming: boolean;
}) {
  const hasThinking = Boolean(message.thinking?.trim());
  const hasTools = Boolean(message.tools?.length);
  const hasBody = Boolean(message.text?.trim());

  return (
    <>
      {hasThinking && <ThinkingBlock text={message.thinking ?? ""} />}

      {hasTools && (
        <div className="mt-1.5 space-y-1.5">
          {message.tools!.map((tool) => (
            <ToolCallBlock key={tool.tool_id} tool={tool} />
          ))}
        </div>
      )}

      {hasBody && streaming && (
        <div className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {message.text}
          <StreamingCaret />
        </div>
      )}

      {hasBody && !streaming && (
        <div className="mt-1.5">
          <Markdown content={message.text ?? ""} />
        </div>
      )}

      {!hasBody && !hasTools && !hasThinking && streaming && (
        <div
          className="mt-1.5 inline-block h-4 w-1.5 animate-pulse bg-foreground/50 align-[-0.25em]"
          aria-label="streaming"
        />
      )}

      {!hasBody && !hasTools && !hasThinking && !streaming && (
        <div className="text-xs text-text-tertiary">—</div>
      )}
    </>
  );
}

/** Collapsible "thinking" block with an isolated expansion state. */
function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const trimmed = text.trim();
  if (!trimmed) return null;

  const previewLines = trimmed.split(/\r?\n/).slice(-3);

  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1 rounded px-1 py-0.5 text-[11px]",
          "text-text-tertiary transition-colors hover:text-text-secondary",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <ChevronRight
          className={cn("size-3 transition-transform", open && "rotate-90")}
        />
        <span className="italic">thinking</span>
      </button>

      {open ? (
        <div className="mt-1.5 border-l-2 border-border/50 pl-2.5 text-xs italic leading-relaxed text-text-secondary">
          <Markdown content={trimmed} />
        </div>
      ) : (
        // Fixed preview height: h-[2.25rem] ≈ 2 lines pins the box so short /
        // streaming previews don't collapse and re-expand, and overflow-hidden
        // caps content beyond 2 lines so wrap changes from container width
        // (scrollbar appearing/disappearing) never push the height — the
        // preview container height is constant, so the thinking frame never
        // jumps. The inner span is w-full so line-clamp-2 actually engages
        // inside the flex container.
        <p className="mt-1 flex h-[2.25rem] items-start overflow-hidden border-l-2 border-border/40 pl-2.5 text-[11px] italic text-text-tertiary">
          {previewLines.length > 0 ? (
            <span className="line-clamp-2 block w-full">
              {previewLines.map((line, i) => (
                <span key={i} className="block">
                  {line.length > 120 ? `${line.slice(0, 120)}…` : line}
                </span>
              ))}
            </span>
          ) : (
            <span className="truncate">thinking…</span>
          )}
        </p>
      )}
    </div>
  );
}

function StreamingCaret() {
  return (
    <span
      aria-hidden
      className="inline-block h-[1em] w-[0.5em] animate-pulse align-[-0.15em] bg-foreground/50"
    />
  );
}
