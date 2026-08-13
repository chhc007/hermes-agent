/**
 * TerminalInputBar — a composer docked below the xterm terminal.
 *
 * Multi-line textarea (Enter sends, Shift+Enter newline) plus a send / stop
 * button (Send while idle, Stop while a turn is running) and a file-picker
 * button. Picked files are staged as removable chips, uploaded by the owner
 * (ChatPage) via /api/chat/files-upload, and embedded as `@file:<path>`
 * references in the next message sent into the PTY.
 *
 * Deliberately standalone: no voice, no slash completion — the terminal is
 * the primary surface, this bar is a convenience editor.
 */

import { ImagePlus, Paperclip, Send, Square, X } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import { formatFileSize } from "@/lib/chatFileUpload";
import { cn } from "@/lib/utils";

export interface TerminalInputBarHandle {
  focus: () => void;
  clear: () => void;
}

interface TerminalInputBarProps {
  /** Called when the user sends. Returns false (or Promise<false>) when not
   *  accepted (e.g. PTY not connected, upload failed) — keeps text + files. */
  onSend: (text: string, attachments: File[]) => boolean | void | Promise<boolean | void>;
  /** True while the agent is running: send button becomes Stop. */
  running?: boolean;
  /** Called when the running-state Stop button is clicked. */
  onStop?: () => void;
  disabled?: boolean;
  className?: string;
}

const GROW_LINE_CAP = 6;

export const TerminalInputBar = forwardRef<
  TerminalInputBarHandle,
  TerminalInputBarProps
>(function TerminalInputBar(
  { onSend, running, onStop, disabled, className },
  ref,
) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-grow the textarea with content, capped at GROW_LINE_CAP lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, GROW_LINE_CAP * 20 + 16)}px`;
  }, [value]);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    clear: () => {
      setValue("");
      setAttachments([]);
    },
  }));

  const send = useCallback(async () => {
    const text = value.trim();
    if (!text && attachments.length === 0) return;
    const accepted = await onSend(text, attachments);
    if (accepted === false) return;
    setValue("");
    setAttachments([]);
    textareaRef.current?.focus();
  }, [attachments, onSend, value]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const addFiles = (files: File[]) => {
    if (!files.length) return;
    setAttachments((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}\0${f.size}\0${f.lastModified}`));
      const fresh = files.filter(
        (f) => !seen.has(`${f.name}\0${f.size}\0${f.lastModified}`),
      );
      return [...prev, ...fresh];
    });
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-1.5 border-t border-current/15 bg-background-base/95 px-2 pt-1.5 pb-2 sm:px-3",
        className,
      )}
    >
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((f, i) => (
            <span
              key={`${f.name}\0${f.size}\0${f.lastModified}`}
              className="inline-flex max-w-full items-center gap-1 rounded border border-border/60 bg-secondary/30 px-1.5 py-0.5 text-[0.6875rem] text-text-secondary"
            >
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-text-tertiary">
                {formatFileSize(f.size)}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                aria-label={`Remove ${f.name}`}
                className="shrink-0 rounded p-0.5 text-text-tertiary hover:bg-secondary/60 hover:text-text-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={
            running ? "Agent is working… (Stop to interrupt)" : "输入消息，Enter 发送，Shift+Enter 换行"
          }
          className={cn(
            "min-h-[2.25rem] min-w-0 flex-1 resize-none rounded-md border border-current/15 bg-background-base px-2.5 py-1.5 text-sm leading-5 text-text-primary outline-none placeholder:text-text-tertiary",
            "focus:border-primary/50",
            disabled && "cursor-not-allowed opacity-50",
          )}
        />

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onPick}
          aria-label="Attach files"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          aria-label="Attach files"
          title="附加文件"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-secondary/60 hover:text-text-secondary",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <ImagePlus className="h-4 w-4" />
        </button>

        {running ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            title="停止"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-destructive/15 text-destructive transition-colors hover:bg-destructive/25"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={disabled || (!value.trim() && attachments.length === 0)}
            aria-label="Send message"
            title="发送"
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity",
              disabled || (!value.trim() && attachments.length === 0)
                ? "cursor-not-allowed opacity-40"
                : "hover:opacity-90",
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
});
