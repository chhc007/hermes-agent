// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils", () => ({
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(" "),
}));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: { chat: { toggleAutoScroll: "Toggle auto scroll" } },
  }),
}));
vi.mock("./MessageBubble", () => ({
  MessageBubble: ({ message }: { message: { id: string } }) => (
    <div data-testid="bubble">{message.id}</div>
  ),
}));

import type { ChatMessage } from "@/lib/chat-event-stream";

import { ChatMessageList } from "./ChatMessageList";

let container: HTMLDivElement;
let root: Root;

async function render(ui: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

const streaming: ChatMessage = {
  id: "m1",
  role: "assistant",
  text: "Hello",
  status: "streaming",
  ts: 1,
};

function toggleButton(): HTMLButtonElement {
  const btn = container.querySelector('button[aria-label="Toggle auto scroll"]') as HTMLButtonElement;
  if (!btn) throw new Error("auto-scroll toggle button not found");
  return btn;
}

function scrollEl(): HTMLDivElement {
  const el = container.querySelector('[data-streaming]') as HTMLDivElement;
  if (!el) throw new Error("scroll container not found");
  return el;
}

function makeScrollable(el: HTMLDivElement, scrollHeight = 2000, clientHeight = 200) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
  Object.defineProperty(el, "scrollTop", { configurable: true, value: 0, writable: true });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

describe("ChatMessageList", () => {
  it("renders bubbles and hides the toggle when empty", async () => {
    await render(<ChatMessageList messages={[]} />);
    expect(container.querySelector('button[aria-label="Toggle auto scroll"]')).toBeNull();

    await act(async () => root.render(<ChatMessageList messages={[streaming]} />));
    expect(toggleButton().getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll('[data-testid="bubble"]').length).toBe(1);
  });

  it("toggle swaps pressed state on click", async () => {
    await render(<ChatMessageList messages={[streaming]} />);
    const btn = toggleButton();
    expect(btn.getAttribute("aria-pressed")).toBe("true");

    act(() => btn.click());
    expect(toggleButton().getAttribute("aria-pressed")).toBe("false");
    expect(toggleButton().getAttribute("title")).toBe("Toggle auto scroll");

    act(() => toggleButton().click());
    expect(toggleButton().getAttribute("aria-pressed")).toBe("true");
  });

  it("scrolling down near the bottom re-sticks", async () => {
    await render(<ChatMessageList messages={[streaming]} />);
    const el = scrollEl();
    makeScrollable(el);

    // Simulate a fresh render of a longer stream (messages identity changes)
    // while the user is near the bottom -> scrollTop should be yanked to bottom.
    act(() => {
      Object.defineProperty(el, "scrollHeight", { configurable: true, value: 3000 });
      el.scrollTop = 2950; // within 120px of bottom
    });
    await act(async () => root.render(<ChatMessageList messages={[{ ...streaming, text: "longer" }]} />));
    expect(el.scrollTop).toBe(3000);
  });

  it("scrolling down NOT near the bottom starts auto-follow but up-scroll drops out immediately", async () => {
    await render(<ChatMessageList messages={[streaming]} />);
    const el = scrollEl();
    makeScrollable(el);

    // user wheels up -> immediately drops out of auto-follow, render does not
    // re-stick even though no next delta moved them far.
    act(() => {
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: -50, bubbles: true }));
    });
    // render with a fresh message reference / delta
    await act(async () => root.render(<ChatMessageList messages={[{ ...streaming, text: "++" }]} />));
    expect(el.scrollTop).toBe(0);
  });

  it("with auto-scroll off, scrolling near the bottom does NOT re-stick", async () => {
    await render(<ChatMessageList messages={[streaming]} />);
    const el = scrollEl();
    makeScrollable(el);

    act(() => toggleButton().click()); // off
    expect(toggleButton().getAttribute("aria-pressed")).toBe("false");

    // while off, user scrolls to near the bottom
    await act(async () => {
      el.scrollTop = 3000;
      el.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await act(async () => root.render(<ChatMessageList messages={[{ ...streaming, text: "next delta" }]} />));
    // still off -> must NOT have been yanked to bottom
    expect(el.scrollTop).toBe(3000);
  });
});
