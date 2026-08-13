// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortalSelect, PortalSelectOption } from "./PortalSelect";

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
  // Portal listboxes are body children; drop any leftovers between tests.
  document.body.innerHTML = "";
});

function options() {
  return (
    <>
      <PortalSelectOption value="a">Alpha</PortalSelectOption>
      <PortalSelectOption value="b">Beta</PortalSelectOption>
      <PortalSelectOption value="c">Gamma</PortalSelectOption>
    </>
  );
}

function trigger(): HTMLButtonElement {
  const el = container.querySelector('[role="combobox"]');
  if (!el) throw new Error("trigger not found");
  return el as HTMLButtonElement;
}

function listbox(): HTMLElement | null {
  return document.body.querySelector('[role="listbox"]');
}

describe("PortalSelect", () => {
  it("renders the selected option label in the trigger", async () => {
    await render(<PortalSelect value="b">{options()}</PortalSelect>);
    expect(trigger().textContent).toContain("Beta");
  });

  it("renders the placeholder when nothing is selected", async () => {
    await render(
      <PortalSelect placeholder="pick one">{options()}</PortalSelect>,
    );
    expect(trigger().textContent).toContain("pick one");
  });

  it("opens the listbox into document.body (not the clipped container)", async () => {
    await render(<PortalSelect value="a">{options()}</PortalSelect>);
    await act(async () => {
      trigger().click();
    });
    // In the portal: body child, outside the component's own container.
    expect(listbox()).not.toBeNull();
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(listbox()!.textContent).toContain("Gamma");
  });

  it("selects an option, calls onValueChange and closes", async () => {
    const onValueChange = vi.fn();
    await render(
      <PortalSelect value="a" onValueChange={onValueChange}>
        {options()}
      </PortalSelect>,
    );
    await act(async () => {
      trigger().click();
    });
    const gamma = Array.from(listbox()!.querySelectorAll('[role="option"]')).find(
      (o) => o.textContent?.includes("Gamma"),
    ) as HTMLElement;
    await act(async () => {
      gamma.click();
    });
    expect(onValueChange).toHaveBeenCalledWith("c");
    expect(listbox()).toBeNull();
  });

  it("does not open when disabled", async () => {
    await render(
      <PortalSelect value="a" disabled>
        {options()}
      </PortalSelect>,
    );
    await act(async () => {
      trigger().click();
    });
    expect(listbox()).toBeNull();
  });

  it("closes on outside mousedown but not on trigger clicks", async () => {
    await render(<PortalSelect value="a">{options()}</PortalSelect>);
    await act(async () => {
      trigger().click();
    });
    expect(listbox()).not.toBeNull();
    // Mousedown inside the open listbox must NOT close it.
    await act(async () => {
      listbox()!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(listbox()).not.toBeNull();
    // Mousedown on the body (outside) closes it.
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(listbox()).toBeNull();
  });

  it("navigates with ArrowDown + Enter and selects the highlighted option", async () => {
    const onValueChange = vi.fn();
    await render(
      <PortalSelect value="b" onValueChange={onValueChange}>
        {options()}
      </PortalSelect>,
    );
    // Open via keyboard: ArrowDown from a closed select highlights the
    // current value (b, index 1), then Enter selects it.
    await act(async () => {
      trigger().dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    expect(listbox()).not.toBeNull();
    await act(async () => {
      trigger().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onValueChange).toHaveBeenCalledWith("b");
    expect(listbox()).toBeNull();
  });

  it("closes on Escape", async () => {
    await render(<PortalSelect value="a">{options()}</PortalSelect>);
    await act(async () => {
      trigger().click();
    });
    expect(listbox()).not.toBeNull();
    await act(async () => {
      trigger().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(listbox()).toBeNull();
  });

  it("flips above the trigger when there is no room below", async () => {
    const rect = {
      bottom: 736,
      height: 36,
      left: 10,
      right: 110,
      top: 700,
      width: 100,
      x: 10,
      y: 700,
      toJSON: () => ({}),
    } as DOMRect;
    const spy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue(rect);
    try {
      await render(<PortalSelect value="a">{options()}</PortalSelect>);
      await act(async () => {
        trigger().click();
      });
      // 3 options → estimated height 3*36+8=116. Below: 736+4+116=856 >
      // innerHeight(768)-8 → flips above: 700-116-4=580.
      const box = listbox()!;
      expect(box.style.top).toBe("580px");
      expect(box.style.left).toBe("10px");
      expect(box.style.width).toBe("100px");
    } finally {
      spy.mockRestore();
    }
  });

  it("repositions on window scroll while open", async () => {
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    spy.mockReturnValue({
      bottom: 40,
      height: 36,
      left: 10,
      right: 110,
      top: 4,
      width: 100,
      x: 10,
      y: 4,
      toJSON: () => ({}),
    } as DOMRect);
    try {
      await render(<PortalSelect value="a">{options()}</PortalSelect>);
      await act(async () => {
        trigger().click();
      });
      expect(listbox()!.style.top).toBe("44px");
      // Simulate the trigger moving (scroll) — position must track it.
      spy.mockReturnValue({
        bottom: 500,
        height: 36,
        left: 10,
        right: 110,
        top: 464,
        width: 100,
        x: 10,
        y: 464,
        toJSON: () => ({}),
      } as DOMRect);
      await act(async () => {
        window.dispatchEvent(new Event("scroll"));
        await new Promise((r) => setTimeout(r, 30)); // let the rAF tick
      });
      expect(listbox()!.style.top).toBe("504px");
    } finally {
      spy.mockRestore();
    }
  });
});
