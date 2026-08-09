// @vitest-environment jsdom
/**
 * VoiceReply tests: renders nothing when disabled, triggers speakText + play
 * when enabled with new text, and surfaces synthesis errors.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

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

describe("VoiceReply", () => {
  it("renders nothing when disabled", async () => {
    playStub();
    await render(
      <VoiceReply enabled={false} text="hello" runId={1} />,
    );
    expect(container.querySelector('[data-slot="voice-reply-indicator"]')).toBeNull();
  });

  it("synthesizes and plays the reply when enabled", async () => {
    const audioProto = playStub();
    await render(<VoiceReply enabled text="你好" runId={1} />);
    await vi.waitFor(() => {
      expect(speakMock).toHaveBeenCalledWith("你好");
      expect(audioProto.play).toHaveBeenCalled();
    });
  });

  it("surfaces synthesis errors", async () => {
    playStub();
    speakMock.mockRejectedValueOnce(new Error("synthesis down"));
    const onError = vi.fn();
    await render(
      <VoiceReply enabled text="你好" runId={1} onError={onError} />,
    );
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
    speakMock.mockResolvedValue("data:audio/wav;base64,AAAA");
  });
});
