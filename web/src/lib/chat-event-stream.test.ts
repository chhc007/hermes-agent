// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildEventFrame,
  chatEventStreamReducer,
  createInitialState,
  parseEventFrame,
  sessionMessagesToChatMessages,
  type ChatEventStreamState,
  type ToolStatus,
} from "./chat-event-stream";

/** Run a sequence of event frames through the reducer. */
function reduce(events: Array<[string, unknown?]>) {
  let state = createInitialState();
  for (const [type, payload] of events) {
    state = chatEventStreamReducer(state, { type: "event", eventType: type, payload });
  }
  return state;
}

function init(messages: ChatEventStreamState["messages"] = []): ChatEventStreamState {
  return {
    messages,
    connectionState: "open",
    error: null,
    sessionTitle: null,
    activeSessionId: null,
    clarify: null,
    usage: null,
    compacting: false,
  };
}

describe("parseEventFrame", () => {
  it("parses a well-formed event frame", () => {
    const frame = parseEventFrame(buildEventFrame("tool.start", { tool_id: "1" }));
    expect(frame).toEqual({ type: "tool.start", payload: { tool_id: "1" } });
  });

  it("returns null for non-event frames", () => {
    expect(parseEventFrame(JSON.stringify({ jsonrpc: "2.0", method: "ping" }))).toBeNull();
    expect(parseEventFrame("not json")).toBeNull();
    expect(parseEventFrame(JSON.stringify({ method: "event", params: {} }))).toBeNull();
  });
});

describe("session.info", () => {
  it("records the title from a session.info frame", () => {
    const state = reduce([["session.info", { title: "My session" }]]);
    expect(state.sessionTitle).toBe("My session");
  });

  it("records the stored_session_id as the active session id", () => {
    const state = reduce([
      ["session.info", { title: "My session", stored_session_id: "20260806_123456_abcd" }],
    ]);
    expect(state.activeSessionId).toBe("20260806_123456_abcd");
  });
});

describe("full turn: thinking + tools + streamed prose", () => {
  it("assembles a complete assistant message with a thought block and a tool card", () => {
    const state = reduce([
      ["message.start", {}],
      ["thinking.delta", { text: "Let me think about" }],
      ["thinking.delta", { text: " this." }],
      ["tool.start", { tool_id: "t1", name: "read_file", args_text: "param=value", context: "foo" }],
      ["tool.progress", { name: "read_file", preview: "reading…" }],
      ["tool.complete", { tool_id: "t1", name: "read_file", summary: "3 lines", duration_s: 0.5, result_text: "x" }],
      ["message.delta", { text: "Here is the" }],
      ["message.delta", { text: " answer." }],
      ["message.complete", { text: "" }],
    ]);

    expect(state.messages).toHaveLength(1);
    const [msg] = state.messages;
    expect(msg.role).toBe("assistant");
    expect(msg.status).toBe("complete");
    expect(msg.thinking?.replace(/\s+/g, " ").trim()).toBe("Let me think about this.");
    expect(msg.text?.replace(/\s+/g, " ").trim()).toBe("Here is the answer.");
    expect(msg.tools).toHaveLength(1);
    const tool = msg.tools![0];
    expect(tool.name).toBe("read_file");
    expect(tool.status).toBe("complete");
    expect(tool.summary).toBe("3 lines");
  });

  it("marks a tool with error as status error", () => {
    const state = reduce([
      ["message.start", {}],
      ["tool.start", { tool_id: "t1", name: "terminal" }],
      ["tool.complete", { tool_id: "t1", name: "terminal", error: "command failed", duration_s: 0.1 }],
      ["message.complete", { text: "done" }],
    ]);
    const tool = state.messages[0]!.tools![0];
    expect(tool.status).toBe("error");
    expect(tool.error).toBe("command failed");
  });
});

describe("turn boundaries", () => {
  it("message.start opens a fresh message and seals the previous one", () => {
    const state = reduce([
      ["message.start", {}],
      ["message.delta", { text: "first turn" }],
      ["message.complete", { text: "" }],
      ["message.start", {}],
    ]);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]!.status).toBe("complete");
    expect(state.messages[1]!.status).toBe("streaming");
  });

  it("message.complete without a prior message.start synthesizes a message", () => {
    const state = reduce([["message.complete", { text: "error only" }]]);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]!.text).toBe("error only");
    expect(state.messages[0]!.status).toBe("complete");
  });

  it("streaming deltas accumulate into prose", () => {
    const state = reduce([
      ["message.start", {}],
      ["message.delta", { text: "A" }],
      ["message.delta", { text: "B" }],
      ["message.delta", { text: "C" }],
    ]);
    expect(state.messages[0]!.text).toBe("ABC");
    expect(state.messages[0]!.status).toBe("streaming");
  });
});

describe("tool lifecycle edge cases", () => {
  it("tool.start attaches to the current assistant message when no prose yet", () => {
    const state = reduce([
      ["message.start", {}],
      ["tool.start", { tool_id: "t9", name: "web_search" }],
    ]);
    const [msg] = state.messages;
    expect(msg.tools).toHaveLength(1);
    expect(msg.tools![0]!.status).toBe("running");
  });

  it("multiple tools on one message stay distinct by tool_id", () => {
    const state = reduce([
      ["message.start", {}],
      ["tool.start", { tool_id: "a", name: "read_file" }],
      ["tool.start", { tool_id: "b", name: "web_search" }],
      ["tool.complete", { tool_id: "a", name: "read_file" }],
    ]);
    const tools = state.messages[0]!.tools!;
    expect(tools).toHaveLength(2);
    const byId: Record<string, ToolStatus> = {};
    for (const t of tools) byId[t.tool_id] = t.status;
    expect(byId.a).toBe("complete");
    expect(byId.b).toBe("running");
  });

  it("tool.progress for an unknown tool is a no-op", () => {
    const before = init([
      { id: "m1", role: "assistant", status: "streaming", ts: 1 },
    ]);
    const after = chatEventStreamReducer(before, {
      type: "event",
      eventType: "tool.progress",
      payload: { name: "nope", preview: "x" },
    });
    expect(after).toBe(before);
  });

  it("tool.complete preserves earlier fields when payload omits them", () => {
    const before = init([
      {
        id: "m1",
        role: "assistant",
        status: "streaming",
        ts: 1,
        segments: [
          { kind: "tool" as const, toolId: "a", name: "read_file", status: "running" as const },
        ],
        tools: [{ tool_id: "a", name: "read_file", status: "running" as const }],
      },
    ]);
    const after = chatEventStreamReducer(before, {
      type: "event",
      eventType: "tool.complete",
      payload: { tool_id: "a", name: "read_file", duration_s: 1.2 },
    });
    expect(after.messages[0]!.tools![0]!.status).toBe("complete");
    expect(after.messages[0]!.tools![0]!.duration_s).toBe(1.2);
    expect(after.messages[0]!.segments![0]).toMatchObject({ status: "complete", durationS: 1.2 });
  });
});

describe("reasoning", () => {
  it("final message.complete uses streamed thinking and ignores reasoning when both present", () => {
    const state = reduce([
      ["message.start", {}],
      ["reasoning.delta", { text: "streamed thinking" }],
      ["message.complete", { text: "answer", reasoning: "final reasoning" }],
    ]);
    expect(state.messages[0]!.thinking).toBe("streamed thinking");
    expect(state.messages[0]!.text).toBe("answer");
  });

  it("falls back to message.complete.reasoning when no deltas streamed", () => {
    const state = reduce([
      ["message.start", {}],
      ["message.complete", { text: "answer", reasoning: "final reasoning" }],
    ]);
    expect(state.messages[0]!.thinking).toBe("final reasoning");
  });
});

describe("ignored / unit events", () => {
  it("reaction and notification events do not change message list", () => {
    const state = reduce([
      ["reaction", {}],
      ["notification.show", { text: "hi" }],
      ["notification.clear", {}],
    ]);
    expect(state.messages).toEqual([]);
  });

  it("known ignore-list events (moa, output_risk) are silent", () => {
    const state = reduce([
      ["moa.stage", { stage: 1 }],
      ["tool.output_risk", { tool: "terminal" }],
    ]);
    expect(state.messages).toEqual([]);
  });

  it("internal namespace events (session, notification, status) are silent", () => {
    const state = reduce([
      ["session.changed", { session_id: "abc" }],
      ["notification.some", { text: "hi" }],
      ["status.heartbeat", { ok: true }],
    ]);
    expect(state.messages).toEqual([]);
  });

  it("unknown events without content are ignored, not surfaced", () => {
    const state = reduce([["unknown.event", { some: 1 }]]);
    expect(state.messages).toEqual([]);
  });

  it("unknown events are always ignored (no system fallback)", () => {
    // All meaningful events are handled explicitly; unknown/internal frames
    // (even ones carrying text content) must stay silent to avoid flooding
    // the chat with [type] system messages.
    const state = reduce([["unknown.event", { text: "hello world" }]]);
    expect(state.messages).toHaveLength(0);
    const state2 = reduce([["reasoning.available", { content: "noise" }]]);
    expect(state2.messages).toHaveLength(0);
  });
});

describe("user_message (local composer bubble)", () => {
  it("appends a user bubble when the composer sends", () => {
    // user_message is a standalone action, not an event frame — dispatch it
    // directly (the hook's sendUserMessage does the same).
    const state = chatEventStreamReducer(createInitialState(), {
      type: "user_message",
      text: "hi hermes",
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]!.role).toBe("user");
    expect(state.messages[0]!.text).toBe("hi hermes");
    expect(state.messages[0]!.status).toBe("complete");
  });

  it("rejects blank user messages", () => {
    const state = chatEventStreamReducer(createInitialState(), {
      type: "user_message",
      text: "   ",
    });
    expect(state.messages).toEqual([]);
  });
});

describe("system_message (local hint bubble)", () => {
  it("appends a system bubble with the given hint", () => {
    const state = chatEventStreamReducer(createInitialState(), {
      type: "system_message",
      text: "此命令需在 Terminal 视图执行",
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]!.role).toBe("system");
    expect(state.messages[0]!.text).toBe("此命令需在 Terminal 视图执行");
    expect(state.messages[0]!.status).toBe("complete");
  });

  it("rejects blank system hints", () => {
    const state = chatEventStreamReducer(createInitialState(), {
      type: "system_message",
      text: "  ",
    });
    expect(state.messages).toEqual([]);
  });
});

describe("message.complete replaces (no duplication)", () => {
  it("does not duplicate streamed deltas when complete carries the full text", () => {
    // Official semantics: message.complete.text is the FULL final response.
    // The reducer must replace the accumulated delta body, not append.
    const state = reduce([
      ["message.start", {}],
      ["message.delta", { text: "The answer" }],
      ["message.delta", { text: " is 42." }],
      ["message.complete", { text: "The answer is 42." }],
    ]);
    expect(state.messages[0]!.text).toBe("The answer is 42.");
  });

  it("keeps streamed deltas when complete carries no text", () => {
    const state = reduce([
      ["message.start", {}],
      ["message.delta", { text: "streamed body" }],
      ["message.complete", { text: "" }],
    ]);
    expect(state.messages[0]!.text).toBe("streamed body");
  });
});

describe("sessionMessagesToChatMessages", () => {
  it("maps stored user/assistant messages with tool calls", () => {
    const messages = sessionMessagesToChatMessages([
      { role: "user", content: "hello", timestamp: 1 },
      {
        role: "assistant",
        content: "let me look",
        timestamp: 2,
        tool_calls: [
          { id: "tc1", function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
        ],
      },
      { role: "assistant", content: "done", timestamp: 3 },
    ]);
    expect(messages).toHaveLength(3);
    expect(messages[0]!.role).toBe("user");
    expect(messages[0]!.text).toBe("hello");
    expect(messages[1]!.role).toBe("assistant");
    expect(messages[1]!.tools).toHaveLength(1);
    expect(messages[1]!.tools![0]!.name).toBe("read_file");
    expect(messages[1]!.tools![0]!.status).toBe("complete");
    expect(messages[2]!.text).toBe("done");
  });

  it("drops blank user content and folds tool-only messages into assistant cards", () => {
    const messages = sessionMessagesToChatMessages([
      { role: "user", content: "   ", timestamp: 1 },
      { role: "tool", content: "result", timestamp: 2 },
      { role: "assistant", content: null, timestamp: 3 },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe("assistant");
    expect(messages[0]!.text).toBeUndefined();
    expect(messages[0]!.tools).toBeUndefined();
  });

  it("history action replaces the message list", () => {
    const state = chatEventStreamReducer(createInitialState(), {
      type: "history",
      messages: sessionMessagesToChatMessages([
        { role: "user", content: "old", timestamp: 1 },
      ]),
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]!.text).toBe("old");
  });
});

describe("clarify.request", () => {
  it("stores a single-select clarify request", () => {
    const state = reduce([["clarify.request", { request_id: "r1", question: "Pick one", choices: ["a", "b", "c"] }]]);
    expect(state.clarify).toEqual({
      requestId: "r1",
      question: "Pick one",
      choices: ["a", "b", "c"],
      multiSelect: false,
    });
  });

  it("stores a multi-select clarify request when flagged", () => {
    const state = reduce([["clarify.request", { request_id: "r2", question: "Pick many", choices: ["x", "y"], multi_select: true }]]);
    expect(state.clarify!.multiSelect).toBe(true);
  });

  it("supports open-ended clarifies with no choices", () => {
    const state = reduce([["clarify.request", { request_id: "r3", question: "Type freely", choices: null }]]);
    expect(state.clarify).toEqual({
      requestId: "r3",
      question: "Type freely",
      choices: null,
      multiSelect: false,
    });
  });

  it("ignores malformed clarify frames", () => {
    const state = reduce([["clarify.request", { choices: ["a"] }]]);
    expect(state.clarify).toBeNull();
  });

  it("clarify_answered clears the pending card", () => {
    const withCard = chatEventStreamReducer(createInitialState(), {
      type: "event",
      eventType: "clarify.request",
      payload: { request_id: "r1", question: "q", choices: ["a"] },
    });
    expect(withCard.clarify).not.toBeNull();
    const cleared = chatEventStreamReducer(withCard, { type: "clarify_answered" });
    expect(cleared.clarify).toBeNull();
  });
});

describe("segments ordering", () => {
  it("thinking→text switch produces two ordered segments", () => {
    const state = reduce([
      ["message.start", {}],
      ["thinking.delta", { text: "compute" }],
      ["message.delta", { text: "answer" }],
      ["message.complete", { text: "" }],
    ]);
    const segs = state.messages[0]!.segments!;
    expect(segs.map((s) => s.kind)).toEqual(["thinking", "text"]);
    expect(segs[0]!.kind).toBe("thinking");
    expect(segs[1]!.kind).toBe("text");
  });

  it("text→thinking→text interleaves in arrival order", () => {
    const state = reduce([
      ["message.start", {}],
      ["message.delta", { text: "lead" }],
      ["thinking.delta", { text: "think" }],
      ["message.delta", { text: " tail" }],
    ]);
    const segs = state.messages[0]!.segments!;
    expect(segs.map((s) => s.kind)).toEqual(["text", "thinking", "text"]);
  });

  it("tool.start appends a tool segment in order", () => {
    const state = reduce([
      ["message.start", {}],
      ["thinking.delta", { text: "plan" }],
      ["tool.start", { tool_id: "t1", name: "read_file" }],
      ["tool.complete", { tool_id: "t1", name: "read_file", duration_s: 0.3 }],
      ["message.delta", { text: "done" }],
    ]);
    const segs = state.messages[0]!.segments!;
    expect(segs.map((s) => s.kind)).toEqual(["thinking", "tool", "text"]);
    const toolSeg = segs[1] as { kind: "tool"; toolId: string; status: string };
    expect(toolSeg.toolId).toBe("t1");
    expect(toolSeg.status).toBe("complete");
  });

  it("tool.complete updates the existing tool segment in place", () => {
    let state = reduce([
      ["message.start", {}],
      ["tool.start", { tool_id: "t1", name: "terminal", args_text: "ls" }],
    ]);
    const before = state.messages[0]!.segments![0];
    expect(before).toMatchObject({ kind: "tool", status: "running" });

    state = chatEventStreamReducer(state, {
      type: "event",
      eventType: "tool.complete",
      payload: { tool_id: "t1", name: "terminal", summary: "3 files", duration_s: 0.4 },
    });
    const after = state.messages[0]!.segments![0];
    expect(after.kind).toBe("tool");
    expect(after).toMatchObject({ status: "complete", durationS: 0.4, summary: "3 files" });
    // Single tool segment — complete did NOT append a new one.
    expect(state.messages[0]!.segments!).toHaveLength(1);
  });

  it("message.complete replaces the last text segment (does not push a new one)", () => {
    const state = reduce([
      ["message.start", {}],
      ["message.delta", { text: "partial" }],
      ["message.delta", { text: " body" }],
      ["message.complete", { text: "full final body" }],
    ]);
    const segs = state.messages[0]!.segments!;
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ kind: "text", text: "full final body" });
  });

  it("derived text/thinking/tools mirror the segments", () => {
    const state = reduce([
      ["message.start", {}],
      ["thinking.delta", { text: "think a" }],
      ["thinking.delta", { text: " think b" }],
      ["tool.start", { tool_id: "t1", name: "calc" }],
      ["tool.complete", { tool_id: "t1", name: "calc", duration_s: 1 }],
      ["message.delta", { text: "body" }],
      ["message.complete", { text: "final body" }],
    ]);
    const msg = state.messages[0]!;
    expect(msg.thinking).toBe("think a think b");
    expect(msg.text).toBe("final body");
    expect(msg.tools).toHaveLength(1);
    expect(msg.tools![0]).toMatchObject({ tool_id: "t1", status: "complete" });
  });

  it("keeps object identity for an already-finished text segment across later deltas", () => {
    let state = reduce([
      ["message.start", {}],
      ["message.delta", { text: "finished prose" }],
      ["thinking.delta", { text: "late thought" }],
    ]);
    const finished = state.messages[0]!.segments![0] as { kind: string; text: string };
    expect(finished.kind).toBe("text");

    // A later delta extends the last (text) segment; the earlier finished
    // segment object reference must be preserved for memoized rendering.
    state = chatEventStreamReducer(state, {
      type: "event",
      eventType: "message.delta",
      payload: { text: " trailing" },
    });
    const after = state.messages[0]!.segments![0];
    expect(after).toBe(finished);
    expect((after as { text: string }).text).toBe("finished prose");
  });
});

describe("reset (fresh chat / channel change)", () => {
  it("clears messages, sessionTitle, and clarify from a populated state", () => {
    const populated = reduce([
      ["session.info", { title: "Old session", stored_session_id: "sess-old" }],
      ["message.start", {}],
      ["message.delta", { text: "old answer" }],
      ["message.complete", { text: "" }],
      ["clarify.request", { request_id: "r1", question: "q", choices: ["a", "b"] }],
    ]);
    expect(populated.messages.length).toBeGreaterThan(0);
    expect(populated.sessionTitle).toBe("Old session");
    expect(populated.clarify).not.toBeNull();

    const reset = chatEventStreamReducer(populated, { type: "reset" });
    expect(reset.messages).toEqual([]);
    expect(reset.sessionTitle).toBeNull();
    expect(reset.clarify).toBeNull();
    expect(reset.error).toBeNull();
  });

  it("resets connection state to connecting", () => {
    const open = chatEventStreamReducer(createInitialState(), {
      type: "connection",
      connectionState: "open",
    });
    expect(open.connectionState).toBe("open");
    const reset = chatEventStreamReducer(open, { type: "reset" });
    expect(reset.connectionState).toBe("connecting");
  });

  it("reset is safe on an empty initial state", () => {
    const reset = chatEventStreamReducer(createInitialState(), { type: "reset" });
    expect(reset).toEqual(createInitialState());
  });
});

describe("session switch (TUI-internal /resume, /sessions, /compact key rotation)", () => {
  it("clears stale messages when session.info reports a different stored_session_id", () => {
    const before = reduce([
      ["session.info", { title: "Session A", stored_session_id: "sess-a" }],
      ["message.start", {}],
      ["message.delta", { text: "answer in A" }],
      ["message.complete", { text: "" }],
    ]);
    expect(before.messages.length).toBeGreaterThan(0);

    const after = chatEventStreamReducer(before, {
      type: "event",
      eventType: "session.info",
      payload: { title: "Session B", stored_session_id: "sess-b" },
    });

    expect(after.activeSessionId).toBe("sess-b");
    // Stale bubbles from the previous session must NOT survive the switch.
    expect(after.messages).toEqual([]);
    expect(after.clarify).toBeNull();
  });

  it("keeps messages when session.info repeats the same stored_session_id", () => {
    const state = reduce([
      ["session.info", { title: "Session A", stored_session_id: "sess-a" }],
      ["message.start", {}],
      ["message.delta", { text: "answer in A" }],
      ["message.complete", { text: "" }],
      ["session.info", { title: "Session A", stored_session_id: "sess-a" }],
    ]);
    expect(state.activeSessionId).toBe("sess-a");
    expect(state.messages.length).toBeGreaterThan(0);
  });

  it("does not clear messages when stored_session_id is absent (fresh chat)", () => {
    const state = reduce([
      ["session.info", { title: "Fresh", stored_session_id: "sess-a" }],
      ["message.start", {}],
      ["message.delta", { text: "hi" }],
      ["message.complete", { text: "" }],
      ["session.info", { title: "Fresh" }],
    ]);
    expect(state.activeSessionId).toBe("sess-a");
    expect(state.messages.length).toBeGreaterThan(0);
  });
});

describe("context usage (session.info.usage)", () => {
  it("captures usage from a session.info frame", () => {
    const state = reduce([
      [
        "session.info",
        {
          title: "S",
          stored_session_id: "sess-1",
          usage: {
            context_used: 42_000,
            context_max: 128_000,
            context_percent: 33,
            compressions: 2,
            total: 55_000,
          },
        },
      ],
    ]);
    expect(state.usage).toEqual({
      context_used: 42_000,
      context_max: 128_000,
      context_percent: 33,
      compressions: 2,
      total: 55_000,
    });
  });

  it("keeps previous usage when a session.info frame has no usage", () => {
    const first = reduce([
      [
        "session.info",
        { title: "S", stored_session_id: "sess-1", usage: { total: 10 } },
      ],
    ]);
    const second = chatEventStreamReducer(first, {
      type: "event",
      eventType: "session.info",
      payload: { title: "S", stored_session_id: "sess-1" },
    });
    expect(second.usage).toEqual({ total: 10 });
  });
});

describe("compaction status (status.update compacting/compressing)", () => {
  it("sets compacting on kind=compressing", () => {
    const state = reduce([
      ["status.update", { kind: "compressing", text: "⠋ compressing 120 messages…" }],
    ]);
    expect(state.compacting).toBe(true);
  });

  it("sets compacting on kind=compacting (auto-compaction)", () => {
    const state = reduce([
      ["status.update", { kind: "compacting", text: "🗜️ Compacting context…" }],
    ]);
    expect(state.compacting).toBe(true);
  });

  it("clears compacting on kind=ready", () => {
    const state = reduce([
      ["status.update", { kind: "compressing", text: "…" }],
      ["status.update", { kind: "ready" }],
    ]);
    expect(state.compacting).toBe(false);
  });

  it("ignores unrelated status.update kinds", () => {
    const state = reduce([
      ["status.update", { kind: "working", text: "working…" }],
    ]);
    expect(state.compacting).toBe(false);
  });
});

describe("parseEventFrame session_id", () => {
  it("extracts session_id from a frame", () => {
    const frame = parseEventFrame(buildEventFrame("session.info", {}, "e71bf884"));
    expect(frame).toEqual({ type: "session.info", payload: {}, sessionId: "e71bf884" });
  });

  it("leaves sessionId undefined when absent", () => {
    const frame = parseEventFrame(buildEventFrame("tool.start", { tool_id: "1" }));
    expect(frame?.sessionId).toBeUndefined();
  });
});
