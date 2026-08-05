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

const segments = {
  thinking: (text: string) => ({ kind: "thinking" as const, text }),
  tool: (toolId: string, name: string) =>
    ({ kind: "tool" as const, toolId, name, status: "complete" as const }),
  text: (text: string) => ({ kind: "text" as const, text }),
};

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

    // Thinking is collapsed by default with a preview of the latest thought.
    expect(visibleText()).toContain("careful thought");

    // Expanding shows the full thinking body.
    toggleThinking();
    expect(container.querySelector('[data-testid="markdown"]')?.textContent).toBe(
      "careful thought",
    );
  });
});

describe("MessageBubble segments ordering", () => {
  it("renders thinking → tool → text in arrival order", async () => {
    const msg: ChatMessage = {
      id: "m1",
      role: "assistant",
      status: "complete",
      ts: 1,
      segments: [
        segments.thinking("step 1"),
        segments.tool("t1", "read_file"),
        segments.text("final answer"),
      ],
    };
    await render(<MessageBubble message={msg} />);

    const texts = Array.from(container.querySelectorAll("div")).map((d) => d.textContent ?? "");
    const thinkIdx = texts.findIndex((t) => t.includes("step 1"));
    const toolIdx = texts.findIndex((t) => t === "read_file");
    const answerIdx = texts.findIndex((t) => t === "final answer");
    expect(thinkIdx).toBeGreaterThanOrEqual(0);
    expect(toolIdx).toBeGreaterThan(thinkIdx);
    expect(answerIdx).toBeGreaterThan(toolIdx);
  });

  it("interleaves text → tool → text in correct order", async () => {
    const msg: ChatMessage = {
      id: "m2",
      role: "assistant",
      status: "complete",
      ts: 1,
      segments: [
        segments.text("intro"),
        segments.tool("t2", "web_search"),
        segments.text("conclusion"),
      ],
    };
    await render(<MessageBubble message={msg} />);
    const texts = Array.from(container.querySelectorAll("div")).map((d) => d.textContent ?? "");
    const introIdx = texts.indexOf("intro");
    const toolIdx = texts.indexOf("web_search");
    const conclusionIdx = texts.indexOf("conclusion");
    expect(introIdx).toBeGreaterThanOrEqual(0);
    expect(toolIdx).toBeGreaterThan(introIdx);
    expect(conclusionIdx).toBeGreaterThan(toolIdx);
  });

  it("renders multiple independent thinking blocks", async () => {
    const msg: ChatMessage = {
      id: "m3",
      role: "assistant",
      status: "complete",
      ts: 1,
      segments: [segments.thinking("first thought"), segments.text("x"), segments.thinking("second thought")],
    };
    await render(<MessageBubble message={msg} />);
    const buttons = Array.from(container.querySelectorAll("button")).filter((b) =>
      b.textContent?.includes("thinking"),
    );
    expect(buttons).toHaveLength(2);
    expect(visibleText()).toContain("first thought");
    expect(visibleText()).toContain("second thought");
  });

  it("renders the last text segment as raw text (not markdown) while streaming", async () => {
    const msg: ChatMessage = {
      id: "m4",
      role: "assistant",
      status: "streaming",
      ts: 1,
      segments: [segments.tool("t3", "read_file"), segments.text("streaming partial")],
    };
    await render(<MessageBubble message={msg} />);
    // Streaming prose renders as plain text (no Markdown mock wrapper), and
    // the earlier tool segment still renders as a tool card.
    expect(container.querySelector('[data-testid="tool-call"]')?.textContent).toBe("read_file");
    expect(container.querySelector('[data-testid="markdown"]')).toBeNull();
    expect(visibleText()).toContain("streaming partial");
  });

  it("renders an earlier (finished) text segment as markdown even while streaming", async () => {
    const msg: ChatMessage = {
      id: "m5",
      role: "assistant",
      status: "streaming",
      ts: 1,
      // Two text segments: the first is finished, only the last streams.
      segments: [segments.text("finished part"), segments.text("still streaming")],
    };
    await render(<MessageBubble message={msg} />);
    // The earlier finished text segment renders as Markdown…
    const markdownDivs = Array.from(container.querySelectorAll('[data-testid="markdown"]'));
    expect(markdownDivs.some((d) => d.textContent === "finished part")).toBe(true);
    // …while the last one renders as raw streaming text (no Markdown wrapper).
    expect(markdownDivs.some((d) => d.textContent === "still streaming")).toBe(false);
    expect(visibleText()).toContain("still streaming");
  });

  it("falls back to legacy text/thinking/tools when there are no segments", async () => {
    const msg: ChatMessage = {
      id: "m6",
      role: "assistant",
      status: "complete",
      ts: 1,
      text: "legacy body",
      thinking: "legacy thought",
      tools: [{ tool_id: "t5", name: "terminal", status: "complete" }],
    };
    await render(<MessageBubble message={msg} />);
    const markdownDivs = Array.from(container.querySelectorAll('[data-testid="markdown"]'));
    expect(markdownDivs.some((d) => d.textContent === "legacy body")).toBe(true);
    expect(container.querySelector('[data-testid="tool-call"]')?.textContent).toBe("terminal");
    expect(visibleText()).toContain("legacy thought");
  });
});
