// @vitest-environment jsdom
/**
 * Unit tests for voiceMode helpers: settings persistence and the
 * transcribeAudio/speakText API wiring. MediaRecorder/getUserMedia are
 * browser-only and covered by the component tests with mocks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_VOICE_SETTINGS,
  blobToDataUrl,
  cleanTextForSpeech,
  loadVoiceSettings,
  saveVoiceSettings,
  speakText,
  transcribeAudio,
} from "@/lib/voiceMode";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  fetchJSON: (url: string, init?: RequestInit) =>
    Promise.resolve(fetchMock(url, init)),
}));

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    ...((globalThis as Record<string, unknown>).window ?? {}),
    __HERMES_SESSION_TOKEN__: undefined,
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
}

describe("voiceMode settings", () => {
  beforeEach(() => {
    stubLocalStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns defaults when nothing is stored", () => {
    expect(loadVoiceSettings()).toEqual(DEFAULT_VOICE_SETTINGS);
  });

  it("round-trips settings through localStorage", () => {
    saveVoiceSettings({
      enabled: true,
      sendMode: "confirm",
      voiceReply: true,
      sttProvider: "mimo",
      ttsProvider: "edge",
    });
    expect(loadVoiceSettings()).toEqual({
      enabled: true,
      sendMode: "confirm",
      voiceReply: true,
      sttProvider: "mimo",
      ttsProvider: "edge",
    });
  });

  it("falls back to defaults on corrupt JSON", () => {
    const store = new Map<string, string>([["hermes.voice.settings.v1", "{oops"]]);
    vi.stubGlobal("window", {
      ...((globalThis as Record<string, unknown>).window ?? {}),
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: () => {},
        removeItem: () => {},
      },
    });
    expect(loadVoiceSettings()).toEqual(DEFAULT_VOICE_SETTINGS);
  });
});

describe("voiceMode API helpers", () => {
  beforeEach(() => {
    stubLocalStorage();
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blobToDataUrl reads a blob as a data URL", async () => {
    const blob = new Blob(["abc"], { type: "text/plain" });
    const url = await blobToDataUrl(blob);
    expect(url.startsWith("data:text/plain;base64,")).toBe(true);
  });

  it("transcribeAudio posts the data_url and returns the transcript", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      transcript: "你好",
      provider: "local",
    });
    const blob = new Blob(["x"], { type: "audio/webm" });
    await expect(transcribeAudio(blob, "local")).resolves.toEqual({
      transcript: "你好",
      provider: "local",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/audio/transcribe");
    const body = JSON.parse(String(init?.body)) as {
      data_url: string;
      provider: string;
    };
    expect(body.data_url).toContain("data:audio/webm");
    expect(body.provider).toBe("local");
  });

  it("transcribeAudio throws on ok=false", async () => {
    fetchMock.mockResolvedValue({ ok: false, transcript: "", provider: null });
    const blob = new Blob(["x"], { type: "audio/webm" });
    await expect(transcribeAudio(blob)).rejects.toThrow("语音识别失败");
  });

  it("speakText returns the audio data URL", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      data_url: "data:audio/wav;base64,AAAA",
      mime_type: "audio/wav",
      provider: "mimo",
    });
    await expect(speakText("你好", "mimo")).resolves.toBe(
      "data:audio/wav;base64,AAAA",
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/audio/speak");
    const body = JSON.parse(String(init?.body)) as {
      text: string;
      provider: string;
    };
    expect(body.text).toBe("你好");
    expect(body.provider).toBe("mimo");
  });

  it("speakText throws on failure", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      data_url: "",
      mime_type: "",
      provider: null,
    });
    await expect(speakText("你好")).rejects.toThrow("语音合成失败");
  });
});

describe("cleanTextForSpeech", () => {
  it("strips markdown emphasis and keeps prose", () => {
    expect(cleanTextForSpeech("**重点** 内容与 `code` 示例")).toBe("重点 内容与 code 示例");
  });

  it("drops fenced code blocks", () => {
    const raw = "前面\n```python\nprint('x')\n```\n后面";
    expect(cleanTextForSpeech(raw)).toBe("前面\n后面");
  });

  it("converts links to labels and drops bare URLs", () => {
    expect(
      cleanTextForSpeech("看 [文档](https://example.com) 和 https://x.com/y"),
    ).toBe("看 文档 和");
  });

  it("flattens table pipes and drops emoji", () => {
    expect(cleanTextForSpeech("| A | B |\n| 1 | 2 | 🎉")).toBe("A B\n1 2");
  });

  it("truncates long replies at a sentence boundary", () => {
    const long = "这是第一句话。".repeat(200);
    const out = cleanTextForSpeech(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out.endsWith("（以下省略）")).toBe(true);
  });
});
