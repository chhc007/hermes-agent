// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useSearchParams } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Unmount so document-level listeners (visibilitychange, intervals)
    // from one test don't leak into the next.
    await act(async () => root?.unmount());
    container?.remove();
  });

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

  it("refetches immediately when the ?resume param changes", async () => {
    vi.mocked(api.getSessions).mockResolvedValue({
      sessions: [makeSession({ id: "s1" })],
    } as never);
    // Harness that flips the resume param, simulating a pick / new chat
    // landing from outside the list.
    function ResumeChanger() {
      const [, setSearchParams] = useSearchParams();
      return (
        <button type="button" onClick={() => setSearchParams({ resume: "s2" })}>
          switch
        </button>
      );
    }
    await render(
      <MemoryRouter initialEntries={["/chat?resume=s1"]}>
        <ResumeChanger />
        <ChatSessionList activeSessionId={null} />
      </MemoryRouter>,
    );
    // Mount only: the resume effect must not double-fetch on first run.
    expect(api.getSessions).toHaveBeenCalledTimes(1);
    await act(async () => {
      const btn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("switch"),
      )!;
      btn.click();
    });
    expect(api.getSessions).toHaveBeenCalledTimes(2);
  });

  it("polls silently every 30 seconds", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(api.getSessions).mockResolvedValue({
        sessions: [makeSession({ id: "s1" })],
      } as never);
      await render(
        <MemoryRouter>
          <ChatSessionList activeSessionId={null} />
        </MemoryRouter>,
      );
      expect(api.getSessions).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      expect(api.getSessions).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      expect(api.getSessions).toHaveBeenCalledTimes(3);
    } finally {
      await act(async () => root?.unmount());
      vi.useRealTimers();
    }
  });

  it("refetches silently when the tab becomes visible", async () => {
    vi.mocked(api.getSessions).mockResolvedValue({
      sessions: [makeSession({ id: "s1" })],
    } as never);
    await render(
      <MemoryRouter>
        <ChatSessionList activeSessionId={null} />
      </MemoryRouter>,
    );
    expect(api.getSessions).toHaveBeenCalledTimes(1);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    // jsdom's default visibilityState is "visible" → silent refetch.
    expect(api.getSessions).toHaveBeenCalledTimes(2);
  });
});
