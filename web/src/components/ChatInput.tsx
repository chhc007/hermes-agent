/**
 * ChatInput — the chat-view composer. A multi-line textarea (Enter sends,
 * Shift+Enter newline) with multi-file drag-drop / picker. Dropped or picked
 * files are staged as attachment chips above the textarea (removable), and
 * the user's typed text is delivered together with them via `onSend` — the
 * owner (ChatPage) uploads the bytes and embeds `@file:` references in the
 * next prompt.
 *
 * The parent (ChatPage) owns slash-command completion: it renders
 * SlashPopover above this component and passes the current input value via
 * `onInputChange` and a `completionActive` flag. When completion is active,
 * Enter/Tab/arrows are consumed by the popover instead of submitting.
 */

import { ImagePlus, Maximize2, Minimize2, Send, X } from "lucide-react";
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

import { filesFromTransfer, formatFileSize, transferHasFiles } from "@/lib/chatFileUpload";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { VoiceHoldButton, VoiceModeButton } from "@/components/VoiceButton";
import { VoiceReply } from "@/components/VoiceReply";
import { VoiceSettings } from "@/components/VoiceSettings";
import type { VoiceSettings as VoiceSettingsT } from "@/lib/voiceMode";

/** Stable per-file identity for dedupe (name/type/size/mtime). */
function fileKey(file: File): string {
  return `${file.name}\0${file.type}\0${file.size}\0${file.lastModified}`;
}

interface ChatInputProps {
  /**
   * Returns false (or a promise resolving false) when the message was NOT
   * accepted (e.g. PTY not connected, upload failed) — the composer keeps
   * text + attachments so the user can retry.
   */
  onSend: (
    text: string,
    attachments: File[],
  ) => boolean | void | Promise<boolean | void>;
  disabled?: boolean;
  /** Reports the current composer value so the parent can run completion. */
  onInputChange?: (value: string) => void;
  /**
   * Parent-owned completion keyboard hook (SlashPopover.handleKey). Called
   * first for every keydown; return true when the key was consumed.
   */
  onCompletionKey?: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  className?: string;
  /** Voice-mode settings (owned by ChatPage). */
  voiceSettings?: VoiceSettingsT;
  /** Called when the voice hold button produces a transcript. */
  onVoiceTranscript?: (text: string) => void;
  /** Called when voice settings change. */
  onVoiceSettingsChange?: (settings: VoiceSettingsT) => void;
  onVoiceError?: (message: string) => void;
  /** Voice-reply mute state (owned by ChatPage). */
  voiceMuted?: boolean;
  onToggleVoiceMuted?: () => void;
  /** Live-reply speech payload (owned by ChatPage's trigger effect). */
  voiceReplyText?: string;
  voiceReplyRun?: number;
}

export interface ChatInputHandle {
  focus: () => void;
  clear: () => void;
  setValue: (next: string) => void;
  /** Stage files from an external drop handler (ChatPage host capture). */
  appendFiles: (files: File[]) => void;
  clearAttachments: () => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    {
      onSend,
      disabled,
      onInputChange,
      onCompletionKey,
      className,
      voiceSettings,
      onVoiceTranscript,
      onVoiceSettingsChange,
      onVoiceError,
      voiceMuted,
      onToggleVoiceMuted,
      voiceReplyText,
      voiceReplyRun,
    },
    ref,
  ) {
    const [value, setValue] = useState("");
    const [attachments, setAttachments] = useState<File[]>([]);
    const [dragging, setDragging] = useState(false);
    // WeChat-style voice mode: the composer surface swaps to a hold-to-talk
    // button; clicking the mic toggle again returns to text input.
    const [voiceModeActive, setVoiceModeActive] = useState(false);
    // Expanded composer: user clicked the grow button for a taller editing
    // area. Auto-grow caps at GROW_LINE_CAP rows; beyond that we stop growing
    // and show a maximize button instead of letting the box swallow the page.
    const [expanded, setExpanded] = useState(false);
    const [needsGrow, setNeedsGrow] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const { t } = useI18n();

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
      clear: () => {
        setValue("");
        setAttachments([]);
      },
      setValue: (next: string) => {
        setValue(next);
        onInputChange?.(next);
      },
      appendFiles: (files: File[]) => {
        if (!files.length) return;
        setAttachments((prev) => {
          const seen = new Set(prev.map(fileKey));
          const fresh = files.filter((f) => !seen.has(fileKey(f)));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      },
      clearAttachments: () => setAttachments([]),
    }));

    const submit = useCallback(async () => {
      const text = value.trim();
      if ((!text && !attachments.length) || disabled) return;
      // Only clear the composer when the send was actually accepted — if the
      // PTY socket isn't open or the upload fails, onSend returns false and
      // we keep text + attachments so the user can retry.
      const accepted = await onSend(text, attachments);
      if (accepted !== false) {
        setValue("");
        setAttachments([]);
      }
    }, [value, attachments, disabled, onSend]);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Parent-owned completion popover gets first crack at keys it cares
      // about (arrows/Tab/Escape while visible). If it consumed the key,
      // don't also submit the composer.
      if (onCompletionKey?.(e)) return;

      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        void submit();
      }
    };

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      onInputChange?.(e.target.value);
    };

    const handleDragOver = (e: DragEvent) => {
      if (!transferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      setDragging(true);
    };

    const handleDragLeave = () => setDragging(false);

    const handleDrop = (e: DragEvent) => {
      const files = filesFromTransfer(e.dataTransfer);
      if (!files.length) return;
      e.preventDefault();
      setDragging(false);
      setAttachments((prev) => {
        const seen = new Set(prev.map(fileKey));
        const fresh = files.filter((f) => !seen.has(fileKey(f)));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    };

    const handlePickFile = (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (!files.length) return;
      setAttachments((prev) => {
        const seen = new Set(prev.map(fileKey));
        const fresh = files.filter((f) => !seen.has(fileKey(f)));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    };

    const removeAttachment = (index: number) => {
      setAttachments((prev) => prev.filter((_, i) => i !== index));
    };

    const voiceReady = voiceSettings && onVoiceTranscript && onVoiceSettingsChange;

    // In WeChat-style voice mode the whole composer is the hold-to-talk
    // surface — textarea, attachments and send are hidden.
    if (voiceModeActive && voiceReady) {
      return (
        <div
          className={cn(
            "relative flex flex-col gap-2 rounded-lg border border-border/70 bg-secondary/20 p-2",
            className,
          )}
        >
          <VoiceHoldButton
            enabled={voiceSettings.enabled}
            sttProvider={voiceSettings.sttProvider}
            onTranscript={onVoiceTranscript}
            onError={onVoiceError}
          />
          <div className="flex items-center gap-1.5">
            <VoiceModeButton
              enabled={voiceSettings.enabled}
              active
              onToggle={() => setVoiceModeActive(false)}
            />
            <VoiceSettings settings={voiceSettings} onChange={onVoiceSettingsChange} />
            <div className="ml-auto" />
            {voiceMuted !== undefined && onToggleVoiceMuted && (
              <VoiceReply
                enabled={voiceSettings.voiceReply}
                muted={voiceMuted}
                onToggleMuted={onToggleVoiceMuted}
                text={voiceReplyText ?? ""}
                runId={voiceReplyRun ?? 0}
                onError={onVoiceError}
              />
            )}
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "relative flex flex-col gap-1 rounded-lg border border-border/70 bg-secondary/20 p-2",
          dragging && "border-primary/60 bg-primary/5",
          className,
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {attachments.length > 0 && (
          <div
            className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto px-0.5 pt-0.5"
            data-slot="chat-input-attachments"
          >
            {attachments.map((file, index) => (
              <span
                key={fileKey(file)}
                className="group/att flex max-w-56 items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 py-1 pl-2 pr-1 text-xs text-foreground/90"
              >
                <span className="min-w-0">
                  <span className="block max-w-40 truncate font-medium">
                    {file.name}
                  </span>
                  <span className="block text-[0.65rem] leading-3 text-muted-foreground/70">
                    {formatFileSize(file.size)}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`${t.chat.removeAttachment} ${file.name}`}
                  title={t.chat.removeAttachment}
                  onClick={() => removeAttachment(index)}
                  className="grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            placeholder={t.chat.inputPlaceholder}
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
              aria-label={expanded ? t.chat.collapseInput : t.chat.expandInput}
              title={expanded ? t.chat.collapseInput : t.chat.expandInput}
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
            onClick={() => void submit()}
            disabled={disabled || (!value.trim() && !attachments.length)}
            aria-label={t.chat.sendMessage}
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

        {/* Toolbar row — attachments / voice / settings / voice-reply live
            here so the composer row stays a single line even on narrow
            phones (placeholder + many buttons previously wrapped). */}
        <div className="flex items-center gap-1.5 border-t border-border/40 pt-1.5">
          <label
            htmlFor="chat-input-file"
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-secondary/60 hover:text-text-secondary"
            title={t.chat.attachFile}
          >
            <ImagePlus className="size-4" />
            <input
              id="chat-input-file"
              type="file"
              multiple
              className="sr-only"
              onChange={handlePickFile}
            />
          </label>

          {voiceReady && (
            <VoiceModeButton
              enabled={voiceSettings.enabled}
              active={false}
              onToggle={() => setVoiceModeActive(true)}
            />
          )}

          {voiceReady && (
            <VoiceSettings
              settings={voiceSettings}
              onChange={onVoiceSettingsChange}
            />
          )}

          {voiceMuted !== undefined &&
            onToggleVoiceMuted &&
            voiceSettings?.voiceReply && (
              <VoiceReply
                enabled={voiceSettings.voiceReply}
                muted={voiceMuted}
                onToggleMuted={onToggleVoiceMuted}
                text={voiceReplyText ?? ""}
                runId={voiceReplyRun ?? 0}
                onError={onVoiceError}
              />
            )}
        </div>
      </div>
    );
  },
);
