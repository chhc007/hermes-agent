/**
 * voiceMode — Web voice input for the chat view.
 *
 * Architecture (independent of the official Hermes voice mode, which is
 * bound to a server-side microphone):
 *
 *   Browser (user's mic) --MediaRecorder--> webm/opus blob
 *     --base64 data_url--> POST /api/audio/transcribe   (server: faster-whisper)
 *     <-- transcript text--
 *     --send as chat message (auto or confirm) --> Hermes replies
 *
 * TTS reply:  assistant text --> POST /api/audio/speak --> base64 audio --> <audio>
 *
 * Settings are persisted in localStorage so each user keeps their own
 * preference (voice on/off, send mode, voice reply on/off).
 */

import { fetchJSON } from "@/lib/api";

// ── Settings ──────────────────────────────────────────────────────────

export type VoiceSendMode = "auto" | "confirm";

/** STT provider options exposed in the voice settings switcher. */
export const STT_PROVIDERS = [
  { id: "local", label: "本地 (faster-whisper)" },
  { id: "mimo", label: "MiMo 云端" },
  { id: "groq", label: "Groq (需 key)" },
  { id: "openai", label: "OpenAI (需 key)" },
] as const;

export type SttProvider = (typeof STT_PROVIDERS)[number]["id"];

/** TTS provider options for the voice-reply switcher. */
export const TTS_PROVIDERS = [
  { id: "mimo", label: "MiMo (冰糖)" },
  { id: "edge", label: "Edge (中文晓晓)" },
  { id: "openai", label: "OpenAI (需 key)" },
  { id: "elevenlabs", label: "ElevenLabs (需 key)" },
] as const;

export type TtsProvider = (typeof TTS_PROVIDERS)[number]["id"];

export interface VoiceSettings {
  /** Master switch: whether the voice feature is available at all. */
  enabled: boolean;
  /** "auto" = send transcript immediately; "confirm" = fill composer, user presses send. */
  sendMode: VoiceSendMode;
  /** When true, assistant replies are spoken aloud via /api/audio/speak. */
  voiceReply: boolean;
  /** Which STT provider to use for transcription (per-request override). */
  sttProvider: SttProvider;
  /** Which TTS provider to use for spoken replies (per-request override). */
  ttsProvider: TtsProvider;
  /** Playback speed multiplier for spoken replies (0.25-4.0, 1.0 = normal). */
  ttsSpeed: number;
}

const SETTINGS_KEY = "hermes.voice.settings.v1";

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: true,
  sendMode: "auto",
  voiceReply: false,
  sttProvider: "local",
  ttsProvider: "mimo",
  ttsSpeed: 1.0,
};

/** Clamp a TTS speed value to the backend-supported range (0.25-4.0). */
export function clampTtsSpeed(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VOICE_SETTINGS.ttsSpeed;
  return Math.min(4.0, Math.max(0.25, n));
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_VOICE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    const sttProvider = STT_PROVIDERS.some((p) => p.id === parsed.sttProvider)
      ? (parsed.sttProvider as SttProvider)
      : DEFAULT_VOICE_SETTINGS.sttProvider;
    const ttsProvider = TTS_PROVIDERS.some((p) => p.id === parsed.ttsProvider)
      ? (parsed.ttsProvider as TtsProvider)
      : DEFAULT_VOICE_SETTINGS.ttsProvider;
    return {
      enabled: parsed.enabled ?? DEFAULT_VOICE_SETTINGS.enabled,
      sendMode: parsed.sendMode === "confirm" ? "confirm" : "auto",
      voiceReply: parsed.voiceReply ?? DEFAULT_VOICE_SETTINGS.voiceReply,
      sttProvider,
      ttsProvider,
      ttsSpeed: clampTtsSpeed(parsed.ttsSpeed),
    };
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* localStorage unavailable — settings are session-only */
  }
}

// ── Recording (MediaRecorder + VAD) ───────────────────────────────────

export type VoiceRecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "transcribing"
  | "error";

export interface VoiceTranscriptResult {
  transcript: string;
  provider: string | null;
}

/** Silence (VAD) tuning. */
const VAD_SILENCE_MS = 1200; // continuous silence before auto-stop
const VAD_RMS_THRESHOLD = 0.01; // below this RMS = silence
const MAX_RECORDING_MS = 60_000; // hard cap

/**
 * One-shot recorder: starts getUserMedia + MediaRecorder, watches the
 * analyser for silence, stops on silence (VAD), then returns the webm blob.
 * Caller must call stop() to abort early (e.g. component unmount).
 */
export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private silenceTimer: number | null = null;
  private maxTimer: number | null = null;
  private rafId: number | null = null;
  private _onLevel: ((level: number) => void) | null = null;
  private _onStop: ((blob: Blob, mimeType: string) => void) | null = null;
  private _onError: ((err: Error) => void) | null = null;
  private stopped = false;
  private cancelled = false;

  constructor(
    onLevel?: (level: number) => void,
    onStop?: (blob: Blob, mimeType: string) => void,
    onError?: (err: Error) => void,
  ) {
    this._onLevel = onLevel ?? null;
    this._onStop = onStop ?? null;
    this._onError = onError ?? null;
  }

  async start(vadEnabled = true): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("浏览器不支持麦克风访问（需 HTTPS 或 localhost）");
    }
    this.stopped = false;
    this.cancelled = false;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Prefer webm/opus (Chrome/Edge/Firefox); fall back to whatever is available.
    const mimeType = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : MediaRecorder.isTypeSupported("audio/ogg")
        ? "audio/ogg"
        : "";
    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);
    this.chunks = [];

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => {
      const type = this.mediaRecorder?.mimeType || mimeType || "audio/webm";
      const blob = new Blob(this.chunks, { type });
      this.cleanup();
      // Always transcribe on stop — manual stop (click), VAD auto-stop, and
      // the max-duration cap all funnel through here. (Do NOT gate on
      // `this.stopped`: stop() sets it before mediaRecorder.stop() fires this
      // handler, which would make manual stop silently drop the recording.)
      // EXCEPT a deliberate cancel() (WeChat-style slide-to-cancel): the
      // recording is discarded without transcription.
      if (this.cancelled) return;
      this._onStop?.(blob, type);
    };
    this.mediaRecorder.onerror = () => {
      this.stop();
      this._onError?.(new Error("录音器错误"));
    };

    this.mediaRecorder.start();

    // VAD via Web Audio AnalyserNode.
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.audioContext = new Ctx();
      const src = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      src.connect(this.analyser);
      // NOTE: do NOT connect the analyser to audioContext.destination — that
      // would pipe the mic straight to the speakers (the user hears their own
      // voice live). AnalyserNode still computes RMS without an output.
    } catch {
      // AudioContext may fail without user gesture — recording still works,
      // we just lose VAD auto-stop (fall back to manual stop via click).
      this.analyser = null;
    }

    // Max duration hard cap.
    this.maxTimer = window.setTimeout(() => {
      if (this.mediaRecorder?.state === "recording") this.stop();
    }, MAX_RECORDING_MS);

    // VAD silence-detection auto-stop — only in hands-free mode (default).
    // In hold-to-talk mode (WeChat style) the user ends the recording by
    // releasing, so auto-stop would cut them off mid-sentence.
    if (vadEnabled) this.pollLevel();
  }

  private pollLevel(): void {
    if (this.stopped || !this.analyser) return;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    this._onLevel?.(rms);

    // Silence detection: once we've had some audio, a long silent gap stops.
    if (rms < VAD_RMS_THRESHOLD) {
      if (this.silenceTimer === null) {
        this.silenceTimer = window.setTimeout(() => {
          if (this.mediaRecorder?.state === "recording") this.stop();
        }, VAD_SILENCE_MS);
      }
    } else if (this.silenceTimer !== null) {
      window.clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    this.rafId = window.requestAnimationFrame(() => this.pollLevel());
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    try {
      this.mediaRecorder?.stop();
    } catch {
      /* already stopped */
    }
    // If recorder never started (e.g. error mid-start), clean up directly.
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
      this.cleanup();
    }
  }

  /** Stop and discard the recording (WeChat-style slide-to-cancel). */
  cancel(): void {
    if (this.stopped) return;
    this.cancelled = true;
    this.stop();
  }

  private cleanup(): void {
    if (this.silenceTimer !== null) window.clearTimeout(this.silenceTimer);
    if (this.maxTimer !== null) window.clearTimeout(this.maxTimer);
    if (this.rafId !== null) window.cancelAnimationFrame(this.rafId);
    this.silenceTimer = null;
    this.maxTimer = null;
    this.rafId = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.mediaRecorder = null;
    try {
      void this.audioContext?.close();
    } catch {
      /* ignore */
    }
    this.audioContext = null;
    this.analyser = null;
  }
}

// ── API helpers ───────────────────────────────────────────────────────

interface TranscribeResponse {
  ok: boolean;
  transcript: string;
  provider: string | null;
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取录音失败"));
    reader.readAsDataURL(blob);
  });
}

/** Send audio to the server's STT (faster-whisper local, or override). */
export async function transcribeAudio(
  blob: Blob,
  provider?: SttProvider,
): Promise<VoiceTranscriptResult> {
  const dataUrl = await blobToDataUrl(blob);
  const res = await fetchJSON<TranscribeResponse>("/api/audio/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data_url: dataUrl,
      mime_type: blob.type,
      provider: provider ?? "",
    }),
  });
  if (!res.ok) {
    throw new Error("语音识别失败");
  }
  return {
    transcript: (res.transcript ?? "").trim(),
    provider: res.provider ?? null,
  };
}

interface SpeakResponse {
  ok: boolean;
  data_url: string;
  mime_type: string;
  provider: string | null;
}

/** Synthesize assistant text to speech (server-side TTS provider). */
export async function speakText(
  text: string,
  provider?: TtsProvider,
  speed?: number,
): Promise<string> {
  const res = await fetchJSON<SpeakResponse>("/api/audio/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      provider: provider ?? "",
      speed: speed != null ? clampTtsSpeed(speed) : undefined,
    }),
  });
  if (!res.ok || !res.data_url) {
    throw new Error("语音合成失败");
  }
  return res.data_url;
}

const MAX_SPEECH_CHARS = 800;

/**
 * Clean assistant text before TTS so the speaker reads prose, not markup.
 * Strips code blocks/inline code, markdown emphasis, table pipes, links,
 * bare URLs, bullet markers, emoji, and collapses whitespace. Long replies
 * are truncated at a sentence boundary with a tail marker.
 */
export function cleanTextForSpeech(raw: string): string {
  if (!raw) return "";
  let text = raw;

  // Fenced code blocks (```...``` or ~~~...~~~) — drop entirely.
  text = text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, " ");
  // Inline code `...` — keep content, drop backticks.
  text = text.replace(/`([^`]*)`/g, "$1");
  // Markdown links [label](url) → label.
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Bare URLs → drop.
  text = text.replace(/https?:\/\/\S+/g, " ");
  // Table pipes → spaces (row becomes "cell cell cell").
  text = text.replace(/\|/g, " ");
  // Emoji (incl. variation selectors + ZWJ sequences) → drop. Split the
  // ranges to satisfy no-misleading-character-class (ZWJ/VS are combining).
  text = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu, " ");
  text = text.replace(/[\uFE0F\u200D]/gu, "");
  // Markdown decorations: bold/italic/heading/quote/bullet/list markers.
  text = text.replace(/[*_~]{1,3}/g, "");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^\s*(?:>|\+|-|\d+\.)\s+/gm, "");
  // Collapse runs of whitespace + blank lines + trailing spaces per line.
  text = text
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]*\n+/g, "\n");

  text = text.trim();

  // Truncate long replies at a sentence boundary.
  if (text.length > MAX_SPEECH_CHARS) {
    const cut = text.slice(0, MAX_SPEECH_CHARS);
    const lastSentence = Math.max(
      cut.lastIndexOf("。"),
      cut.lastIndexOf("！"),
      cut.lastIndexOf("？"),
      cut.lastIndexOf("."),
      cut.lastIndexOf("!"),
      cut.lastIndexOf("?"),
    );
    const end = lastSentence > MAX_SPEECH_CHARS * 0.5 ? lastSentence + 1 : MAX_SPEECH_CHARS;
    text = `${text.slice(0, end).trim()}……（以下省略）`;
  }

  return text.trim();
}
