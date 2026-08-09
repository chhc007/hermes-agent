/**
 * VoiceButton — ChatGPT-style mic button in the chat composer.
 *
 * Click to start recording (user's browser mic). A live audio-level meter
 * animates while recording; VAD (silence detection) stops recording
 * automatically once the user stops speaking. The transcript is then either
 * sent immediately (sendMode "auto") or handed to the parent to fill the
 * composer (sendMode "confirm").
 */

import { Mic, MicOff, Square, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  VoiceRecorder,
  transcribeAudio,
  type SttProvider,
  type VoiceRecorderState,
} from "@/lib/voiceMode";

interface VoiceButtonProps {
  /** Master switch (from settings). */
  enabled: boolean;
  /** STT provider override passed to the transcribe API. */
  sttProvider?: SttProvider;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  className?: string;
}

export function VoiceButton({
  enabled,
  sttProvider,
  onTranscript,
  onError,
  className,
}: VoiceButtonProps) {
  const { t } = useI18n();
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const stateRef = useRef<VoiceRecorderState>("idle");

  const setStateBoth = (s: VoiceRecorderState) => {
    stateRef.current = s;
    setState(s);
  };

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      recorderRef.current = null;
    };
  }, []);

  const handleError = (message: string) => {
    setStateBoth("error");
    onError?.(message);
    // Reset back to idle shortly so the button is usable again.
    window.setTimeout(() => setStateBoth("idle"), 1800);
  };

  const startRecording = async () => {
    if (!enabled) return;
    setStateBoth("requesting");
    const recorder = new VoiceRecorder(
      (lvl) => setLevel(lvl),
      (blob) => {
        // VAD stopped the recording — transcribe.
        setStateBoth("transcribing");
        void (async () => {
          try {
            const { transcript } = await transcribeAudio(blob, sttProvider);
            if (transcript) {
              onTranscript(transcript);
            } else {
              handleError(t.voice.noSpeech);
              return;
            }
            setStateBoth("idle");
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            handleError(msg);
          }
        })();
      },
      (err) => handleError(err.message),
    );
    recorderRef.current = recorder;
    try {
      await recorder.start();
      setStateBoth("recording");
      setLevel(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      handleError(msg);
      recorderRef.current = null;
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    // VAD or manual stop triggers the onStop transcription path.
  };

  const busy = state === "requesting" || state === "transcribing";
  const recording = state === "recording";

  const handleClick = () => {
    if (busy) return;
    if (recording) {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  const ariaLabel = recording
    ? t.voice.stopRecording
    : busy
      ? t.voice.transcribing
      : t.voice.startRecording;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!enabled || busy}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
        recording
          ? "bg-red-500/90 text-white hover:bg-red-500"
          : "text-text-tertiary hover:bg-secondary/60 hover:text-text-secondary",
        (!enabled || busy) && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {recording && (
        <span
          className="absolute inset-0 animate-ping rounded-md bg-red-500/30"
          aria-hidden
        />
      )}
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : recording ? (
        <Square className="size-3.5" />
      ) : enabled ? (
        <Mic className="size-4" />
      ) : (
        <MicOff className="size-4" />
      )}
      {recording && (
        <span
          className="absolute inset-x-1 bottom-0.5 h-0.5 overflow-hidden rounded-full bg-white/40"
          aria-hidden
        >
          <span
            className="block h-full bg-white transition-[width] duration-75"
            style={{ width: `${Math.min(100, Math.max(8, level * 260))}%` }}
          />
        </span>
      )}
    </button>
  );
}
