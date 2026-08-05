/**
 * terminal-commands — single source of truth for commands that need TUI state /
 * an interactive picker and therefore can only meaningfully run in the real
 * terminal. Typing them in the chat composer still forwards them to the PTY,
 * but their output/interaction only appears there — so the UI surfaces a hint.
 *
 * Command names are lowercase, no leading "/". Both the popover badge and the
 * composer's send-time hint derive from this module so they never drift apart.
 */

export const TERMINAL_ONLY_COMMANDS = new Set([
  "memory",
  "skills",
  "model",
  "session",
  "undo",
  "exit",
  "steer",
  "plan",
  "goal",
  "moa",
  "retry",
  "queue",
  "q",
  "learn",
  "init",
  "compress",
  "compact",
  "snapshot",
  "snap",
  "details",
  "personality",
  "suggestions",
  "cron",
  "kanban",
  "pet",
  "hatch",
  "reload",
  "reload-mcp",
  "reload-skills",
]);

/** Is the given text a terminal-only command? Accepts "/", whitespace, args. */
export function isTerminalOnlyCommand(text: string): boolean {
  const name =
    text.trim().replace(/^\/+/, "").split(/\s+/)[0]?.toLowerCase() ?? "";
  return TERMINAL_ONLY_COMMANDS.has(name);
}
