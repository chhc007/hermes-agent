/**
 * chat-event-stream — pure state machine that assembles ChatMessage[] from
 * the dashboard's structured ``/api/events`` feed.
 *
 * The dashboard already fans out every `tui_gateway` dispatcher emit onto a
 * per-PTY ``channel`` (see `ChatPage.tsx` -> `generateChannelId()` and the
 * `/api/events` WebSocket). Rather than parsing terminal text, we consume
 * that structured feed directly and reduce it into messages + tool-call
 * cards the same way the Ink TUI does (see
 * `ui-tui/src/app/createGatewayEventHandler.ts` + `turnController.ts`).
 *
 * The reducer is deliberately framework-free: a pure function a unit test
 * can drive frame-by-frame, plus a small React hook that owns the WebSocket
 * and the ``useReducer`` state.
 *
 * Frame wire format (each WebSocket message):
 *   { "jsonrpc": "2.0", "method": "event",
 *     "params": { "type": "...", "payload": { ... } } }
 */

import { useCallback, useEffect, useReducer } from "react";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type ToolStatus = "running" | "complete" | "error";

export interface ToolCallInfo {
  tool_id: string;
  name: string;
  args_text?: string;
  preview?: string;
  status: ToolStatus;
  error?: string;
  summary?: string;
  duration_s?: number;
  result_text?: string;
}

export type ChatMessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  text?: string;
  thinking?: string;
  tools?: ToolCallInfo[];
  status: "streaming" | "complete";
  ts: number;
}

export type ConnectionState = "connecting" | "open" | "closed" | "error";

/** Pending clarify (multi-choice) request surfaced by the agent. */
export interface ClarifyRequest {
  requestId: string;
  question: string;
  choices: string[] | null;
  multiSelect: boolean;
}

export interface ChatEventStreamState {
  messages: ChatMessage[];
  connectionState: ConnectionState;
  error: string | null;
  sessionTitle: string | null;
  clarify: ClarifyRequest | null;
}

export type ChatEventStreamAction =
  | { type: "reset" }
  | { type: "event"; eventType: string; payload: unknown }
  | { type: "connection"; connectionState: ConnectionState; error?: string | null }
  | { type: "user_message"; text: string }
  | { type: "history"; messages: ChatMessage[] }
  | { type: "clarify_answered" };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `msg-${idSeq}`;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return undefined;
}

/** Like `asString` but preserves whitespace — for streaming deltas where a
 *  single token boundary can split across two frames. */
function asRawString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function truncateArgs(args?: string): string | undefined {
  const text = args?.trim();
  if (!text) return undefined;
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

function lastAssistantIndex(state: ChatEventStreamState): number {
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    if (state.messages[i].role === "assistant") return i;
  }
  return -1;
}

function upsertTool(
  tools: ToolCallInfo[],
  toolId: string,
  patch: (t: ToolCallInfo) => ToolCallInfo,
): ToolCallInfo[] {
  const idx = tools.findIndex((t) => t.tool_id === toolId);
  if (idx < 0) {
    return [
      ...tools,
      patch({ tool_id: toolId, name: "tool", status: "running" }),
    ];
  }
  return tools.map((t, i) => (i === idx ? patch(t) : t));
}

/** Close any open streaming message (mark it complete) so a new turn's
 *  assistant message doesn't get glued onto the previous one. */
function sealAll(state: ChatEventStreamState): ChatEventStreamState {
  return {
    ...state,
    messages: state.messages.map((m) => (m.status === "streaming" ? { ...m, status: "complete" } : m)),
  };
}

/** Open a fresh assistant message that will own the current turn. */
function openStreamingMessage(state: ChatEventStreamState): ChatEventStreamState {
  const sealed = sealAll(state);
  return {
    ...sealed,
    messages: [
      ...sealed.messages,
      { id: nextId(), role: "assistant", status: "streaming", ts: Date.now() },
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Reducer                                                            */
/* ------------------------------------------------------------------ */

export function createInitialState(): ChatEventStreamState {
  return {
    messages: [],
    connectionState: "connecting",
    error: null,
    sessionTitle: null,
    clarify: null,
  };
}

export function chatEventStreamReducer(
  state: ChatEventStreamState,
  action: ChatEventStreamAction,
): ChatEventStreamState {
  if (action.type === "reset") {
    return createInitialState();
  }

  if (action.type === "connection") {
    return {
      ...state,
      connectionState: action.connectionState,
      error: action.error ?? state.error,
    };
  }

  // Locally-optimistic user message: /api/events carries no user-input
  // frames (the TUI appends user prompts locally), so the composer adds
  // its own bubble when a send is accepted.
  if (action.type === "user_message") {
    const text = asString(action.text);
    if (!text) return state;
    return {
      ...state,
      messages: [
        ...state.messages,
        { id: nextId(), role: "user", text, status: "complete", ts: Date.now() },
      ],
    };
  }

  // Replace the whole list with loaded session history (e.g. when a resumed
  // chat mounts). Kept as a distinct action so live events that arrive after
  // the fetch don't get clobbered by a later resolve.
  if (action.type === "history") {
    return { ...state, messages: action.messages };
  }

  // Clear the pending clarify card once an answer has been submitted.
  if (action.type === "clarify_answered") {
    return { ...state, clarify: null };
  }

  const { eventType, payload } = action;
  const p = (payload ?? {}) as Record<string, unknown>;
  const idx = lastAssistantIndex(state);

  switch (eventType) {
    case "session.info":
      return {
        ...state,
        sessionTitle: asString(p.title) ?? state.sessionTitle,
      };

    case "clarify.request": {
      const requestId = asString(p.request_id);
      const question = asString(p.question);
      if (!requestId || !question) return state;
      const rawChoices = Array.isArray(p.choices) ? p.choices : null;
      const choices = rawChoices
        ? (rawChoices as unknown[])
            .filter((c): c is string => typeof c === "string")
            .map((c) => c.trim())
            .filter(Boolean)
        : null;
      return {
        ...state,
        clarify: {
          requestId,
          question,
          choices: choices && choices.length > 0 ? choices : null,
          multiSelect: p.multi_select === true && (choices?.length ?? 0) > 1,
        },
      };
    }

    case "message.start":
      return openStreamingMessage(state);

    case "message.delta": {
      const text = asRawString(p.text);
      if (!text || idx < 0) return state;
      return {
        ...state,
        messages: state.messages.map((m, i) =>
          i === idx
            ? { ...m, text: `${m.text ?? ""}${text}`, status: "streaming" }
            : m,
        ),
      };
    }

    case "message.complete": {
      const finalText = asString(p.text) ?? "";
      const reasonFull = asString(p.reasoning);
      if (idx >= 0) {
        return {
          ...state,
          messages: state.messages.map((m, i) => {
            if (i !== idx) {
              return m.status === "streaming" ? { ...m, status: "complete" as const } : m;
            }
            // The complete frame's `text` is the FULL final response (the
            // official TUI strips streamed prefixes via finalTail before
            // appending), so replace the accumulated delta body instead of
            // concatenating — appending would duplicate everything streamed
            // so far. Same for reasoning: prefer the delta-thinking already
            // shown, else the complete frame's reasoning field.
            const body = finalText || (m.text ?? "").trim();
            return {
              ...m,
              text: body,
              status: "complete" as const,
              thinking:
                m.thinking && m.thinking.trim()
                  ? m.thinking
                  : reasonFull
                    ? reasonFull
                    : undefined,
            };
          }),
        };
      }
      // A turn ended without a message.start (e.g. an error-only turn).
      // Synthesize a complete assistant message carrying the final text.
      const fresh = openStreamingMessage(state);
      const last = fresh.messages.length - 1;
      return {
        ...fresh,
        messages: fresh.messages.map((m, i) =>
          i === last
            ? {
                ...m,
                text: finalText,
                status: "complete" as const,
                thinking: reasonFull,
              }
            : m,
        ),
      };
    }

    case "thinking.delta":
    case "reasoning.delta": {
      const text = asRawString(p.text);
      if (!text || idx < 0) return state;
      return {
        ...state,
        messages: state.messages.map((m, i) =>
          i === idx ? { ...m, thinking: `${m.thinking ?? ""}${text}` } : m,
        ),
      };
    }

    case "tool.start": {
      const toolId = asString(p.tool_id);
      if (!toolId) return state;
      const name = asString(p.name) ?? "tool";
      const args = truncateArgs(asString(p.args_text));
      if (idx >= 0) {
        return {
          ...state,
          messages: state.messages.map((m, i) =>
            i === idx
              ? {
                  ...m,
                  tools: upsertTool(m.tools ?? [], toolId, (t) => ({
                    ...t,
                    name,
                    args_text: args ?? t.args_text,
                    status: "running",
                  })),
                }
              : m,
          ),
        };
      }
      const fresh = openStreamingMessage(state);
      const last = fresh.messages.length - 1;
      return {
        ...fresh,
        messages: fresh.messages.map((m, i) =>
          i === last
            ? { ...m, tools: [{ tool_id: toolId, name, status: "running", args_text: args }] }
            : m,
        ),
      };
    }

    case "tool.progress": {
      const preview = asString(p.preview);
      const name = asString(p.name);
      if (!preview || !name || idx < 0) return state;
      let matched = false;
      const tools = (state.messages[idx].tools ?? []).map((t) => {
        if (t.name === name) {
          matched = true;
          return { ...t, preview };
        }
        return t;
      });
      if (!matched) return state;
      return {
        ...state,
        messages: state.messages.map((m, i) => (i === idx ? { ...m, tools } : m)),
      };
    }

    case "tool.generating":
    case "reaction":
      // Cosmetic / no-op in a chat view.
      return state;

    case "tool.complete": {
      const toolId = asString(p.tool_id);
      if (!toolId || idx < 0) return state;
      const error = asString(p.error);
      const status: ToolStatus = error ? "error" : "complete";
      const duration = typeof p.duration_s === "number" ? p.duration_s : undefined;
      return {
        ...state,
        messages: state.messages.map((m, i) =>
          i === idx
            ? {
                ...m,
                tools: upsertTool(m.tools ?? [], toolId, (t) => ({
                  ...t,
                  name: asString(p.name) ?? t.name,
                  status,
                  error: error ?? t.error,
                  summary: asString(p.summary) ?? t.summary,
                  duration_s: duration ?? t.duration_s,
                  result_text: asString(p.result_text) ?? t.result_text,
                })),
              }
            : m,
        ),
      };
    }

    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/*  Frame parsing (pure, reusable)                                     */
/* ------------------------------------------------------------------ */

export interface EventFrame {
  type: string;
  payload: unknown;
}

/** Parse a single ``/api/events`` frame, or null for non-event frames. */
export function parseEventFrame(raw: string): EventFrame | null {
  let frame: unknown;
  try {
    frame = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!frame || typeof frame !== "object") return null;
  const obj = frame as Record<string, unknown>;
  if (obj.method !== "event" || !obj.params || typeof obj.params !== "object") return null;
  const params = obj.params as Record<string, unknown>;
  const type = typeof params.type === "string" ? params.type : "";
  if (!type) return null;
  return { type, payload: params.payload };
}

/** Build a wire frame string for tests. */
export function buildEventFrame(type: string, payload?: unknown): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    method: "event",
    params: { type, payload },
  });
}

/**
 * Convert stored session messages (GET /api/sessions/{id}/messages) into
 * ChatMessage[]. Duck-typed so this stays a pure node-testable function:
 * accepts the same shape as api.SessionMessage without importing the
 * browser-bound api module.
 */
export function sessionMessagesToChatMessages(
  messages: Array<{
    role?: unknown;
    content?: unknown;
    timestamp?: unknown;
    tool_calls?: unknown;
    tool_name?: unknown;
  }>,
): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    // Tool result frames carry no standalone chat value in this view — the
    // call (name/args) already lives on the assistant message's tool_cards.
    if (m.role === "tool") continue;
    const role = m.role === "user" ? "user" : m.role === "system" ? "system" : "assistant";
    const text = typeof m.content === "string" ? m.content : undefined;
    const ts = typeof m.timestamp === "number" ? m.timestamp : Date.now();
    if (role === "user") {
      if (!text?.trim()) continue;
      out.push({ id: nextId(), role, text, status: "complete", ts });
      continue;
    }
    if (role === "system") {
      if (!text?.trim()) continue;
      out.push({ id: nextId(), role, text, status: "complete", ts });
      continue;
    }
    // Assistant: fold tool_calls into tool cards; keep body text when present.
    const tools: ToolCallInfo[] = Array.isArray(m.tool_calls)
      ? (m.tool_calls as Array<Record<string, unknown>>)
          .filter((tc) => tc && typeof tc === "object")
          .map((tc, i) => {
            const fn = tc.function as Record<string, unknown> | undefined;
            return {
              tool_id: String(tc.id ?? `hist-${i}`),
              name: String(fn?.name ?? "tool"),
              args_text: typeof fn?.arguments === "string" ? truncateArgs(fn.arguments) : undefined,
              status: "complete" as const,
            };
          })
      : [];
    out.push({
      id: nextId(),
      role,
      text: text?.trim() || undefined,
      tools: tools.length ? tools : undefined,
      status: "complete",
      ts,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  React hook: useChatEventStream(channelId)                          */
/* ------------------------------------------------------------------ */

/**
 * Subscribe to a PTY channel's structured event feed and reduce it into
 * ChatMessage[]. The `channel` must match the one `ChatPage.tsx` generated
 * for the PTY child so `/api/pub` fans out to this socket.
 *
 * Kept separate from the reducer so node-side unit tests never pull in the
 * browser WebSocket bindings.
 */
export function useChatEventStream(channel: string) {
  const [state, dispatch] = useReducer(chatEventStreamReducer, undefined, () => ({
    messages: [],
    connectionState: "connecting" as ConnectionState,
    error: null,
    sessionTitle: null,
    clarify: null,
  }));

  // Composer hook: locally append the user's own bubble (the /api/events
  // feed carries no user-input frames). Stable identity so ChatInput's
  // submit() deps don't churn.
  const sendUserMessage = useCallback((text: string) => {
    dispatch({ type: "user_message", text });
  }, []);

  // Replace the list with loaded session history (resumed chat mount).
  const loadHistory = useCallback((messages: ChatMessage[]) => {
    dispatch({ type: "history", messages });
  }, []);

  // Submit a clarify answer over the JSON-RPC sidecar (/api/ws). The
  // gateway's clarify.respond only needs request_id + answer. On success
  // (or an expired-but-acknowledged reply) clear the pending card.
  const respondClarify = useCallback(
    async (requestId: string, answer: string): Promise<boolean> => {
      try {
        const { GatewayClient } = await import("@/lib/gatewayClient");
        const gw = new GatewayClient();
        await gw.connect();
        const res = await gw.request<{ status?: string }>("clarify.respond", {
          answer,
          request_id: requestId,
        });
        gw.close();
        dispatch({ type: "clarify_answered" });
        return res?.status === "ok" || res?.status === "expired";
      } catch {
        return false;
      }
    },
    [],
  );

  // Reset the chat bubble list + transient state (used when starting a fresh
  // chat or when the channel changes). Any channel change clears stale
  // messages before the new socket begins feeding events.
  const resetChat = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  useEffect(() => {
    if (!channel) return;
    let disposed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    // Any channel change starts from a clean slate: clear stale messages so
    // a freshly spawned PTY doesn't render the previous session's bubbles.
    // Safe for resume flows — history loading (loadHistory) is async and
    // replaces the list afterward.
    dispatch({ type: "reset" });

    // Establish (or re-establish) the events WebSocket. Deferred dynamic
    // import keeps the browser bindings out of the node reducer's unit tests
    // and mirrors ChatSidebar's lazy WS wiring.
    const openSocket = () => {
      if (disposed) return;
      // Deferred dynamic import keeps the browser bindings out of the node
      // reducer's unit tests and mirrors ChatSidebar's lazy WS wiring.
      import("@/lib/api")
        .then(({ buildWsUrl }) => {
          void buildWsUrl("/api/events", { channel })
            .then((url) => {
              if (disposed) return;
              const socket = new WebSocket(url);
              ws = socket;
              socket.addEventListener("open", () => {
                attempt = 0;
                dispatch({ type: "connection", connectionState: "open" });
              });
              socket.addEventListener("message", (ev) => {
                const frame = parseEventFrame(String(ev.data));
                if (frame) {
                  dispatch({ type: "event", eventType: frame.type, payload: frame.payload });
                }
              });
              socket.addEventListener("error", () => {
                if (!disposed) {
                  dispatch({ type: "connection", connectionState: "error", error: "Events feed disconnected" });
                }
              });
              socket.addEventListener("close", (ev) => {
                if (disposed) return;
                if (ev.code === 4401 || ev.code === 4403) {
                  dispatch({ type: "connection", connectionState: "closed", error: `Events feed rejected (${ev.code})` });
                  return;
                }
                attempt += 1;
                dispatch({ type: "connection", connectionState: "connecting" });
                const delay = Math.min(250 * 2 ** Math.min(attempt - 1, 5), 5000);
                reconnectTimer = setTimeout(() => {
                  reconnectTimer = null;
                  // Re-open the socket — this is the actual reconnect; the
                  // old socket is already closed at this point.
                  openSocket();
                }, delay);
              });
            })
            .catch(() => {
              if (!disposed) {
                dispatch({ type: "connection", connectionState: "error", error: "Failed to open events feed" });
              }
            });
        })
        .catch(() => {
          if (!disposed) {
            dispatch({ type: "connection", connectionState: "error", error: "Failed to open events feed" });
          }
        });
    };

    openSocket();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [channel]);

  return { ...state, sendUserMessage, loadHistory, respondClarify, resetChat };
}
