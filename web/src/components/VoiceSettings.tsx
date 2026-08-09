/**
 * VoiceSettings — modal dialog for voice mode preferences.
 *
 * Centered modal (fixed overlay + flex-center) so it renders correctly on
 * every platform/breakpoint — the old absolutely-positioned popover kept
 * overflowing the viewport on desktop (v1.8.4). Mirrors the ChatGPT
 * voice-mode concept but for the Hermes chat view:
 *   - master switch (voice input on/off; since v1.7.28 voice REPLY is bound
 *     to this switch — enabling input also reads replies aloud)
 *   - send mode: auto (send transcript immediately) vs confirm (fill composer)
 *   - STT/TTS provider + speech speed
 */

import { Settings2, X } from "lucide-react";
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

  // Close on Escape — the modal's own scrim click closes too.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t.voice.settings}
        title={t.voice.settings}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-secondary/60 hover:text-text-secondary",
          open && "bg-secondary/60 text-text-secondary",
          className,
        )}
      >
        <Settings2 className="size-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
          data-slot="voice-settings-backdrop"
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t.voice.settingsTitle}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-border/70 bg-background p-4 shadow-xl"
            data-slot="voice-settings-panel"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium text-foreground">
                {t.voice.settingsTitle}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.voice.settingsClose ?? "Close voice settings"}
                className="flex size-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-secondary/60 hover:text-text-secondary"
              >
                <X className="size-4" />
              </button>
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
        </div>
      )}
    </>
  );
}

export function loadVoiceSettingsForPanel(): VoiceSettingsT {
  return loadVoiceSettings();
}
