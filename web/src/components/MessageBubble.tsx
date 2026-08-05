/**
 * MessageBubble — renders a single ChatMessage as a chat bubble.
 *
 *  - assistant: left-aligned card with a collapsible thinking block, an
 *    optional list of ToolCallBlocks, and the markdown body.
 *  - user:      right-aligned, accent-tinted bubble.
 *  - system:    centered, muted one-liner.
 */

import { ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";

import type { ChatMessage } from "@/lib/chat-event-stream";
import { cn } from "@/lib/utils";

import { Markdown } from "./Markdown";
import { ToolCallBlock } from "./ToolCallBlock";

export function MessageBubble({ message }: { message: ChatMessage }) {
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
}

function AssistantBubble({ message }: { message: ChatMessage }) {
  const [showThinking, setShowThinking] = useState(Boolean(message.thinking));
  const streaming = message.status === "streaming";
  const hasThinking = Boolean(message.thinking?.trim());
  const hasTools = Boolean(message.tools?.length);
  const hasBody = Boolean(message.text?.trim());

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-1.5 px-1 text-text-tertiary">
        <Sparkles className="size-3" />
        <span className="font-mondwest text-[11px] tracking-wide text-resonant">hermes</span>
      </div>

      <div className="max-w-[92%] rounded-lg rounded-tl-sm border border-border/70 bg-secondary/20 px-3 py-2">
        {hasThinking && (
          <div className="mb-1.5">
            <button
              type="button"
              onClick={() => setShowThinking((v) => !v)}
              aria-expanded={showThinking}
              className={cn(
                "flex items-center gap-1 rounded px-1 py-0.5 text-[11px]",
                "text-text-tertiary transition-colors hover:text-text-secondary",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <ChevronRight
                className={cn("size-3 transition-transform", showThinking && "rotate-90")}
              />
              <span className="italic">thinking</span>
            </button>

            {showThinking && (
              <div className="mt-1.5 border-l-2 border-border/50 pl-2.5 text-xs italic leading-relaxed text-text-secondary">
                <Markdown content={message.thinking ?? ""} />
              </div>
            )}
          </div>
        )}

        {hasTools && (
          <div className="mb-2 space-y-1.5">
            {message.tools!.map((tool) => (
              <ToolCallBlock key={tool.tool_id} tool={tool} />
            ))}
          </div>
        )}

        {hasBody && (
          <Markdown content={message.text ?? ""} streaming={streaming} />
        )}

        {!hasBody && !hasTools && !hasThinking && streaming && (
          <div
            className="inline-block h-4 w-1.5 animate-pulse bg-foreground/50 align-[-0.25em]"
            aria-label="streaming"
          />
        )}

        {!hasBody && !hasTools && !hasThinking && !streaming && (
          <div className="text-xs text-text-tertiary">—</div>
        )}
      </div>
    </div>
  );
}
