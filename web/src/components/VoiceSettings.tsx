/**
 * VoiceSettings — popover panel for voice mode preferences.
 *
 * Mirrors the ChatGPT voice-mode concept but for the Hermes chat view:
 *   - master switch (voice input on/off; since v1.7.28 voice REPLY is bound
 *     to this switch — enabling input also reads replies aloud)
 *   - send mode: auto (send transcript immediately) vs confirm (fill composer)
 *   - STT/TTS provider + speech speed
 */

import { Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  STT_PROVIDERS,
  TTS_PROVIDERS,
  loadVoiceSettings,
  saveVoiceSettings,
  type VoiceSettings as VoiceSettingsT,
} from "@/lib/voiceMode";

interface VoiceSettingsProps {
  settings: VoiceSettingsT;
  onChange: (settings: VoiceSettingsT) => void;
  className?: string;
}

/** Speech-speed options shown in the settings panel (multipliers). */
export const TTS_SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;

export function VoiceSettings({ settings, onChange, className }: VoiceSettingsProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Which side of the trigger the panel expands toward, plus a width cap so
  // the panel never runs off the viewport on narrow phones.
  const [panelPlacement, setPanelPlacement] = useState<{
    left?: number;
    maxWidth?: number;
  }>({});

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // The panel is absolutely positioned relative to the (narrow) trigger
  // button. Compute the panel's desired VIEWPORT left, clamp it to keep the
  // whole panel on screen (both edges, phones AND desktops), then convert to
  // a RELATIVE offset from the button container for style.left. Re-measure
  // on resize so a window change while the panel is open re-clamps it.
  // (v1.7.32)
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const measure = () => {
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const PANEL_W = 256;
      // Desired: right-aligned to the button (expands leftward). If that
      // would overflow the left edge, expand rightward instead. Then clamp
      // both edges so the whole panel stays inside the viewport.
      let left = rect.right - PANEL_W;
      let maxWidth: number | undefined;
      if (left < 8) {
        left = rect.left;
      }
      if (left + PANEL_W > vw - 8) {
        // Right edge would overflow — clamp width (and re-clamp left so the
        // narrowed panel still sits against the button).
        maxWidth = Math.max(200, vw - 8 - left - 8);
        left = Math.min(left, vw - 8 - (maxWidth ?? PANEL_W) - 8);
      }
      if (left < 8) left = 8;
      // Convert viewport left → offset relative to the button container.
      const relativeLeft = left - rect.left;
      setPanelPlacement({ left: relativeLeft, maxWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [open]);

  const update = (patch: Partial<VoiceSettingsT>) => {
    const next = { ...settings, ...patch };
    // v1.7.28: voice reply is bound to the master switch — enabling voice
    // input also enables spoken replies, and disabling it turns both off.
    next.voiceReply = next.enabled;
    onChange(next);
    saveVoiceSettings(next);
  };

  return (
    <div ref={panelRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t.voice.settings}
        title={t.voice.settings}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-secondary/60 hover:text-text-secondary",
          open && "bg-secondary/60 text-text-secondary",
        )}
      >
        <Settings2 className="size-4" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute bottom-10 z-50 w-64 rounded-lg border border-border/70 bg-background/95 p-3 shadow-lg backdrop-blur",
            "max-h-[55vh] overflow-y-auto",
          )}
          style={{
            left: panelPlacement.left,
            maxWidth: panelPlacement.maxWidth,
          }}
          data-slot="voice-settings-panel"
        >
          <div className="mb-2 text-xs font-medium text-foreground">
            {t.voice.settingsTitle}
          </div>

          {/* Master switch */}
          <label className="flex cursor-pointer items-center justify-between gap-2 py-1.5 text-sm text-foreground/90">
            <span>{t.voice.enableVoice}</span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="size-3.5 accent-primary"
            />
          </label>

          {/* Send mode */}
          <label className="flex cursor-pointer items-center justify-between gap-2 py-1.5 text-sm text-foreground/90">
            <span>{t.voice.autoSend}</span>
            <input
              type="checkbox"
              checked={settings.sendMode === "auto"}
              onChange={(e) =>
                update({ sendMode: e.target.checked ? "auto" : "confirm" })
              }
              className="size-3.5 accent-primary"
            />
          </label>

          {/* Voice reply — bound to the master switch (v1.7.28): turning
              voice input on also reads replies aloud. No separate toggle. */}
          <div className="flex items-center justify-between gap-2 py-1.5 text-sm text-foreground/90">
            <span>{t.voice.voiceReply}</span>
            <span className="text-xs text-muted-foreground/80">
              {settings.enabled ? t.voice.replyOn : t.voice.replyOff}
            </span>
          </div>

          {/* STT provider switcher */}
          <div className="flex items-center justify-between gap-2 py-1.5 text-sm text-foreground/90">
            <span>{t.voice.sttProvider}</span>
            <select
              value={settings.sttProvider}
              onChange={(e) =>
                update({ sttProvider: e.target.value as VoiceSettingsT["sttProvider"] })
              }
              className="max-w-40 rounded border border-border/60 bg-background px-1.5 py-0.5 text-xs text-foreground outline-none"
            >
              {STT_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* TTS provider switcher */}
          <div className="flex items-center justify-between gap-2 py-1.5 text-sm text-foreground/90">
            <span>{t.voice.ttsProvider}</span>
            <select
              value={settings.ttsProvider}
              onChange={(e) =>
                update({ ttsProvider: e.target.value as VoiceSettingsT["ttsProvider"] })
              }
              className="max-w-40 rounded border border-border/60 bg-background px-1.5 py-0.5 text-xs text-foreground outline-none"
            >
              {TTS_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Speech speed */}
          <div className="flex items-center justify-between gap-2 py-1.5 text-sm text-foreground/90">
            <span>{t.voice.ttsSpeed}</span>
            <select
              value={String(settings.ttsSpeed)}
              onChange={(e) => update({ ttsSpeed: Number(e.target.value) })}
              className="max-w-24 rounded border border-border/60 bg-background px-1.5 py-0.5 text-xs text-foreground outline-none"
            >
              {TTS_SPEED_OPTIONS.map((s) => (
                <option key={s} value={String(s)}>
                  {s}x
                </option>
              ))}
            </select>
          </div>

          <div className="mt-2 border-t border-border/60 pt-2 text-xs leading-relaxed text-muted-foreground/80">
            {t.voice.settingsHint}
          </div>
        </div>
      )}
    </div>
  );
}

export function loadVoiceSettingsForPanel(): VoiceSettingsT {
  return loadVoiceSettings();
}
