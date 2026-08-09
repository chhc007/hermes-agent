// @vitest-environment jsdom
/**
 * VoiceSettings popover tests: toggling master switch, send mode, providers.
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
  it("toggles the panel open/closed", async () => {
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

  it("clamps the panel inside the viewport on both edges (v1.7.32)", async () => {
    // Button hugging the LEFT edge → panel must not run off the viewport.
    const originalGBCR = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = vi.fn(function (this: Element) {
      if (this === container.querySelector(".relative")) {
        return { left: 4, right: 36, top: 100, bottom: 136, width: 32, height: 36, x: 4, y: 100, toJSON: () => ({}) } as DOMRect;
      }
      return originalGBCR.call(this);
    });
    try {
      await render(
        <VoiceSettings
          settings={{ enabled: true, sendMode: "auto", voiceReply: false, sttProvider: "local", ttsProvider: "mimo", ttsSpeed: 1 }}
          onChange={vi.fn()}
        />,
      );
      await act(async () => {
        settingsButton().click();
      });
      const panel = container.querySelector('[data-slot="voice-settings-panel"]') as HTMLElement;
      expect(panel).toBeTruthy();
      // Button at viewport left=4,right=36: viewport-left candidate = 36-256
      // = -220 → flip to expand rightward → viewport left clamped to 8, i.e.
      // offset 8-4=4px from the button container. Panel stays inside viewport.
      expect(panel.style.left).toBe("4px");
    } finally {
      Element.prototype.getBoundingClientRect = originalGBCR;
    }
  });
});
