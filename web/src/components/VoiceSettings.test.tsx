// @vitest-environment jsdom
/**
 * VoiceSettings popover tests: toggling master switch, send mode, voice reply.
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
        enableVoice: "Enable voice input",
        autoSend: "Auto-send",
        voiceReply: "Voice reply",
        sttProvider: "Recognition engine",
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
  it("toggles the panel open/closed", async () => {
    await render(
      <VoiceSettings
        settings={{ enabled: true, sendMode: "auto", voiceReply: false, sttProvider: "local" }}
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-slot="voice-settings-panel"]')).toBeNull();
    await act(async () => {
      settingsButton().click();
    });
    expect(container.querySelector('[data-slot="voice-settings-panel"]')).toBeTruthy();
  });

  it("reflects settings state in the checkboxes", async () => {
    await render(
      <VoiceSettings
        settings={{ enabled: true, sendMode: "auto", voiceReply: true, sttProvider: "local" }}
        onChange={vi.fn()}
      />,
    );
    await act(async () => {
      settingsButton().click();
    });
    const boxes = checkboxes();
    expect(boxes.length).toBe(3);
    expect(boxes[0].checked).toBe(true); // enabled
    expect(boxes[1].checked).toBe(true); // auto-send
    expect(boxes[2].checked).toBe(true); // voice reply
  });

  it("emits changes when toggled", async () => {
    const onChange = vi.fn();
    await render(
      <VoiceSettings
        settings={{ enabled: true, sendMode: "auto", voiceReply: false, sttProvider: "local" }}
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
    });
  });

  it("switches the STT provider via the select", async () => {
    const onChange = vi.fn();
    await render(
      <VoiceSettings
        settings={{ enabled: true, sendMode: "auto", voiceReply: false, sttProvider: "local" }}
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
      voiceReply: false,
      sttProvider: "mimo",
    });
  });
});
