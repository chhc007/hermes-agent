/**
 * VoiceReply — speaks assistant replies aloud via the server TTS endpoint.
 *
 * When voiceReply is enabled (and not muted), ChatPage feeds the assistant's
 * final text here; it synthesizes audio via POST /api/audio/speak
 * (server-side TTS provider, e.g. MiMo) and plays it through a hidden
 * <audio> element.
 *
 * The floating indicator is a MUTE TOGGLE, not just a stop button: clicking
 * it silences the current playback AND suppresses future live replies until
 * clicked again (recovering from mute). ChatPage owns the `muted` state so
 * its speech-trigger effect can consult it.
 */

import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  cleanTextForSpeech,
  speakText,
  type TtsProvider,
} from "@/lib/voiceMode";

interface VoiceReplyProps {
  /** Master switch (voiceSettings.voiceReply). */
  enabled: boolean;
  /** Muted state owned by ChatPage (floating-button toggle). */
  muted: boolean;
  /** Toggle mute on/off (called by the floating button). */
  onToggleMuted: () => void;
  /** TTS provider override (voice settings). */
  ttsProvider?: TtsProvider;
  /** Playback speed multiplier (voice settings, 1.0 = normal). */
  ttsSpeed?: number;
  /** Text to speak; passing a new non-empty value triggers synthesis+play. */
  text: string;
  /** Monotonic counter so identical texts can be re-spoken. */
  runId: number;
  onError?: (message: string) => void;
}

export function VoiceReply({
  enabled,
  muted,
  onToggleMuted,
  ttsProvider,
  ttsSpeed,
  text,
  runId,
  onError,
}: VoiceReplyProps) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const currentRun = useRef(0);

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
    setBusy(false);
  }, []);

  useEffect(() => {
    return () => stopPlayback();
  }, [stopPlayback]);

  // Muting stops playback immediately; unmuting does NOT replay the current
  // message (the next live reply triggers speech again).
  useEffect(() => {
    if (muted) stopPlayback();
  }, [muted, stopPlayback]);

  useEffect(() => {
    if (!enabled || muted || !text || runId === 0) return;
    if (runId === currentRun.current) return; // already handled
    currentRun.current = runId;
    setBusy(true);
    void (async () => {
      try {
        const speechText = cleanTextForSpeech(text);
        if (!speechText) {
          setBusy(false);
          return;
        }
        const dataUrl = await speakText(speechText, ttsProvider, ttsSpeed);
        if (currentRun.current !== runId) return; // superseded
        audioRef.current?.pause();
        const audio = new Audio(dataUrl);
        audioRef.current = audio;
        audio.onplay = () => {
          setBusy(false);
          setPlaying(true);
        };
        audio.onended = () => {
          setPlaying(false);
          audioRef.current = null;
        };
        audio.onerror = () => {
          setBusy(false);
          setPlaying(false);
          audioRef.current = null;
          onError?.(t.voice.replyError);
        };
        await audio.play();
      } catch (err) {
        if (currentRun.current !== runId) return;
        setBusy(false);
        onError?.(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [enabled, muted, text, runId, onError, t.voice.replyError]);

  if (!enabled) return null;

  const label = muted
    ? t.voice.unmuteReply
    : playing
      ? t.voice.muteReply
      : t.voice.replyReady;

  return (
    <button
      type="button"
      onClick={onToggleMuted}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
        muted
          ? // Muted: red slash icon + tinted background — clearly distinct.
            "bg-red-500/10 text-red-500 hover:bg-red-500/20"
          : playing
            ? "bg-primary/15 text-primary animate-pulse"
            : "text-text-tertiary hover:bg-secondary/60 hover:text-text-secondary",
      )}
      data-slot="voice-reply-indicator"
      data-muted={muted ? "true" : "false"}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : muted ? (
        <VolumeX className="size-4" />
      ) : (
        <Volume2 className="size-4" />
      )}
    </button>
  );
}
