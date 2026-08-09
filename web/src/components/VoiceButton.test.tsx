// @vitest-environment jsdom
/**
 * VoiceButton component tests. Mocks getUserMedia + MediaRecorder + the
 * transcribeAudio API to verify the record → transcribe → onTranscript flow.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/voiceMode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/voiceMode")>();
  return {
    ...actual,
    transcribeAudio: vi.fn(async () => ({
      transcript: "你好世界",
      provider: "local",
    })),
  };
});

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: {
      voice: {
        startRecording: "Start voice input",
        stopRecording: "Stop recording",
        transcribing: "Transcribing…",
        noSpeech: "No speech detected",
      },
    },
  }),
}));

import { VoiceButton } from "./VoiceButton";

class FakeMediaRecorder {
  static isTypeSupported() {
    return true;
  }
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  mimeType = "audio/webm";
  chunks: Blob[] = [];
  start() {
    this.state = "recording";
    this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

function stubMedia() {
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  const track = { stop: vi.fn() };
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [track],
      })),
    },
  });
  // jsdom has no AudioContext — the recorder falls back to manual stop.
  vi.stubGlobal("AudioContext", undefined);
}

let container: HTMLDivElement;
let root: Root;

async function render(ui: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

function micButton(): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-label") === "Start voice input",
  ) as HTMLButtonElement;
}

describe("VoiceButton", () => {
  it("renders a mic button when enabled", async () => {
    stubMedia();
    await render(<VoiceButton enabled onTranscript={vi.fn()} />);
    expect(micButton()).toBeTruthy();
    expect(micButton().disabled).toBe(false);
  });

  it("renders a disabled button when disabled", async () => {
    stubMedia();
    await render(<VoiceButton enabled={false} onTranscript={vi.fn()} />);
    expect(micButton().disabled).toBe(true);
  });

  it("records, transcribes, and delivers the transcript on stop", async () => {
    stubMedia();
    const onTranscript = vi.fn();
    const onError = vi.fn();
    await render(<VoiceButton enabled onTranscript={onTranscript} onError={onError} />);

    // Start recording.
    await act(async () => {
      micButton().click();
    });
    // Button switches to stop mode.
    await vi.waitFor(() => {
      expect(
        Array.from(container.querySelectorAll("button")).find(
          (b) => b.getAttribute("aria-label") === "Stop recording",
        ),
      ).toBeTruthy();
    });

    // Click stop → mediaRecorder.stop() → onstop → transcribe → onTranscript.
    const stopBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Stop recording",
    ) as HTMLButtonElement;
    await act(async () => {
      stopBtn.click();
    });

    await vi.waitFor(() => {
      expect(onTranscript).toHaveBeenCalledWith("你好世界");
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("surfaces getUserMedia errors", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw new Error("mic denied");
        }),
      },
    });
    const onError = vi.fn();
    await render(<VoiceButton enabled onTranscript={vi.fn()} onError={onError} />);
    await act(async () => {
      micButton().click();
    });
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith("mic denied");
    });
  });
});
