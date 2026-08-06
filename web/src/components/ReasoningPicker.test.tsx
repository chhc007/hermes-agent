// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    getConfig: vi.fn(),
    saveConfig: vi.fn(),
  },
}));

const { api } = await import("@/lib/api");

import { ReasoningPicker } from "./ReasoningPicker";

let container: HTMLDivElement;
let root: Root;

async function render(ui: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
});

function trigger(): HTMLButtonElement {
  const el = container.querySelector('[role="combobox"]');
  if (!el) throw new Error("combobox trigger not found");
  return el as HTMLButtonElement;
}

describe("ReasoningPicker", () => {
  it("loads the saved effort from config into the trigger", async () => {
    vi.mocked(api.getConfig).mockResolvedValue({
      agent: { reasoning_effort: "high" },
    } as never);
    await render(<ReasoningPicker currentModel="test/model" />);
    expect(container.textContent).toContain("reasoning");
    expect(trigger().textContent).toContain("High");
  });

  it("opens the PortalSelect listbox in a portal with all effort options", async () => {
    vi.mocked(api.getConfig).mockResolvedValue({
      agent: { reasoning_effort: "medium" },
    } as never);
    await render(<ReasoningPicker currentModel="test/model" />);
    await act(async () => {
      trigger().click();
    });
    const listbox = document.body.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();
    expect(listbox!.textContent).toContain("Off (no thinking)");
    expect(listbox!.textContent).toContain("Ultra");
    // Portal renders outside the component container (overflow-safe).
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("saves the picked effort to config via read-modify-write", async () => {
    vi.mocked(api.getConfig).mockResolvedValue({
      agent: { reasoning_effort: "medium" },
    } as never);
    vi.mocked(api.saveConfig).mockResolvedValue({ ok: true } as never);
    const onChanged = vi.fn();
    await render(
      <ReasoningPicker currentModel="test/model" onChanged={onChanged} />,
    );
    await act(async () => {
      trigger().click();
    });
    const listbox = document.body.querySelector('[role="listbox"]')!;
    const xhigh = Array.from(listbox.querySelectorAll('[role="option"]')).find(
      (o) => o.textContent?.includes("Extra High"),
    ) as HTMLElement;
    await act(async () => {
      xhigh.click();
    });
    expect(api.saveConfig).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(api.saveConfig).mock.calls[0][0] as {
      agent: Record<string, unknown>;
    };
    expect(saved.agent.reasoning_effort).toBe("xhigh");
    expect(onChanged).toHaveBeenCalledWith("xhigh");
  });
});
