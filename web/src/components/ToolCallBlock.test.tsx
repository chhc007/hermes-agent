// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils", () => ({
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(" "),
}));
vi.mock("@nous-research/ui/ui/components/badge", () => ({
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

import type { ToolCallInfo } from "@/lib/chat-event-stream";

import { ToolCallBlock } from "./ToolCallBlock";

let container: HTMLDivElement;
let root: Root;

async function render(ui: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

const runningTool: ToolCallInfo = {
  tool_id: "t1",
  name: "read_file",
  status: "running",
  args_text: 'path="src/foo.ts"',
};

const completeTool: ToolCallInfo = {
  ...runningTool,
  status: "complete",
  summary: "3 lines",
  duration_s: 1.5,
};

function clickHeader() {
  const btn = container.querySelector("button") as HTMLButtonElement;
  act(() => btn.click());
}

function visibleText(): string {
  return container.textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

describe("ToolCallBlock", () => {
  it("shows the tool name and a completed status badge", async () => {
    await render(<ToolCallBlock tool={completeTool} />);
    expect(visibleText()).toContain("read_file");
    expect(visibleText()).toContain("done");
  });

  it("collapses the body by default when complete, expands on click", async () => {
    await render(<ToolCallBlock tool={completeTool} />);
    expect(visibleText()).not.toContain('path="src/foo.ts"');
    expect(visibleText()).not.toContain("3 lines");

    clickHeader();

    expect(visibleText()).toContain('path="src/foo.ts"');
    expect(visibleText()).toContain("3 lines");
  });

  it("is expanded by default while running", async () => {
    await render(<ToolCallBlock tool={runningTool} />);
    expect(visibleText()).toContain('path="src/foo.ts"');
  });

  it("renders an error status badge when the tool errored", async () => {
    await render(
      <ToolCallBlock tool={{ ...completeTool, status: "error", error: "command not found" }} />,
    );
    expect(visibleText()).toContain("error");
  });
});
