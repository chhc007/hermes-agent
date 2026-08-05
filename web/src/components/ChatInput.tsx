/**
 * ChatInput — the chat-view composer. A multi-line textarea (Enter sends,
 * Shift+Enter newline) with image paste / drag-drop. Text is delivered via
 * `onSend`; image bytes are uploaded by ChatPage through the existing
 * chatImagePaste path and attached to the running session.
 */

import { ImagePlus, Send } from "lucide-react";
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import {
  imageFilesFromTransfer,
  transferMayContainImage,
} from "@/lib/chatImagePaste";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  /** Returns false when the message was NOT accepted (e.g. PTY not connected). */
  onSend: (text: string) => boolean | void;
  disabled?: boolean;
  /** Receive image drops/pastes so the owner (ChatPage) can upload + attach. */
  onImages?: (files: File[]) => void;
  className?: string;
}

export function ChatInput({ onSend, disabled, onImages, className }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || disabled) return;
    // Only clear the composer when the send was actually accepted — if the
    // PTY socket isn't open, onSend returns false and we keep the text so
    // the user can retry instead of losing their message.
    const accepted = onSend(text);
    if (accepted !== false) setValue("");
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  };

  const handleDragOver = (e: DragEvent) => {
    if (!transferMayContainImage(e.dataTransfer)) return;
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = (e: DragEvent) => {
    const files = imageFilesFromTransfer(e.dataTransfer);
    if (!files.length) return;
    e.preventDefault();
    setDragging(false);
    onImages?.(files);
  };

  const handlePickImage = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) onImages?.(files);
  };

  return (
    <div
      className={cn(
        "relative flex items-end gap-2 rounded-lg border border-border/70 bg-secondary/20 p-2",
        dragging && "border-primary/60 bg-primary/5",
        className,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <label
        htmlFor="chat-input-image"
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-secondary/60 hover:text-text-secondary"
        title="Attach image"
      >
        <ImagePlus className="size-4" />
        <input
          id="chat-input-image"
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={handlePickImage}
        />
      </label>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={1}
        placeholder="Message hermes… (Enter to send, Shift+Enter for a new line)"
        className={cn(
          "max-h-40 min-h-8 flex-1 resize-none bg-transparent px-1 py-1.5",
          "text-sm leading-relaxed text-foreground outline-none",
          "placeholder:text-text-tertiary disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />

      <button
        type="button"
        onClick={submit}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
          "bg-primary text-primary-foreground",
          "hover:bg-primary/90",
          "disabled:cursor-not-allowed disabled:opacity-40",
        )}
      >
        <Send className="size-4" />
      </button>
    </div>
  );
}
