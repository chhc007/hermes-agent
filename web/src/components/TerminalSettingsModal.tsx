/**
 * TerminalSettingsModal — centered modal for customising the embedded xterm
 * appearance (background / foreground colour, font size).
 *
 * Values persist to localStorage (`hermes.terminal.settings.v1`) and are
 * applied live to the Terminal instance by ChatPage via onApply. Following the
 * established modal convention: fixed centered panel, scrim click / ✕ /
 * Escape to close, panel click does not bubble.
 */

import { Check, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

export interface TerminalAppearance {
  background: string;
  foreground: string;
  fontSize: number;
}

export const DEFAULT_TERMINAL_APPEARANCE: TerminalAppearance = {
  background: "#000000",
  foreground: "#f0e6d2",
  fontSize: 14,
};

const STORAGE_KEY = "hermes.terminal.settings.v1";
const FONT_MIN = 11;
const FONT_MAX = 22;

/** Parse a hex string (#rgb / #rrggbb) into #rrggbb, or null. */
function normalizeHex(value: string): string | null {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return (
      "#" +
      v
        .slice(1)
        .split("")
        .map((c) => c + c)
        .join("")
        .toLowerCase()
    );
  }
  return null;
}

export function loadTerminalAppearance(): TerminalAppearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TERMINAL_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<TerminalAppearance>;
    const bg = normalizeHex(parsed.background ?? "");
    const fg = normalizeHex(parsed.foreground ?? "");
    const size = Number(parsed.fontSize);
    return {
      background: bg ?? DEFAULT_TERMINAL_APPEARANCE.background,
      foreground: fg ?? DEFAULT_TERMINAL_APPEARANCE.foreground,
      fontSize: Number.isFinite(size)
        ? Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(size)))
        : DEFAULT_TERMINAL_APPEARANCE.fontSize,
    };
  } catch {
    return DEFAULT_TERMINAL_APPEARANCE;
  }
}

export function saveTerminalAppearance(appearance: TerminalAppearance): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // storage unavailable — non-fatal
  }
}

/** A small preset palette for quick picks. */
const BG_PRESETS = [
  "#000000",
  "#0d1117",
  "#1c1729",
  "#1e1e2e",
  "#282a36",
  "#101418",
];
const FG_PRESETS = [
  "#f0e6d2",
  "#d6d0ea",
  "#cdd6f4",
  "#e6e6e6",
  "#a6e3a1",
  "#ffffff",
];

interface TerminalSettingsModalProps {
  open: boolean;
  initial: TerminalAppearance;
  onClose: () => void;
  onApply: (appearance: TerminalAppearance) => void;
}

export function TerminalSettingsModal({
  open,
  initial,
  onClose,
  onApply,
}: TerminalSettingsModalProps) {
  const { t } = useI18n();
  const [bgText, setBgText] = useState(initial.background);
  const [fgText, setFgText] = useState(initial.foreground);
  const [fontSize, setFontSize] = useState(initial.fontSize);
  const [saved, setSaved] = useState(false);

  // Seed the form when the modal opens. Deliberately NOT re-run on `initial`
  // changes: live preview (onApply) updates `initial` on every keystroke, and
  // re-seeding would wipe the user's in-progress typing.
  useEffect(() => {
    if (!open) return;
    setBgText(initial.background);
    setFgText(initial.foreground);
    setFontSize(initial.fontSize);
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const bgHex = normalizeHex(bgText);
  const fgHex = normalizeHex(fgText);
  const valid = bgHex !== null && fgHex !== null;

  // Build the current form value (only valid when both colours parse).
  const buildAppearance = (): TerminalAppearance | null => {
    if (!valid) return null;
    return {
      background: bgHex!,
      foreground: fgHex!,
      fontSize: Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(fontSize))),
    };
  };

  // Live preview: apply colour/font changes to the terminal immediately while
  // the modal is open — the user sees the effect without hitting Save first.
  // Takes the in-flight input values directly (setState is async, so reading
  // state right after an onChange would preview the previous value).
  const previewAppearance = useCallback(
    (next: { background?: string; foreground?: string; fontSize?: number }) => {
      const bg = normalizeHex(next.background ?? bgText);
      const fg = normalizeHex(next.foreground ?? fgText);
      const size = next.fontSize ?? fontSize;
      if (!bg || !fg) return;
      onApply({
        background: bg,
        foreground: fg,
        fontSize: Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(size))),
      });
    },
    [bgText, fgText, fontSize, onApply],
  );

  // Auto-save on any close path (Save button, ✕, scrim, Escape) so changing
  // a colour and dismissing the modal never loses the value. Save just adds
  // the explicit "saved" feedback + a short delay.
  const persistAndClose = useCallback(() => {
    const appearance = buildAppearance();
    if (appearance) {
      saveTerminalAppearance(appearance);
      onApply(appearance);
    }
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgText, fgText, fontSize, valid, onClose, onApply]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") persistAndClose();
    },
    [persistAndClose],
  );
  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, handleEscape]);

  if (!open) return null;

  const handleSave = () => {
    const appearance = buildAppearance();
    if (!appearance) return;
    saveTerminalAppearance(appearance);
    onApply(appearance);
    setSaved(true);
    window.setTimeout(onClose, 450);
  };

  const handleReset = () => {
    const d = DEFAULT_TERMINAL_APPEARANCE;
    setBgText(d.background);
    setFgText(d.foreground);
    setFontSize(d.fontSize);
    saveTerminalAppearance(d);
    onApply(d);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={persistAndClose}
      role="dialog"
      aria-modal="true"
      aria-label="Terminal appearance settings"
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border/60 bg-background-base p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-display text-sm tracking-wider text-text-secondary">
            Terminal appearance
          </span>
          <button
            type="button"
            onClick={persistAndClose}
            aria-label="Close terminal settings"
            className="rounded p-1 text-text-tertiary hover:bg-secondary/60 hover:text-text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Background */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs text-text-secondary">
              Background colour
            </label>
            <span className="font-mono text-[0.625rem] text-text-tertiary">
              {bgHex ?? "invalid"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={bgHex ?? "#000000"}
              onChange={(e) => {
                setBgText(e.target.value);
                previewAppearance({ background: e.target.value });
              }}
              className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border/60 bg-transparent p-0.5"
              aria-label="Background colour picker"
            />
            <input
              type="text"
              value={bgText}
              onChange={(e) => {
                setBgText(e.target.value);
                previewAppearance({ background: e.target.value });
              }}
              placeholder="#000000"
              className={cn(
                "min-w-0 flex-1 rounded border bg-transparent px-2 py-1 font-mono text-xs outline-none",
                bgHex
                  ? "border-border/60 text-text-primary"
                  : "border-destructive/60 text-destructive",
              )}
              spellCheck={false}
            />
          </div>
          <div className="mt-1.5 flex gap-1">
            {BG_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setBgText(c)}
                aria-label={`Background ${c}`}
                className={cn(
                  "h-5 w-5 shrink-0 rounded border",
                  bgHex === c
                    ? "border-primary ring-1 ring-primary"
                    : "border-border/60",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Foreground */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs text-text-secondary">
              Text colour
            </label>
            <span className="font-mono text-[0.625rem] text-text-tertiary">
              {fgHex ?? "invalid"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={fgHex ?? "#f0e6d2"}
              onChange={(e) => {
                setFgText(e.target.value);
                previewAppearance({ foreground: e.target.value });
              }}
              className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border/60 bg-transparent p-0.5"
              aria-label="Text colour picker"
            />
            <input
              type="text"
              value={fgText}
              onChange={(e) => {
                setFgText(e.target.value);
                previewAppearance({ foreground: e.target.value });
              }}
              placeholder="#f0e6d2"
              className={cn(
                "min-w-0 flex-1 rounded border bg-transparent px-2 py-1 font-mono text-xs outline-none",
                fgHex
                  ? "border-border/60 text-text-primary"
                  : "border-destructive/60 text-destructive",
              )}
              spellCheck={false}
            />
          </div>
          <div className="mt-1.5 flex gap-1">
            {FG_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFgText(c)}
                aria-label={`Text ${c}`}
                className={cn(
                  "h-5 w-5 shrink-0 rounded border",
                  fgHex === c
                    ? "border-primary ring-1 ring-primary"
                    : "border-border/60",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Font size */}
        <div className="mb-5">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs text-text-secondary">Font size</label>
            <span className="font-mono text-[0.625rem] text-text-tertiary">
              {Math.round(fontSize)}px
            </span>
          </div>
          <input
            type="range"
            min={FONT_MIN}
            max={FONT_MAX}
            step={1}
            value={fontSize}
            onChange={(e) => {
              setFontSize(Number(e.target.value));
              previewAppearance({ fontSize: Number(e.target.value) });
            }}
            className="w-full accent-primary"
            aria-label="Terminal font size"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded border border-border/60 px-2.5 py-1.5 text-xs text-text-secondary hover:bg-secondary/40 hover:text-text-primary"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border/60 px-3 py-1.5 text-xs text-text-secondary hover:bg-secondary/40"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!valid}
              className={cn(
                "inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium",
                valid
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "cursor-not-allowed bg-secondary/40 text-text-tertiary",
              )}
            >
              {saved ? <Check className="h-3 w-3" /> : null}
              {saved ? "Saved" : t.common.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
