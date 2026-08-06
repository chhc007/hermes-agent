/**
 * ChatSessionList — a ChatGPT-style conversation switcher that sits beside
 * the embedded TUI on the dashboard Chat tab.
 *
 * It lists the most recent sessions for the active management profile and
 * lets the user swap between them without leaving the Chat page. Selecting
 * a row sets `/chat?resume=<id>`; ChatPage treats the resume target as part
 * of the PTY identity, so the change tears down the current terminal child
 * and respawns it resuming that conversation (see ChatPage.tsx). The
 * "New session" action clears the resume param, which spawns a fresh PTY.
 *
 * Each row shows a small source badge (cli / tui / telegram / discord / …)
 * so it's obvious where the conversation came from, and a row of filter
 * chips sits above the list to quickly narrow by source.
 *
 * Best-effort, like ChatSidebar: a failed fetch surfaces a small inline
 * error with a retry affordance and the terminal pane keeps working.
 */

import { Button } from "@nous-research/ui/ui/components/button";
import { ListItem } from "@nous-research/ui/ui/components/list-item";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { AlertCircle, MessageSquarePlus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { useI18n } from "@/i18n";
import { api, type SessionInfo } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

const SESSION_LIMIT = 30;

interface ChatSessionListProps {
  /** Active resume target (the session currently shown in the terminal). */
  activeSessionId: string | null;
  /** Management profile from the dashboard switcher — scopes the listing. */
  profile?: string;
  className?: string;
  /** Optional callback fired after a row is picked (e.g. close mobile sheet). */
  onPicked?: () => void;
  /**
   * Starts a fresh chat. ChatPage supplies its `startFreshDashboardChat`,
   * which clears `?resume` AND bumps the reconnect nonce so a brand-new PTY
   * spawns even when the user is already on an unsaved fresh session. When
   * omitted, we fall back to clearing the resume param ourselves.
   */
  onNewChat?: () => void;
}

/** Source badge color/tone per known source. Unknown sources fall back to a
 *  neutral outline tone. */
const SOURCE_TONES: Record<string, string> = {
  cli: "border-midground/30 bg-midground/10 text-midground",
  tui: "border-primary/40 bg-primary/15 text-primary",
  telegram: "border-sky-500/40 bg-sky-500/15 text-sky-400",
  discord: "border-indigo-500/40 bg-indigo-500/15 text-indigo-400",
  slack: "border-emerald-500/40 bg-emerald-500/15 text-emerald-400",
  cron: "border-amber-500/40 bg-amber-500/15 text-amber-400",
  web: "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-400",
  dashboard: "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-400",
};

function sourceTone(source: string | null): string {
  if (!source) return "border-border/60 bg-secondary/30 text-text-secondary";
  return SOURCE_TONES[source.toLowerCase()] ?? "border-border/60 bg-secondary/30 text-text-secondary";
}

/** Normalise a session source to a short label for the badge. */
function sourceLabel(source: string | null): string {
  if (!source) return "—";
  return source.toLowerCase();
}

function rowLabel(session: SessionInfo, untitled: string): string {
  const title = session.title?.trim();
  if (title && title !== "Untitled") return title;
  const preview = session.preview?.trim();
  if (preview) return preview;
  return untitled;
}

export function ChatSessionList({
  activeSessionId,
  profile,
  className,
  onPicked,
  onNewChat,
}: ChatSessionListProps) {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const resumeId = searchParams.get("resume");
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped to force a refetch (after switching, on Refresh, on mount).
  const [reloadNonce, setReloadNonce] = useState(0);
  // Active source filter (null = all).
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  // List ordering: "recent" = last active first (default), "created" = newest first.
  const [order, setOrder] = useState<"created" | "recent">("recent");

  // `profile` is read inside the fetch; it's part of the scope key so a
  // profile switch refetches. The empty-string fallback keeps the dep
  // stable when no profile is selected (default profile).
  const scopeKey = profile ?? "";

  // Monotonic request token: only the most recent fetch is allowed to
  // commit state, so a fast profile switch (or Refresh spam) can't land a
  // stale list out of order.
  const reqRef = useRef(0);

  const load = useCallback(
    (opts?: { silent?: boolean }) => {
      const myReq = ++reqRef.current;
      // Silent mode (polling / visibility resume) only swaps the data in —
      // no loading/error churn so the list never flickers.
      if (!opts?.silent) {
        setLoading(true);
        setError(null);
      }
      api
        .getSessions(SESSION_LIMIT, 0, scopeKey, order)
        .then((res) => {
          if (reqRef.current !== myReq) return;
          setSessions(res.sessions);
        })
        .catch((e: Error) => {
          if (reqRef.current !== myReq) return;
          if (!opts?.silent) setError(e.message || "failed to load sessions");
        })
        .finally(() => {
          // Symmetric with the silent guard above: a silent refresh never
          // clears a loading state it didn't set (and can't clobber one a
          // concurrent visible load is showing).
          if (reqRef.current === myReq && !opts?.silent) setLoading(false);
        });
    },
    [order, scopeKey],
  );

  useEffect(() => {
    // Dashboard data surfaces fetch from an effect on mount + scope change;
    // keep this local and explicit until the shared lint profile is updated
    // for async loaders (matches FilesPage).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // `reloadNonce` is a manual refetch trigger (Refresh button / row pick).
  }, [load, reloadNonce]);

  // Refresh immediately when the `?resume` target changes (a session was
  // picked here, or a new one was started elsewhere). Skipped on first
  // mount — the mount effect above already loaded.
  const prevResumeRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevResumeRef.current === undefined) {
      prevResumeRef.current = resumeId; // first run: mount effect handles it
      return;
    }
    if (prevResumeRef.current !== resumeId) {
      prevResumeRef.current = resumeId;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    }
  }, [resumeId, load]);

  // Silent polling: new conversations (New chat, Telegram, …) show up
  // without a manual refresh, with no loading/error flicker.
  useEffect(() => {
    const id = setInterval(() => load({ silent: true }), 30000);
    return () => clearInterval(id);
  }, [load]);

  // Refetch quietly when the tab becomes visible again — the list may have
  // drifted while the user was elsewhere.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  // Sources present in the loaded list, for the filter chips. Kept stable
  // (sorted) so the chip row doesn't jump around while data loads.
  const availableSources = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions ?? []) {
      if (s.source) set.add(s.source.toLowerCase());
    }
    return Array.from(set).sort();
  }, [sessions]);

  const visibleSessions = useMemo(() => {
    if (!sessions) return sessions;
    if (!sourceFilter) return sessions;
    return sessions.filter(
      (s) => s.source?.toLowerCase() === sourceFilter.toLowerCase(),
    );
  }, [sessions, sourceFilter]);

  // Picking a row sets `/chat?resume=<id>`. Re-picking the row already in
  // the terminal is a no-op (avoids a needless PTY teardown).
  const pick = useCallback(
    (id: string) => {
      onPicked?.();
      if (id === activeSessionId) return;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("resume", id);
          return next;
        },
        { replace: false },
      );
    },
    [activeSessionId, onPicked, setSearchParams],
  );

  // "New chat" prefers ChatPage's robust handler (clears resume + forces a
  // PTY respawn even from an already-fresh session). Fallback: clear the
  // resume param ourselves, which spawns a fresh PTY whenever one was being
  // resumed. Session management (delete/rename/export) lives on the Sessions
  // page; this panel only switches and starts conversations.
  const startNew = useCallback(() => {
    onPicked?.();
    if (onNewChat) {
      onNewChat();
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("resume");
        return next;
      },
      { replace: false },
    );
  }, [onNewChat, onPicked, setSearchParams]);

  const content = useMemo(() => {
    if (loading && sessions === null) {
      return (
        <div className="flex items-center justify-center gap-2 px-2 py-6 text-xs text-text-secondary">
          <Spinner /> {t.common.loading}
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex flex-col items-start gap-2 px-2 py-4 text-xs">
          <div className="flex items-start gap-2 text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="wrap-break-word">{error}</span>
          </div>
          <Button size="sm" outlined onClick={reload} prefix={<RefreshCw />}>
            {t.common.retry}
          </Button>
        </div>
      );
    }
    if (!visibleSessions || visibleSessions.length === 0) {
      return (
        <div className="px-2 py-6 text-center text-xs text-text-secondary">
          {sourceFilter ? "该来源暂无会话" : t.sessions.noSessions}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-0.5">
        {visibleSessions.map((s) => {
          const isActive = s.id === activeSessionId;
          return (
            <ListItem
              key={s.id}
              onClick={() => pick(s.id)}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "flex-col items-start gap-0.5 rounded px-2 py-1.5",
                "normal-case tracking-normal",
                isActive
                  ? "bg-primary/15 text-foreground border-l-[3px] border-primary"
                  : "text-text-secondary hover:bg-midground/5 hover:text-foreground",
              )}
            >
              <span className="flex w-full items-center gap-1.5">
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm font-medium",
                    isActive && "text-primary",
                  )}
                >
                  {rowLabel(s, t.sessions.untitledSession)}
                </span>
                {isActive && (
                  <span className="inline-flex shrink-0 items-center border border-primary/50 bg-primary/10 px-1 py-px text-[0.625rem] leading-none tracking-wide text-primary">
                    当前
                  </span>
                )}
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center border px-1 py-px text-[0.625rem] leading-none tracking-wide",
                    sourceTone(s.source),
                  )}
                  title={s.source ?? "source"}
                >
                  {sourceLabel(s.source)}
                </span>
              </span>
              <span className="flex w-full items-center gap-1.5 text-[0.6875rem] text-text-tertiary">
                <span>{timeAgo(s.last_active)}</span>
                {s.message_count > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{s.message_count} msgs</span>
                  </>
                )}
              </span>
            </ListItem>
          );
        })}
      </div>
    );
  }, [activeSessionId, error, loading, pick, reload, sessions, sourceFilter, t, visibleSessions]);

  return (
    <aside
      className={cn(
        "flex h-full w-full min-w-0 shrink-0 flex-col overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <span className="text-display text-xs tracking-wider text-text-tertiary">
          {t.sessions.title}
        </span>
        <Button
          ghost
          size="icon"
          onClick={reload}
          aria-label={t.common.refresh}
          title={t.common.refresh}
          className="text-text-secondary hover:text-foreground"
        >
          <RefreshCw className={cn(loading && "animate-spin")} />
        </Button>
      </div>

      <Button
        outlined
        size="sm"
        onClick={startNew}
        prefix={<MessageSquarePlus />}
        className="mx-2 mb-2 justify-center"
      >
        {t.sessions.newChat}
      </Button>

      {/* Source filter chips */}
      {availableSources.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1 px-2">
          <button
            type="button"
            onClick={() => setSourceFilter(null)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[0.625rem] tracking-wide transition-colors",
              sourceFilter === null
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border/60 bg-secondary/30 text-text-secondary hover:text-foreground",
            )}
          >
            All
          </button>
          {availableSources.map((src) => (
            <button
              key={src}
              type="button"
              onClick={() =>
                setSourceFilter((cur) => (cur === src ? null : src))
              }
              className={cn(
                "rounded-full border px-2 py-0.5 text-[0.625rem] tracking-wide transition-colors",
                sourceFilter === src
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/60 bg-secondary/30 text-text-secondary hover:text-foreground",
              )}
            >
              {src}
            </button>
          ))}
        </div>
      )}

      {/* Ordering: recent activity vs creation time */}
      <div className="mb-2 flex items-center gap-1 px-2">
        {(
          [
            ["recent", "最近活跃"],
            ["created", "创建时间"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setOrder(value)}
            aria-pressed={order === value}
            className={cn(
              "flex-1 rounded border px-1 py-0.5 text-[0.625rem] tracking-wide transition-colors",
              order === value
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border/60 bg-secondary/30 text-text-secondary hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-1">
        {content}
      </div>
    </aside>
  );
}
