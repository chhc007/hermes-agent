// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { isMediaPath, mediaUrl } from "@/lib/media";

import { MediaImage } from "./MediaImage";

let container: HTMLDivElement;
let root: Root;

async function render(ui: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

describe("mediaUrl", () => {
  it("maps an absolute path to the /api/media endpoint", () => {
    expect(mediaUrl("/home/hermes/.hermes/images/a.png")).toBe(
      "/api/media?path=%2Fhome%2Fhermes%2F.hermes%2Fimages%2Fa.png",
    );
  });

  it("passes http(s) URLs through unchanged", () => {
    expect(mediaUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
  });

  it("passes data URLs through unchanged", () => {
    expect(mediaUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });
});

describe("isMediaPath", () => {
  it("accepts common image extensions", () => {
    expect(isMediaPath("/tmp/x.png")).toBe(true);
    expect(isMediaPath("/tmp/x.jpeg")).toBe(true);
    expect(isMediaPath("/tmp/x.JPG")).toBe(true);
    expect(isMediaPath("/tmp/x.gif")).toBe(true);
    expect(isMediaPath("/tmp/x.webp")).toBe(true);
  });

  it("rejects non-image paths", () => {
    expect(isMediaPath("/tmp/x.txt")).toBe(false);
    expect(isMediaPath("/tmp/x.py")).toBe(false);
    expect(isMediaPath("")).toBe(false);
  });
});

describe("MediaImage", () => {
  it("renders an img pointing at /api/media", async () => {
    await render(<MediaImage src="/tmp/test.png" alt="t" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toContain("/api/media");
    expect(img!.getAttribute("alt")).toBe("t");
  });

  it("opens a lightbox on click and closes on Escape", async () => {
    await render(<MediaImage src="/tmp/test.png" />);
    const img = container.querySelector("img")!;
    await act(async () => {
      img.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders nothing for an empty src", async () => {
    await render(<MediaImage src="" />);
    expect(container.querySelector("img")).toBeNull();
  });
});
