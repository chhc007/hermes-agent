/**
 * VoiceReply — speaks assistant replies aloud via the server TTS endpoint.
 *
 * When voiceReply is enabled, ChatPage feeds the assistant's final text here;
 * it synthesizes audio via POST /api/audio/speak (server-side TTS provider,
 * e.g. MiMo) and plays it through a hidden <audio> element. Clicking the
 * floating indicator stops playback.
 */

import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n";
import { cleanTextForSpeech, speakText } from "@/lib/voiceMode";

interface VoiceReplyProps {
  enabled: boolean;
  /** Text to speak; passing a new non-empty value triggers synthesis+play. */
  text: string;
  /** Monotonic counter so identical texts can be re-spoken. */
  runId: number;
  onError?: (message: string) => void;
}

export function VoiceReply({ enabled, text, runId, onError }: VoiceReplyProps) {
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

  useEffect(() => {
    if (!enabled || !text || runId === 0) return;
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
  }, [enabled, text, runId, onError, t.voice.replyError]);

  if (!enabled) return null;

  return (
    <button
      type="button"
      onClick={stopPlayback}
      aria-label={playing ? t.voice.stopReply : t.voice.replyActive}
      title={playing ? t.voice.stopReply : t.voice.replyActive}
      className="fixed bottom-20 right-4 z-50 flex size-9 items-center justify-center rounded-full border border-border/70 bg-background/90 text-text-secondary shadow-md backdrop-blur transition-colors hover:bg-secondary/60"
      data-slot="voice-reply-indicator"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : playing ? (
        <Volume2 className="size-4" />
      ) : (
        <VolumeX className="size-4" />
      )}
    </button>
  );
}
