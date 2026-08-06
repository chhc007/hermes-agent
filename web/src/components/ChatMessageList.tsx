/**
 * ChatMessageList — scrollable container for ChatMessage[] bubbles.
 * Auto-scrolls to the bottom on new messages and follows the tail while the
 * last message is streaming, unless the user has scrolled up.
 * An auto-scroll toggle lets the user free-read; actively scrolling up (via
 * wheel or touch) drops out of auto-follow immediately instead of waiting
 * for the 120px threshold.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronsDown } from "lucide-react";

import type { ChatMessage } from "@/lib/chat-event-stream";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

import { MessageBubble } from "./MessageBubble";

interface ChatMessageListProps {
  messages: ChatMessage[];
  className?: string;
}

export function ChatMessageList({ messages, className }: ChatMessageListProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const lastCountRef = useRef(0);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  // Reset stickiness on a brand-new message (previously user may have
  // scrolled up; a new turn is a strong enough signal to re-stick).
  if (messages.length !== lastCountRef.current) {
    if (messages.length > lastCountRef.current && messages.length > 0) {
      stickToBottomRef.current = true;
    }
    lastCountRef.current = messages.length;
  }

  const last = messages[messages.length - 1];
  const isStreaming =
    messages.length > 0 && last!.role === "assistant" && last!.status === "streaming";

  // User actively scrolling up (wheel) immediately drops out of auto-follow.
  // Downward scroll is left to handleScroll, which re-sticks at the bottom.
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0 && autoScrollEnabled) {
      stickToBottomRef.current = false;
    }
  };

  // Touch scroll isn't a wheel event; any touch immediately drops out of
  // auto-follow so mobile users can free-read.
  const handleTouchStart = () => {
    if (autoScrollEnabled) {
      stickToBottomRef.current = false;
    }
  };

  const handleScroll = () => {
    // When auto-scroll is turned off, don't let scroll drive stickiness —
    // that would re-stick the user against their intent.
    if (!autoScrollEnabled) return;
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distFromBottom < 120;
  };

  const toggleAutoScroll = () => {
    setAutoScrollEnabled((enabled) => !enabled);
    if (!autoScrollEnabled) {
      // Turning auto-scroll back on: snap to the bottom and re-stick.
      stickToBottomRef.current = true;
      const el = scrollRef.current;
      if (el) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    }
  };

  useEffect(() => {
    if (!autoScrollEnabled || !stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming, autoScrollEnabled]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        data-testid="message-list"
        data-streaming={isStreaming ? "true" : undefined}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-1 pb-10 pt-3",
          className,
        )}
      >
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {messages.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            Start a conversation — hermes is listening.
          </div>
        )}
      </div>
      {messages.length > 0 && (
        <button
          type="button"
          onClick={toggleAutoScroll}
          aria-label={t.chat.toggleAutoScroll}
          aria-pressed={autoScrollEnabled}
          title={t.chat.toggleAutoScroll}
          className={cn(
            "absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full",
            autoScrollEnabled
              ? "bg-primary/15 text-primary"
              : "bg-secondary/60 text-text-tertiary",
          )}
        >
          <ChevronsDown className="size-4" />
        </button>
      )}
    </div>
  );
}
