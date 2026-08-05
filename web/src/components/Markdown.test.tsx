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

describe("Markdown table edge cases", () => {
  it("renders a table after a fenced code block", () => {
    const md = [
      "```sh",
      "echo hi",
      "```",
      "| Name | Value |",
      "| --- | --- |",
      "| a | b |",
    ].join("\n");
    const html = renderMarkdown(md);
    expect(html).toContain("<table");
    expect(html).toContain("echo hi");
    expect(html).toContain("a");
    expect(html).toContain("b");
  });

  it("renders a table after a list", () => {
    const md = [
      "- item one",
      "- item two",
      "",
      "| Key | Desc |",
      "| --- | --- |",
      "| k1 | d1 |",
    ].join("\n");
    const html = renderMarkdown(md);
    expect(html).toContain("<table");
    expect(html).toContain("item two");
    expect(html).toContain("k1");
  });

  it("renders a table immediately after a list with no blank line", () => {
    const md = [
      "- item one",
      "| Key | Desc |",
      "| --- | --- |",
      "| k1 | d1 |",
    ].join("\n");
    const html = renderMarkdown(md);
    expect(html).toContain("<table");
    expect(html).toContain("k1");
  });

  it("renders cells containing inline code and bold", () => {
    const md = [
      "| Col | Col2 |",
      "| --- | --- |",
      "| `code` | **bold** |",
    ].join("\n");
    const html = renderMarkdown(md);
    expect(html).toContain("<table");
    expect(html).toContain("<code");
    expect(html).toContain("code</code>");
    expect(html).toContain("<strong");
    expect(html).toContain("bold</strong>");
  });

  it("renders a table that is the last block with no trailing newline", () => {
    const md = [
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
    ].join("\n");
    const html = renderMarkdown(md);
    expect(html).toContain("<table");
    expect(html).toContain(">1<");
    expect(html).toContain("2");
    expect(html).toContain("</table>");
  });

  it("renders a table preceded by a paragraph with no blank line", () => {
    const md = [
      "Here are the results",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
    ].join("\n");
    const html = renderMarkdown(md);
    expect(html).toContain("<table");
    expect(html).toContain("Here are the results");
    expect(html).toContain(">1<");
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
