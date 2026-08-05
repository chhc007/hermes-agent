// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { ClarifyCard } from "./ClarifyCard";

let container: HTMLDivElement;
let root: Root;

async function render(ui: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

const base = {
  requestId: "r1",
  question: "Pick one",
  choices: ["alpha", "beta", "gamma"],
  multiSelect: false,
};

describe("ClarifyCard", () => {
  it("renders the question and all single-select choices", async () => {
    await render(<ClarifyCard clarify={base} onAnswer={vi.fn()} />);
    expect(container.textContent).toContain("Pick one");
    expect(container.textContent).toContain("alpha");
    expect(container.textContent).toContain("beta");
    expect(container.textContent).toContain("gamma");
  });

  it("submits the chosen label for single-select", async () => {
    const onAnswer = vi.fn(async () => true);
    await render(<ClarifyCard clarify={base} onAnswer={onAnswer} />);
    const radios = container.querySelectorAll('input[type="radio"]');
    await act(async () => {
      (radios[1] as HTMLInputElement).click();
    });
    const submit = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("提交"),
    );
    await act(async () => {
      submit!.click();
    });
    expect(onAnswer).toHaveBeenCalledWith("r1", "beta");
  });

  it("submits a JSON array of labels for multi-select", async () => {
    const onAnswer = vi.fn(async () => true);
    await render(
      <ClarifyCard
        clarify={{ ...base, multiSelect: true }}
        onAnswer={onAnswer}
      />,
    );
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    await act(async () => {
      (boxes[0] as HTMLInputElement).click();
      (boxes[2] as HTMLInputElement).click();
    });
    const submit = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("提交"),
    );
    await act(async () => {
      submit!.click();
    });
    expect(onAnswer).toHaveBeenCalledWith("r1", JSON.stringify(["alpha", "gamma"]));
  });

  it("submits free text through the Other path", async () => {
    const onAnswer = vi.fn(async () => true);
    await render(<ClarifyCard clarify={base} onAnswer={onAnswer} />);
    const other = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Other"),
    );
    await act(async () => {
      other!.click();
    });
    const input = container.querySelector("input") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, "custom answer");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const submit = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("提交"),
    );
    await act(async () => {
      submit!.click();
    });
    expect(onAnswer).toHaveBeenCalledWith("r1", "custom answer");
  });

  it("keeps the card visible and shows an error when submit fails", async () => {
    const onAnswer = vi.fn(async () => false);
    await render(<ClarifyCard clarify={base} onAnswer={onAnswer} />);
    const radios = container.querySelectorAll('input[type="radio"]');
    await act(async () => {
      (radios[0] as HTMLInputElement).click();
    });
    const submit = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("提交"),
    );
    await act(async () => {
      submit!.click();
    });
    expect(container.textContent).toContain("Pick one");
    expect(container.textContent).toContain("提交失败");
  });
});
