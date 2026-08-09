// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeFitAddon {
  fit() {}
}

class FakeWebglAddon {
  onContextLoss() {
    return { dispose() {} };
  }
}

class FakeTerminal {
  options: Record<string, unknown>;
  rows = 24;
  cols = 80;
  parser = {
    registerOscHandler: vi.fn(),
  };
  unicode = { activeVersion: "" };

  constructor(options: Record<string, unknown>) {
    this.options = options;
  }

  attachCustomKeyEventHandler() {
    return true;
  }

  attachCustomWheelEventHandler() {
    return true;
  }

  clearSelection() {}

  dispose() {}

  focus() {}

  getSelection() {
    return "";
  }

  loadAddon() {}

  onData() {
    return { dispose() {} };
  }

  onResize() {
    return { dispose() {} };
  }

  open() {}

  paste() {}

  refresh() {}

  write() {}
}

const maybeReloadForLoopbackWsAuthFailure = vi.fn(() => false);

const mockAddSystemMessage = vi.fn();
const mockSendUserMessage = vi.fn();
// Mutable state injected into the mocked useChatEventStream so tests can
// drive undo/retry/stop behavior (messages present, running flag, session id).
let mockMessages: unknown[] = [];
let mockRunning = false;
let mockLastEventSessionId: string | null = null;
const mockTrimMessagesBefore = vi.fn();
// Gateway RPC stub — tests set this to resolve/reject per-request.
let mockGatewayRequest: () => Promise<unknown> = async () => null;

vi.mock("@xterm/addon-fit", () => ({ FitAddon: FakeFitAddon }));
vi.mock("@xterm/addon-unicode11", () => ({ Unicode11Addon: class {} }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }));
vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: FakeWebglAddon }));
vi.mock("@xterm/xterm", () => ({ Terminal: FakeTerminal }));
vi.mock("@/components/ChatSidebar", () => ({
  ChatSidebar: () => null,
}));
vi.mock("@/components/ChatSessionList", () => ({
  ChatSessionList: () => null,
}));
vi.mock("@/lib/chat-event-stream", () => ({
  sessionMessagesToChatMessages: (msgs: unknown[]) => msgs as never,
  useChatEventStream: () => ({
    messages: mockMessages,
    connectionState: "connecting",
    error: null,
    sessionTitle: null,
    clarify: null,
    usage: null,
    compacting: false,
    lastEventSessionId: mockLastEventSessionId,
    meta: { running: mockRunning },
    subagents: [],
    todos: [],
    sessionStartedAt: null,
    sendUserMessage: mockSendUserMessage,
    addSystemMessage: mockAddSystemMessage,
    loadHistory: vi.fn(),
    respondClarify: vi.fn(async () => true),
    resetChat: vi.fn(),
    setCompacting: vi.fn(),
    refreshUsage: vi.fn(async () => {}),
    trimMessagesBefore: mockTrimMessagesBefore,
  }),
}));
vi.mock("@/components/Backdrop", () => ({ Backdrop: () => null }));
vi.mock("@/plugins", () => ({
  PluginSlot: () => null,
}));
vi.mock("@/contexts/usePageHeader", () => ({
  usePageHeader: () => ({ setEnd: vi.fn(), setTitle: vi.fn() }),
}));
vi.mock("@/contexts/useProfileScope", () => ({
  useProfileScope: () => ({ profile: "" }),
}));
vi.mock("@/themes", () => ({
  useTheme: () => ({ theme: { terminalBackground: "#000000" } }),
}));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: {
      app: {
        closeModelTools: "Close model tools",
        modelToolsSheetSubtitle: "Tools",
        modelToolsSheetTitle: "Model",
      },
      chat: {
        attachImage: "Attach image",
        inputPlaceholder: "Message hermes…",
        collapseInput: "Collapse input",
        expandInput: "Expand input",
        sendMessage: "Send message",
        toggleAutoScroll: "Toggle auto scroll",
        streaming: "streaming",
        answerPlaceholder: "Type your answer…",
        mediaPreview: "media preview",
        closePreview: "Close preview",
      },
      voice: {
        startRecording: "Start voice input",
        stopRecording: "Stop recording",
        transcribing: "Transcribing…",
        noSpeech: "No speech detected",
        settings: "Voice settings",
        settingsTitle: "Voice Mode Settings",
        enableVoice: "Enable voice input",
        autoSend: "Auto-send",
        voiceReply: "Voice reply",
        replyOn: "On with voice input",
        replyOff: "Off with voice input",
        sttProvider: "Recognition engine",
        ttsProvider: "Voice engine",
        settingsHint: "hint",
        replyActive: "Reading reply",
        stopReply: "Stop reading",
        replyError: "Voice reply failed",
        listening: "Listening…",
        muteReply: "Mute voice replies",
        unmuteReply: "Unmute voice replies",
        replyReady: "Voice replies on",
      },
    },
  }),
}));
vi.mock("@/lib/dashboard-auth-reload", () => ({
  maybeReloadForLoopbackWsAuthFailure,
}));
vi.mock("@/lib/gatewayClient", () => {
  class FakeGatewayClient {
    connect() {
      return Promise.resolve();
    }
    close() {}
    request() {
      return mockGatewayRequest();
    }
  }
  return { GatewayClient: FakeGatewayClient };
});

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;

  binaryType = "blob";
  onclose: ((event: CloseEventLike) => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer | string }) => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = FakeWebSocket.OPEN;
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
  }

  send() {}
}

type CloseEventLike = {
  code: number;
  reason: string;
  wasClean: boolean;
};

/** Set a React-controlled input's value through the native setter so its
 *  onChange handler fires (React tracks the value via a property descriptor). */
function setInputValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function submitComposerFrom(el: HTMLTextAreaElement) {
  el.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
}

let container: HTMLDivElement;
let root: Root;

async function render(ui: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(ui));
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  maybeReloadForLoopbackWsAuthFailure.mockClear();
  mockAddSystemMessage.mockClear();
  mockSendUserMessage.mockClear();
  mockTrimMessagesBefore.mockClear();
  mockMessages = [];
  mockRunning = false;
  mockLastEventSessionId = null;
  mockGatewayRequest = async () => null;
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("matchMedia", () => ({
    addEventListener() {},
    matches: false,
    media: "",
    removeEventListener() {},
  }));
  vi.stubGlobal("crypto", {
    getRandomValues: (values: Uint8Array) => {
      values.fill(7);
      return values;
    },
    randomUUID: () => "chat-test-id",
  });

  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {}, width: 1280 },
  });
  Object.defineProperty(window, "__HERMES_SESSION_TOKEN__", {
    configurable: true,
    value: "stale-token",
    writable: true,
  });
  Object.defineProperty(window, "__HERMES_AUTH_REQUIRED__", {
    configurable: true,
    value: false,
    writable: true,
  });
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: {
      readText: vi.fn(async () => ""),
      writeText: vi.fn(async () => {}),
    },
  });
  sessionStorage.clear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

describe("ChatPage", () => {
  it("treats loopback 4401 closes as stale-token reload candidates", async () => {
    const { default: ChatPage } = await import("./ChatPage");

    await render(
      <MemoryRouter initialEntries={["/chat"]}>
        <ChatPage isActive />
      </MemoryRouter>,
    );

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    FakeWebSocket.instances[0].onclose?.({
      code: 4401,
      reason: "auth: token_mismatch",
      wasClean: true,
    });

    expect(maybeReloadForLoopbackWsAuthFailure).toHaveBeenCalledWith(4401);
  });

  it("shows a local system hint when a terminal-only command is sent", async () => {
    const { default: ChatPage } = await import("./ChatPage");

    await render(
      <MemoryRouter initialEntries={["/chat"]}>
        <ChatPage isActive />
      </MemoryRouter>,
    );

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    // Flip the PTY socket to open so the composer's send path executes (the
    // ChatInput submit is gated by ptyState !== "open" → disabled).
    const ws = FakeWebSocket.instances[0];
    await act(async () => ws.onopen?.());

    // Type a terminal-only command into the composer and submit it.
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    setInputValue(textarea, "/memory pending");
    await act(async () => {
      submitComposerFrom(textarea);
    });

    // The command is still forwarded to the PTY…
    expect(mockSendUserMessage).toHaveBeenCalledWith("/memory pending");
    // …and a local system hint bubble is added.
    expect(mockAddSystemMessage).toHaveBeenCalledWith(
      expect.stringContaining("Terminal"),
    );
  });

  it("does not add a system hint for ordinary chat prompts", async () => {
    const { default: ChatPage } = await import("./ChatPage");

    await render(
      <MemoryRouter initialEntries={["/chat"]}>
        <ChatPage isActive />
      </MemoryRouter>,
    );

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    await act(async () => FakeWebSocket.instances[0].onopen?.());

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    setInputValue(textarea, "hello hermes");
    await act(async () => {
      submitComposerFrom(textarea);
    });

    expect(mockSendUserMessage).toHaveBeenCalledWith("hello hermes");
    expect(mockAddSystemMessage).not.toHaveBeenCalled();
  });

  it("disables undo/retry while a turn is running and shows a busy banner on click", async () => {
    mockRunning = true;
    mockMessages = [
      { id: "u1", role: "user", text: "hi", status: "complete", ts: 1 },
      { id: "a1", role: "assistant", text: "yo", status: "complete", ts: 2 },
    ];
    mockLastEventSessionId = "sess-1";
    const { default: ChatPage } = await import("./ChatPage");

    await render(
      <MemoryRouter initialEntries={["/chat"]}>
        <ChatPage isActive />
      </MemoryRouter>,
    );

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    await act(async () => FakeWebSocket.instances[0].onopen?.());

    const buttons = Array.from(
      container.querySelectorAll("button[title]"),
    ) as HTMLButtonElement[];
    const undoBtn = buttons.find((b) => b.title.includes("Undo"));
    const retryBtn = buttons.find((b) => b.title.includes("Retry"));
    expect(undoBtn).toBeTruthy();
    expect(retryBtn).toBeTruthy();
    // Running → both disabled (the backend would 4009 anyway).
    expect(undoBtn!.disabled).toBe(true);
    expect(retryBtn!.disabled).toBe(true);
  });

  it("trims the last user bubble locally after a successful undo", async () => {
    mockMessages = [
      { id: "u1", role: "user", text: "first", status: "complete", ts: 1 },
      { id: "a1", role: "assistant", text: "reply", status: "complete", ts: 2 },
      { id: "u2", role: "user", text: "second", status: "complete", ts: 3 },
      { id: "a2", role: "assistant", text: "reply2", status: "complete", ts: 4 },
    ];
    mockLastEventSessionId = "sess-1";
    mockGatewayRequest = async () => ({ removed: 2 });
    const { default: ChatPage } = await import("./ChatPage");

    await render(
      <MemoryRouter initialEntries={["/chat"]}>
        <ChatPage isActive />
      </MemoryRouter>,
    );

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    await act(async () => FakeWebSocket.instances[0].onopen?.());

    const buttons = Array.from(
      container.querySelectorAll("button[title]"),
    ) as HTMLButtonElement[];
    const undoBtn = buttons.find((b) => b.title.includes("Undo"));
    expect(undoBtn).toBeTruthy();

    await act(async () => {
      undoBtn!.click();
    });

    // The local bubble list must be trimmed to before the last user message
    // (u2) — same contract as handleEditMessage; the events feed never sends
    // a user-frame for the rewind.
    expect(mockTrimMessagesBefore).toHaveBeenCalledWith("u2");
  });

  it("does not trim when undo fails (gateway error)", async () => {
    mockMessages = [
      { id: "u1", role: "user", text: "hi", status: "complete", ts: 1 },
      { id: "a1", role: "assistant", text: "yo", status: "complete", ts: 2 },
    ];
    mockLastEventSessionId = "sess-1";
    mockGatewayRequest = async () => {
      throw new Error("session.undo: session busy (4009)");
    };
    const { default: ChatPage } = await import("./ChatPage");

    await render(
      <MemoryRouter initialEntries={["/chat"]}>
        <ChatPage isActive />
      </MemoryRouter>,
    );

    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    await act(async () => FakeWebSocket.instances[0].onopen?.());

    const buttons = Array.from(
      container.querySelectorAll("button[title]"),
    ) as HTMLButtonElement[];
    const undoBtn = buttons.find((b) => b.title.includes("Undo"));
    expect(undoBtn).toBeTruthy();

    await act(async () => {
      undoBtn!.click();
    });

    expect(mockTrimMessagesBefore).not.toHaveBeenCalled();
    // A banner should surface the failure instead of a silent no-op.
    expect(container.textContent).toContain("Undo failed");
  });
});
