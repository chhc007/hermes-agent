/**
 * VoiceModeButton + VoiceHoldButton — WeChat-style voice input.
 *
 * - VoiceModeButton: small mic icon beside the composer. Clicking enters
 *   voice mode (the composer surface swaps to a big hold-to-talk button) or
 *   exits back to text input.
 * - VoiceHoldButton: the big button shown while voice mode is active. Hold
 *   to record; slide UP into the cancel zone (shown as "松开 取消") and
 *   release to DISCARD; release anywhere else to transcribe + send.
 *
 * Both share the VoiceRecorder (cancel() discards, stop() transcribes).
 */

import { Mic, MicOff, Square, Loader2, Keyboard } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  VoiceRecorder,
  transcribeAudio,
  type SttProvider,
} from "@/lib/voiceMode";

type HoldState = "idle" | "requesting" | "recording" | "cancelling" | "transcribing";

interface BaseProps {
  enabled: boolean;
  sttProvider?: SttProvider;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
}

// ── Mode toggle button (small mic icon) ───────────────────────────────

interface VoiceModeButtonProps {
  enabled: boolean;
  active: boolean;
  onToggle: () => void;
  className?: string;
}

export function VoiceModeButton({
  enabled,
  active,
  onToggle,
  className,
}: VoiceModeButtonProps) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!enabled}
      aria-label={active ? t.voice.exitVoiceMode : t.voice.enterVoiceMode}
      title={active ? t.voice.exitVoiceMode : t.voice.enterVoiceMode}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-text-tertiary hover:bg-secondary/60 hover:text-text-secondary",
        !enabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {active ? <Keyboard className="size-4" /> : <Mic className="size-4" />}
    </button>
  );
}

// ── Hold-to-talk button (voice-mode surface) ─────────────────────────

interface VoiceHoldButtonProps extends BaseProps {
  /** Cancel-zone distance above the button (px). */
  cancelDistance?: number;
}

export function VoiceHoldButton({
  enabled,
  sttProvider,
  onTranscript,
  onError,
  cancelDistance = 72,
}: VoiceHoldButtonProps) {
  const { t } = useI18n();
  const [state, setState] = useState<HoldState>("idle");
  const [level, setLevel] = useState(0);
  const stateRef = useRef<HoldState>("idle");
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const startYRef = useRef(0);
  const suppressClickRef = useRef(false);

  const setStateBoth = (s: HoldState) => {
    stateRef.current = s;
    setState(s);
  };

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      recorderRef.current = null;
    };
  }, []);

  const handleError = useCallback(
    (message: string) => {
      setStateBoth("idle");
      onError?.(message);
    },
    [onError],
  );

  const beginHold = async (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!enabled || stateRef.current !== "idle") return;
    suppressClickRef.current = true;
    startYRef.current = e.clientY;
    setStateBoth("requesting");
    const recorder = new VoiceRecorder(
      (lvl) => setLevel(lvl),
      (blob) => {
        // Released (not cancelled) — transcribe.
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
      // Hold-to-talk: VAD disabled (release ends the recording).
      await recorder.start(/* vadEnabled */ false);
      setStateBoth("recording");
      setLevel(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      handleError(msg);
      recorderRef.current = null;
    }
  };

  const moveHold = (e: React.PointerEvent<HTMLButtonElement>) => {
    const cur = stateRef.current;
    if (cur !== "recording" && cur !== "cancelling") return;
    const dy = startYRef.current - e.clientY;
    if (dy > cancelDistance) {
      if (cur !== "cancelling") setStateBoth("cancelling");
    } else if (cur === "cancelling") {
      setStateBoth("recording");
    }
  };

  const endHold = () => {
    const was = stateRef.current;
    if (was === "requesting" || was === "transcribing") return;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) return;
    if (was === "cancelling") {
      recorder.cancel(); // discard — onstop skips transcribe
      setStateBoth("idle");
      setLevel(0);
    } else if (was === "recording") {
      recorder.stop(); // → onstop → transcribe → send
    }
  };

  const recording = state === "recording" || state === "cancelling";

  const label =
    state === "transcribing"
      ? t.voice.transcribing
      : state === "cancelling"
        ? t.voice.releaseToCancel
        : recording
          ? t.voice.releaseToSend
          : t.voice.holdToTalk;

  return (
    <button
      type="button"
      onPointerDown={beginHold}
      onPointerMove={moveHold}
      onPointerUp={endHold}
      onPointerLeave={endHold}
      disabled={!enabled}
      aria-label={label}
      title={label}
      className={cn(
        "relative flex h-14 w-full select-none items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors",
        state === "cancelling"
          ? "border-red-500/60 bg-red-500/10 text-red-500"
          : recording
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-border/70 bg-secondary/40 text-foreground/90 hover:bg-secondary/60",
        state === "requesting" && "opacity-60",
      )}
    >
      {state === "requesting" || state === "transcribing" ? (
        <Loader2 className="size-4 animate-spin" />
      ) : recording ? (
        <Square className="size-3.5" />
      ) : (
        <Mic className="size-4" />
      )}
      {label}
      {recording && (
        <span className="absolute inset-x-2 bottom-1 h-0.5 overflow-hidden rounded-full bg-current/30" aria-hidden>
          <span
            className="block h-full bg-current transition-[width] duration-75"
            style={{ width: `${Math.min(100, Math.max(8, level * 220))}%` }}
          />
        </span>
      )}
    </button>
  );
}

export { MicOff as MicOffIcon };
