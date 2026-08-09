// @vitest-environment jsdom
/**
 * VoiceHoldButton + VoiceModeButton tests. Mocks getUserMedia +
 * MediaRecorder + transcribeAudio to verify the WeChat-style hold-to-talk
 * flow: press → record → release sends; slide up → release cancels.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, beforeEach, vi } from "vitest";

const transcribeMock = vi.hoisted(() =>
  vi.fn(async () => ({ transcript: "你好世界", provider: "local" })),
);

vi.mock("@/lib/voiceMode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/voiceMode")>();
  return {
    ...actual,
    transcribeAudio: transcribeMock,
  };
});

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: {
      voice: {
        enterVoiceMode: "Switch to voice input",
        exitVoiceMode: "Back to text input",
        holdToTalk: "Hold to talk",
        releaseToSend: "Release to send",
        slideToCancel: "Slide up to cancel",
        releaseToCancel: "Release to cancel",
        transcribing: "Transcribing…",
        noSpeech: "No speech detected",
      },
    },
  }),
}));

import { VoiceHoldButton, VoiceModeButton } from "./VoiceButton";

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

function holdButton(): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-label")?.includes("Hold") ||
      b.getAttribute("aria-label")?.includes("Release"),
  ) as HTMLButtonElement;
}

function pointerDown(el: HTMLElement, clientY = 100) {
  el.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, clientY }),
  );
}

function pointerUp(el: HTMLElement, clientY = 100) {
  el.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, clientY }),
  );
}

function pointerMove(el: HTMLElement, clientY: number) {
  el.dispatchEvent(
    new PointerEvent("pointermove", { bubbles: true, clientY }),
  );
}

describe("VoiceModeButton", () => {
  beforeEach(() => {
    stubMedia();
    transcribeMock.mockClear();
  });

  it("toggles voice mode via the mic button", async () => {
    const onToggle = vi.fn();
    await render(
      <VoiceModeButton enabled active={false} onToggle={onToggle} />,
    );
    const btn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Switch to voice input",
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    await act(async () => {
      btn.click();
    });
    expect(onToggle).toHaveBeenCalled();
  });
});

describe("VoiceHoldButton", () => {
  const onTranscript = vi.fn();
  const onError = vi.fn();

  beforeEach(() => {
    stubMedia();
    onTranscript.mockClear();
    onError.mockClear();
    transcribeMock.mockClear();
  });

  it("renders the hold-to-talk label", async () => {
    await render(
      <VoiceHoldButton enabled onTranscript={onTranscript} onError={onError} />,
    );
    expect(holdButton()).toBeTruthy();
  });

  it("records on press and transcribes on release", async () => {
    await render(
      <VoiceHoldButton enabled onTranscript={onTranscript} onError={onError} />,
    );
    const btn = holdButton();
    await act(async () => {
      pointerDown(btn, 100);
    });
    // Recording starts → label changes.
    await vi.waitFor(() => {
      expect(
        Array.from(container.querySelectorAll("button")).some((b) =>
          (b.getAttribute("aria-label") ?? "").includes("Release"),
        ),
      ).toBe(true);
    });
    await act(async () => {
      pointerUp(btn, 100);
    });
    await vi.waitFor(() => {
      expect(onTranscript).toHaveBeenCalledWith("你好世界");
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("cancels when released after sliding into the cancel zone", async () => {
    await render(
      <VoiceHoldButton enabled onTranscript={onTranscript} onError={onError} />
    );
    const btn = holdButton();
    await act(async () => {
      pointerDown(btn, 200);
    });
    await vi.waitFor(() => {
      expect(
        Array.from(container.querySelectorAll("button")).some((b) =>
          (b.getAttribute("aria-label") ?? "").includes("Release"),
        ),
      ).toBe(true);
    });
    // Slide up beyond the cancel distance (120px default).
    await act(async () => {
      pointerMove(btn, 60); // dy = 140 > 120 → cancelling
    });
    await act(async () => {
      pointerUp(btn, 60);
    });
    // Cancelled → no transcript.
    await new Promise((r) => setTimeout(r, 20));
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does NOT cancel on a small in-button movement (v1.7.31)", async () => {
    await render(
      <VoiceHoldButton enabled onTranscript={onTranscript} onError={onError} />
    );
    const btn = holdButton();
    await act(async () => {
      pointerDown(btn, 200);
    });
    await vi.waitFor(() => {
      expect(
        Array.from(container.querySelectorAll("button")).some((b) =>
          (b.getAttribute("aria-label") ?? "").includes("Release"),
        ),
      ).toBe(true);
    });
    // Small upward wiggle (dy = 40 < 120) must stay in recording state.
    await act(async () => {
      pointerMove(btn, 160); // dy = 40 → still recording
    });
    await act(async () => {
      pointerUp(btn, 160);
    });
    // Released inside the button → transcribe + send.
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
    await render(
      <VoiceHoldButton enabled onTranscript={onTranscript} onError={onError} />,
    );
    const btn = holdButton();
    await act(async () => {
      pointerDown(btn, 100);
    });
    await act(async () => {
      pointerUp(btn, 100);
    });
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith("mic denied");
    });
  });
});
