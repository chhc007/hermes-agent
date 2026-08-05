// @vitest-environment jsdom
import { act, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils", () => ({
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(" "),
}));
const imageMocks = vi.hoisted(() => ({
  imageFilesFromTransfer: vi.fn(() => [] as File[]),
  transferMayContainImage: vi.fn(() => false),
}));
vi.mock("@/lib/chatImagePaste", () => imageMocks);

import { ChatInput } from "./ChatInput";

let container: HTMLDivElement;
let root: Root;

async function render(ui: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

async function setValue(value: string) {
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!
    .set!;
  await act(async () => {
    setter.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function sendButton(): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-label") === "Send message",
  ) as HTMLButtonElement;
}

describe("ChatInput", () => {
  it("sends trimmed text on Enter and clears the field", async () => {
    const onSend = vi.fn();
    await render(<ChatInput onSend={onSend} />);

    await setValue("  hello hermes  ");
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });

    expect(onSend).toHaveBeenCalledWith("hello hermes");
    expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
  });

  it("keeps the text when onSend rejects (PTY not connected)", async () => {
    const onSend = vi.fn(() => false);
    await render(<ChatInput onSend={onSend} />);
    await setValue("hi hermes");
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    expect(onSend).toHaveBeenCalledWith("hi hermes");
    expect(textarea.value).toBe("hi hermes");
  });

  it("does not send blank or whitespace-only input", async () => {
    const onSend = vi.fn();
    await render(<ChatInput onSend={onSend} />);
    await setValue("   ");
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("allows Shift+Enter to insert a newline instead of sending", async () => {
    const onSend = vi.fn();
    await render(<ChatInput onSend={onSend} />);
    await setValue("line1");
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    let defaultPrevented = false;
    await act(async () => {
      const ev = new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      textarea.dispatchEvent(ev);
      defaultPrevented = ev.defaultPrevented;
    });
    expect(defaultPrevented).toBe(false);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("send button triggers onSend", async () => {
    const onSend = vi.fn();
    await render(<ChatInput onSend={onSend} />);
    await setValue("do a thing");
    await act(async () => sendButton().click());
    expect(onSend).toHaveBeenCalledWith("do a thing");
  });

  it("disables input when disabled is true", async () => {
    const onSend = vi.fn();
    await render(<ChatInput onSend={onSend} disabled />);
    await setValue("nope");
    await act(async () => sendButton().click());
    expect(onSend).not.toHaveBeenCalled();
  });

  it("reports composer changes via onInputChange", async () => {
    const onInputChange = vi.fn();
    await render(<ChatInput onSend={vi.fn()} onInputChange={onInputChange} />);
    await setValue("/new");
    expect(onInputChange).toHaveBeenCalledWith("/new");
  });

  it("lets the completion handler consume keys before submit", async () => {
    const onSend = vi.fn();
    const onCompletionKey = vi.fn((e: ReactKeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        return true;
      }
      return false;
    });
    await render(
      <ChatInput onSend={onSend} onCompletionKey={onCompletionKey} />,
    );
    await setValue("/new");
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(onCompletionKey).toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("exposes setValue through the imperative handle", async () => {
    const onInputChange = vi.fn();
    let handle: { setValue: (v: string) => void } | null = null;
    const ref = (h: unknown) => {
      handle = h as { setValue: (v: string) => void };
    };
    await render(<ChatInput onSend={vi.fn()} onInputChange={onInputChange} ref={ref} />);
    await act(async () => {
      handle!.setValue("/copy");
    });
    expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("/copy");
    expect(onInputChange).toHaveBeenCalledWith("/copy");
  });

  it("shows the grow button when content overflows the auto-grow cap", async () => {
    await render(<ChatInput onSend={vi.fn()} />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    // jsdom reports scrollHeight 0 by default — simulate tall content.
    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 200 });
    await setValue("a".repeat(200));
    await act(async () => {});
    const grow = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Expand input",
    );
    expect(grow).toBeTruthy();
  });

  it("expands and collapses the composer via the grow button", async () => {
    await render(<ChatInput onSend={vi.fn()} />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 200 });
    await setValue("a".repeat(200));
    await act(async () => {});
    const grow = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Expand input",
    ) as HTMLButtonElement;
    await act(async () => {
      grow.click();
    });
    const collapse = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Collapse input",
    );
    expect(collapse).toBeTruthy();
    await act(async () => {
      collapse!.click();
    });
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (b) => b.getAttribute("aria-label") === "Expand input",
      ),
    ).toBe(true);
  });
});
