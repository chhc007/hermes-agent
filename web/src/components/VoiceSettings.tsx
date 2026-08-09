/**
 * VoiceSettings — popover panel for voice mode preferences.
 *
 * Mirrors the ChatGPT voice-mode concept but for the Hermes chat view:
 *   - master switch (voice input on/off)
 *   - send mode: auto (send transcript immediately) vs confirm (fill composer)
 *   - voice reply: speak assistant replies aloud via server TTS
 */

import { Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  STT_PROVIDERS,
  loadVoiceSettings,
  saveVoiceSettings,
  type VoiceSettings as VoiceSettingsT,
} from "@/lib/voiceMode";

interface VoiceSettingsProps {
  settings: VoiceSettingsT;
  onChange: (settings: VoiceSettingsT) => void;
  className?: string;
}

export function VoiceSettings({ settings, onChange, className }: VoiceSettingsProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  const update = (patch: Partial<VoiceSettingsT>) => {
    const next = { ...settings, ...patch };
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
          className="absolute bottom-10 right-0 z-50 w-64 rounded-lg border border-border/70 bg-background/95 p-3 shadow-lg backdrop-blur"
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

          {/* Voice reply */}
          <label className="flex cursor-pointer items-center justify-between gap-2 py-1.5 text-sm text-foreground/90">
            <span>{t.voice.voiceReply}</span>
            <input
              type="checkbox"
              checked={settings.voiceReply}
              onChange={(e) => update({ voiceReply: e.target.checked })}
              className="size-3.5 accent-primary"
            />
          </label>

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
