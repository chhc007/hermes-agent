/**
 * ChatMessageList — scrollable container for ChatMessage[] bubbles.
 * Auto-scrolls to the bottom on new messages and follows the tail while the
 * last message is streaming, unless the user has scrolled up.
 */

import { useEffect, useRef } from "react";

import type { ChatMessage } from "@/lib/chat-event-stream";
import { cn } from "@/lib/utils";

import { MessageBubble } from "./MessageBubble";

interface ChatMessageListProps {
  messages: ChatMessage[];
  className?: string;
}

export function ChatMessageList({ messages, className }: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const lastCountRef = useRef(0);

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

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distFromBottom < 120;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  });

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      data-streaming={isStreaming ? "true" : undefined}
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-1 py-3",
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
  );
}
