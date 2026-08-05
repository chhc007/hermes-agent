// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { Markdown } from "./Markdown";

let host: HTMLDivElement;
let root: Root;

function renderMarkdown(md: string): string {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(<Markdown content={md} />);
  });
  return host.innerHTML;
}

describe("Markdown table support", () => {
  it("renders a pipe table with header + rows", () => {
    const md = [
      "| Name | Age |",
      "| --- | --- |",
      "| Alice | 30 |",
      "| Bob | 25 |",
    ].join("\n");
    const html = renderMarkdown(md);
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("Name");
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).not.toContain("---");
  });

  it("renders an aligned table (colons in separator)", () => {
    const md = [
      "| Left | Right |",
      "| :--- | ---: |",
      "| a | b |",
    ].join("\n");
    const html = renderMarkdown(md);
    expect(html).toContain("<table");
    expect(html).toContain("a");
    expect(html).toContain("b");
  });

  it("does not treat a pipe-less line as a table", () => {
    const html = renderMarkdown("just a paragraph");
    expect(html).not.toContain("<table");
    expect(html).toContain("just a paragraph");
  });
});

describe("Markdown media support", () => {
  it("renders a MEDIA: line as an image", () => {
    const html = renderMarkdown("MEDIA:/home/hermes/.hermes/images/test.png");
    expect(html).toContain("/api/media");
    expect(html).toContain("test.png");
    expect(html).toContain("<img");
  });

  it("renders a markdown image on its own line", () => {
    const html = renderMarkdown("![diagram](/tmp/chart.png)");
    expect(html).toContain("/api/media");
    expect(html).toContain("chart.png");
    expect(html).toContain("diagram");
  });

  it("does not render a bare path line as media", () => {
    const html = renderMarkdown("/home/hermes/images/test.png");
    expect(html).not.toContain("<img");
  });

  it("keeps inline images inside a paragraph inline", () => {
    // Inline markdown image syntax is rendered as a media block only when it
    // occupies its own line; inside a paragraph it stays text for now.
    const html = renderMarkdown("See ![a](b.png) here");
    expect(html).toContain("See");
  });
});
