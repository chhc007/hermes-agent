// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadTerminalAppearance,
  saveTerminalAppearance,
  TerminalSettingsModal,
  DEFAULT_TERMINAL_APPEARANCE,
} from "./TerminalSettingsModal";

const STORAGE_KEY = "hermes.terminal.settings.v1";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  localStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderModal(props: Partial<React.ComponentProps<typeof TerminalSettingsModal>> = {}) {
  let applied: unknown = null;
  act(() => {
    root.render(
      <TerminalSettingsModal
        open
        initial={DEFAULT_TERMINAL_APPEARANCE}
        onClose={() => {}}
        onApply={(a) => { applied = a; }}
        {...props}
      />,
    );
  });
  return { applied: () => applied };
}

describe("TerminalSettingsModal save flow", () => {
  it("saves appearance to localStorage on Save click", () => {
    const { applied } = renderModal();

    // background hex text input is the first text input
    const textInputs = container.querySelectorAll<HTMLInputElement>('input[type="text"]');
    fireChange(textInputs[0], "#1c1729");

    // font size slider
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    fireChange(slider, "18");

    // click Save button
    const saveBtn = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.includes("Save"),
    )!;
    act(() => saveBtn.click());

    const stored = localStorage.getItem(STORAGE_KEY);
    console.log("stored after save:", stored);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.background).toBe("#1c1729");
    expect(parsed.fontSize).toBe(18);
    expect(applied()).toEqual({ background: "#1c1729", foreground: "#f0e6d2", fontSize: 18 });
  });

  it("loads saved appearance back", () => {
    saveTerminalAppearance({ background: "#123456", foreground: "#abcdef", fontSize: 20 });
    expect(loadTerminalAppearance()).toEqual({
      background: "#123456",
      foreground: "#abcdef",
      fontSize: 20,
    });
  });

  it("round-trips through a simulated refresh", () => {
    saveTerminalAppearance({ background: "#2b2545", foreground: "#d6d0ea", fontSize: 16 });
    // simulate a fresh page load reading from storage
    const loaded = loadTerminalAppearance();
    expect(loaded.background).toBe("#2b2545");
    expect(loaded.fontSize).toBe(16);
  });

  it("persists on dismiss via the close (✕) button — no explicit Save needed", () => {
    const { applied } = renderModal();

    const textInputs = container.querySelectorAll<HTMLInputElement>('input[type="text"]');
    fireChange(textInputs[0], "#1c1729");

    const closeBtn = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Close terminal settings",
    )!;
    act(() => closeBtn.click());

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).background).toBe("#1c1729");
    expect(applied()).not.toBeNull();
  });

  it("persists on dismiss via the scrim click", () => {
    const { applied } = renderModal();

    const textInputs = container.querySelectorAll<HTMLInputElement>('input[type="text"]');
    fireChange(textInputs[1], "#d6d0ea");

    // click the scrim (outermost dialog element)
    const scrim = container.querySelector<HTMLElement>('[role="dialog"]')!;
    act(() => scrim.click());

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).foreground).toBe("#d6d0ea");
    expect(applied()).not.toBeNull();
  });
});

function fireChange(el: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
