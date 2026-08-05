/**
 * ChatInput — the chat-view composer. A multi-line textarea (Enter sends,
 * Shift+Enter newline) with image paste / drag-drop. Text is delivered via
 * `onSend`; image bytes are uploaded by ChatPage through the existing
 * chatImagePaste path and attached to the running session.
 *
 * The parent (ChatPage) owns slash-command completion: it renders
 * SlashPopover above this component and passes the current input value via
 * `onInputChange` and a `completionActive` flag. When completion is active,
 * Enter/Tab/arrows are consumed by the popover instead of submitting.
 */

import { ImagePlus, Maximize2, Minimize2, Send } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
  /** Reports the current composer value so the parent can run completion. */
  onInputChange?: (value: string) => void;
  /**
   * Parent-owned completion keyboard hook (SlashPopover.handleKey). Called
   * first for every keydown; return true when the key was consumed.
   */
  onCompletionKey?: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  className?: string;
}

export interface ChatInputHandle {
  focus: () => void;
  clear: () => void;
  setValue: (next: string) => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    { onSend, disabled, onImages, onInputChange, onCompletionKey, className },
    ref,
  ) {
    const [value, setValue] = useState("");
    const [dragging, setDragging] = useState(false);
    // Expanded composer: user clicked the grow button for a taller editing
    // area. Auto-grow caps at GROW_LINE_CAP rows; beyond that we stop growing
    // and show a maximize button instead of letting the box swallow the page.
    const [expanded, setExpanded] = useState(false);
    const [needsGrow, setNeedsGrow] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Auto-grow the textarea with content. Line height is ~1.25rem (text-sm
    // leading-relaxed); GROW_LINE_CAP rows ≈ 6 lines before we switch to the
    // maximize affordance.
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      const scrollH = el.scrollHeight;
      const cap = expanded ? Math.round(window.innerHeight * 0.4) : 6 * 24;
      el.style.height = `${Math.min(scrollH, cap)}px`;
      setNeedsGrow(scrollH > 6 * 24);
    }, [value, expanded]);

    // Expose focus/clear/setValue to the parent (completion apply, clearing).
    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      clear: () => setValue(""),
      setValue: (next: string) => {
        setValue(next);
        onInputChange?.(next);
      },
    }));

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
      // Parent-owned completion popover gets first crack at keys it cares
      // about (arrows/Tab/Escape while visible). If it consumed the key,
      // don't also submit the composer.
      if (onCompletionKey?.(e)) return;

      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        submit();
      }
    };

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      onInputChange?.(e.target.value);
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
            "min-h-8 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-1.5",
            "text-sm leading-relaxed text-foreground outline-none",
            "placeholder:text-text-tertiary disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />

        {needsGrow && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? "Collapse input" : "Expand input"}
            title={expanded ? "Collapse input" : "Expand input"}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-secondary/60 hover:text-text-secondary"
          >
            {expanded ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </button>
        )}

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
  },
);
