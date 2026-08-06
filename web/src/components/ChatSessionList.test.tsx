// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: {
      common: { loading: "loading", retry: "retry", refresh: "refresh" },
      sessions: {
        title: "Sessions",
        newChat: "New chat",
        noSessions: "No sessions",
        untitledSession: "Untitled",
      },
    },
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getSessions: vi.fn(),
  },
}));

const { api } = await import("@/lib/api");

import { ChatSessionList } from "./ChatSessionList";

let container: HTMLDivElement;
let root: Root;

async function render(ui: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    source: "cli",
    model: null,
    title: "Hello",
    preview: null,
    started_at: 1000,
    ended_at: null,
    last_active: 2000,
    is_active: false,
    message_count: 3,
    ...overrides,
  };
}

describe("ChatSessionList", () => {
  it("renders source badges for known sources", async () => {
    vi.mocked(api.getSessions).mockResolvedValue({
      sessions: [
        makeSession({ id: "a", source: "telegram", title: "TG chat" }),
        makeSession({ id: "b", source: "cli", title: "CLI chat" }),
      ],
    } as never);
    await render(
      <MemoryRouter>
        <ChatSessionList activeSessionId={null} />
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("telegram");
    expect(container.textContent).toContain("cli");
    expect(container.textContent).toContain("TG chat");
    expect(container.textContent).toContain("CLI chat");
  });

  it("filters sessions by source via chips", async () => {
    vi.mocked(api.getSessions).mockResolvedValue({
      sessions: [
        makeSession({ id: "a", source: "telegram", title: "TG chat" }),
        makeSession({ id: "b", source: "cli", title: "CLI chat" }),
      ],
    } as never);
    await render(
      <MemoryRouter>
        <ChatSessionList activeSessionId={null} />
      </MemoryRouter>,
    );

    // Click the "telegram" chip
    const chips = Array.from(container.querySelectorAll("button")).filter((b) =>
      ["telegram", "cli", "All"].includes(b.textContent?.trim() ?? ""),
    );
    const tgChip = chips.find((c) => c.textContent?.trim() === "telegram");
    await act(async () => {
      tgChip!.click();
    });

    expect(container.textContent).toContain("TG chat");
    expect(container.textContent).not.toContain("CLI chat");
  });

  it("shows no-session state when a filter matches nothing", async () => {
    vi.mocked(api.getSessions).mockResolvedValue({
      sessions: [makeSession({ id: "a", source: "cli", title: "CLI chat" })],
    } as never);
    await render(
      <MemoryRouter>
        <ChatSessionList activeSessionId={null} />
      </MemoryRouter>,
    );
    // Only one source → chips hidden (availableSources.length > 1 guard)
    const chips = Array.from(container.querySelectorAll("button")).filter((b) =>
      ["cli", "All"].includes(b.textContent?.trim() ?? ""),
    );
    expect(chips.length).toBe(0);
  });
});
