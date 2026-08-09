// @vitest-environment jsdom
/**
 * VoiceSettings modal tests: toggling master switch, send mode, providers,
 * and modal close behaviors (backdrop click / close button).
 * (Voice reply is bound to the master switch since v1.7.28 — no own toggle.)
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: {
      voice: {
        settings: "Voice settings",
        settingsTitle: "Voice Mode Settings",
        settingsClose: "Close voice settings",
        enableVoice: "Enable voice input",
        autoSend: "Auto-send",
        voiceReply: "Voice reply",
        replyOn: "On with voice input",
        replyOff: "Off with voice input",
        sttProvider: "Recognition engine",
        ttsProvider: "Voice engine",
        settingsHint: "hint",
      },
    },
  }),
}));

import { VoiceSettings } from "./VoiceSettings";

let container: HTMLDivElement;
let root: Root;

async function render(ui: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

function settingsButton(): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-label") === "Voice settings",
  ) as HTMLButtonElement;
}

function checkboxes(): HTMLInputElement[] {
  return Array.from(container.querySelectorAll('input[type="checkbox"]'));
}

describe("VoiceSettings", () => {
  it("toggles the modal open/closed", async () => {
    await render(
      <VoiceSettings
        settings={{ enabled: true, sendMode: "auto", voiceReply: false, sttProvider: "local", ttsProvider: "mimo", ttsSpeed: 1 }}
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-slot="voice-settings-panel"]')).toBeNull();
    await act(async () => {
      settingsButton().click();
    });
    expect(container.querySelector('[data-slot="voice-settings-panel"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="voice-settings-backdrop"]')).toBeTruthy();
  });

  it("closes when the backdrop (scrim) is clicked", async () => {
    await render(
      <VoiceSettings
        settings={{ enabled: true, sendMode: "auto", voiceReply: false, sttProvider: "local", ttsProvider: "mimo", ttsSpeed: 1 }}
        onChange={vi.fn()}
      />,
    );
    await act(async () => {
      settingsButton().click();
    });
    expect(container.querySelector('[data-slot="voice-settings-panel"]')).toBeTruthy();
    await act(async () => {
      container
        .querySelector('[data-slot="voice-settings-backdrop"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[data-slot="voice-settings-panel"]')).toBeNull();
  });

  it("closes via the close button and keeps panel clicks from closing", async () => {
    await render(
      <VoiceSettings
        settings={{ enabled: true, sendMode: "auto", voiceReply: false, sttProvider: "local", ttsProvider: "mimo", ttsSpeed: 1 }}
        onChange={vi.fn()}
      />,
    );
    await act(async () => {
      settingsButton().click();
    });
    // Clicking INSIDE the panel must not close it.
    const panel = container.querySelector('[data-slot="voice-settings-panel"]') as HTMLElement;
    await act(async () => {
      panel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[data-slot="voice-settings-panel"]')).toBeTruthy();
    // The explicit close button does.
    const closeBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Close voice settings",
    );
    expect(closeBtn).toBeTruthy();
    await act(async () => {
      closeBtn!.click();
    });
    expect(container.querySelector('[data-slot="voice-settings-panel"]')).toBeNull();
  });

  it("reflects settings state in the checkboxes", async () => {
    await render(
      <VoiceSettings
        settings={{ enabled: true, sendMode: "auto", voiceReply: true, sttProvider: "local", ttsProvider: "mimo", ttsSpeed: 1 }}
        onChange={vi.fn()}
      />,
    );
    await act(async () => {
      settingsButton().click();
    });
    const boxes = checkboxes();
    // v1.7.28: voice reply is bound to the master switch — no separate toggle.
    expect(boxes.length).toBe(2);
    expect(boxes[0].checked).toBe(true); // enabled
    expect(boxes[1].checked).toBe(true); // auto-send
  });

  it("emits changes when toggled", async () => {
    const onChange = vi.fn();
    await render(
      <VoiceSettings
        settings={{ enabled: true, sendMode: "auto", voiceReply: false, sttProvider: "local", ttsProvider: "mimo", ttsSpeed: 1 }}
        onChange={onChange}
      />,
    );
    await act(async () => {
      settingsButton().click();
    });
    await act(async () => {
      checkboxes()[0].click(); // disable voice input
    });
    expect(onChange).toHaveBeenCalledWith({
      enabled: false,
      sendMode: "auto",
      voiceReply: false,
      sttProvider: "local",
      ttsProvider: "mimo",
      ttsSpeed: 1,
    });
  });

  it("switches the STT provider via the select", async () => {
    const onChange = vi.fn();
    await render(
      <VoiceSettings
        settings={{ enabled: true, sendMode: "auto", voiceReply: false, sttProvider: "local", ttsProvider: "mimo", ttsSpeed: 1 }}
        onChange={onChange}
      />,
    );
    await act(async () => {
      settingsButton().click();
    });
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    await act(async () => {
      select.value = "mimo";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith({
      enabled: true,
      sendMode: "auto",
      voiceReply: true, // v1.7.28: bound to enabled
      sttProvider: "mimo",
      ttsProvider: "mimo",
      ttsSpeed: 1,
    });
  });
});
