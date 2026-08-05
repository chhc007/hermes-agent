// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils", () => ({
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(" "),
}));
vi.mock("./Markdown", () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));
vi.mock("./ToolCallBlock", () => ({
  ToolCallBlock: ({ tool }: { tool: { name: string } }) => (
    <div data-testid="tool-call">{tool.name}</div>
  ),
}));

import type { ChatMessage } from "@/lib/chat-event-stream";

import { MessageBubble } from "./MessageBubble";

let container: HTMLDivElement;
let root: Root;

async function render(ui: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

const base: ChatMessage = {
  id: "m1",
  role: "assistant",
  text: "Hello",
  status: "complete",
  ts: 1,
};

function visibleText(): string {
  return container.textContent ?? "";
}

function toggleThinking() {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.includes("thinking"),
  ) as HTMLButtonElement;
  act(() => btn.click());
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

describe("MessageBubble", () => {
  it("renders assistant text as rendered markdown", async () => {
    await render(<MessageBubble message={base} />);
    expect(container.querySelector('[data-testid="markdown"]')?.textContent).toBe("Hello");
  });

  it("renders user messages right-aligned as text", async () => {
    await render(
      <MessageBubble message={{ ...base, id: "u1", role: "user", text: "my question" }} />,
    );
    expect(visibleText()).toContain("my question");
  });

  it("renders system messages centered as text", async () => {
    await render(
      <MessageBubble message={{ ...base, id: "s1", role: "system", text: "notes" }} />,
    );
    expect(visibleText()).toContain("notes");
  });

  it("lists tool calls and shows/collapses thinking", async () => {
    await render(
      <MessageBubble
        message={{
          ...base,
          thinking: "careful thought",
          tools: [{ tool_id: "t1", name: "read_file", status: "complete" }],
        }}
      />,
    );
    expect(container.querySelector('[data-testid="tool-call"]')?.textContent).toBe("read_file");

    // Thinking body is rendered by default; toggling hides it.
    expect(visibleText()).toContain("careful thought");
    toggleThinking();
    expect(visibleText()).not.toContain("careful thought");
  });
});
