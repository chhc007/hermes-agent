// @vitest-environment jsdom
/**
 * VoiceReply tests: mute toggle behavior + synthesis/play flow.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, beforeEach, vi } from "vitest";

const speakMock = vi.hoisted(() =>
  vi.fn(async () => "data:audio/wav;base64,AAAA"),
);

vi.mock("@/lib/voiceMode", () => ({
  speakText: speakMock,
  cleanTextForSpeech: (text: string) => text.trim(),
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: {
      voice: {
        replyActive: "Reading reply",
        stopReply: "Stop reading",
        replyError: "Voice reply failed",
        muteReply: "Mute voice replies",
        unmuteReply: "Unmute voice replies",
        replyReady: "Voice replies on",
      },
    },
  }),
}));

import { VoiceReply } from "./VoiceReply";

let container: HTMLDivElement;
let root: Root;

async function render(ui: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

function playStub() {
  const audioProto = {
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    onplay: null as (() => void) | null,
    onended: null as (() => void) | null,
    onerror: null as (() => void) | null,
  };
  class FakeAudio {
    play = audioProto.play;
    pause = audioProto.pause;
    onplay: (() => void) | null = null;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_src?: string) {}
  }
  vi.stubGlobal("Audio", FakeAudio);
  return audioProto;
}

function indicator(): HTMLButtonElement {
  return container.querySelector(
    '[data-slot="voice-reply-indicator"]',
  ) as HTMLButtonElement;
}

const baseProps = {
  enabled: true,
  muted: false,
  onToggleMuted: vi.fn(),
  text: "",
  runId: 0,
};

describe("VoiceReply", () => {
  beforeEach(() => {
    speakMock.mockClear();
  });

  it("renders nothing when disabled", async () => {
    playStub();
    await render(
      <VoiceReply {...baseProps} enabled={false} />,
    );
    expect(indicator()).toBeNull();
  });

  it("synthesizes and plays the reply when enabled and not muted", async () => {
    const audioProto = playStub();
    await render(<VoiceReply {...baseProps} text="你好" runId={1} />);
    await vi.waitFor(() => {
      expect(speakMock).toHaveBeenCalledWith("你好");
      expect(audioProto.play).toHaveBeenCalled();
    });
  });

  it("does NOT synthesize when muted", async () => {
    playStub();
    await render(<VoiceReply {...baseProps} muted text="你好" runId={1} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(speakMock).not.toHaveBeenCalled();
  });

  it("calls onToggleMuted when the indicator is clicked", async () => {
    playStub();
    const onToggleMuted = vi.fn();
    await render(<VoiceReply {...baseProps} onToggleMuted={onToggleMuted} />);
    await act(async () => {
      indicator().click();
    });
    expect(onToggleMuted).toHaveBeenCalled();
  });

  it("surfaces synthesis errors", async () => {
    playStub();
    speakMock.mockRejectedValueOnce(new Error("synthesis down"));
    const onError = vi.fn();
    await render(
      <VoiceReply {...baseProps} text="你好" runId={1} onError={onError} />,
    );
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
    speakMock.mockResolvedValue("data:audio/wav;base64,AAAA");
  });
});
