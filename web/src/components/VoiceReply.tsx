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
import { cleanTextForSpeech, speakText } from "@/lib/voiceMode";

interface VoiceReplyProps {
  /** Master switch (voiceSettings.voiceReply). */
  enabled: boolean;
  /** Muted state owned by ChatPage (floating-button toggle). */
  muted: boolean;
  /** Toggle mute on/off (called by the floating button). */
  onToggleMuted: () => void;
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
        const dataUrl = await speakText(speechText);
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
      className={
        "fixed bottom-20 right-4 z-50 flex size-9 items-center justify-center rounded-full border shadow-md backdrop-blur transition-colors " +
        (muted
          ? "border-border/60 bg-background/80 text-text-tertiary hover:bg-secondary/60"
          : "border-border/70 bg-background/90 text-text-secondary hover:bg-secondary/60")
      }
      data-slot="voice-reply-indicator"
      data-muted={muted ? "true" : "false"}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : muted || !playing ? (
        <VolumeX className="size-4" />
      ) : (
        <Volume2 className="size-4" />
      )}
    </button>
  );
}
