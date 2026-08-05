// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  TERMINAL_ONLY_COMMANDS,
  isTerminalOnlyCommand,
} from "./terminal-commands";

describe("isTerminalOnlyCommand", () => {
  it("accepts a leading slash", () => {
    expect(isTerminalOnlyCommand("/memory")).toBe(true);
  });

  it("accepts arguments after the command", () => {
    expect(isTerminalOnlyCommand("/memory pending")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isTerminalOnlyCommand("/MEMORY")).toBe(true);
  });

  it("accepts surrounding whitespace", () => {
    expect(isTerminalOnlyCommand("  /kanban  ")).toBe(true);
  });

  it("rejects plain chat prompts", () => {
    expect(isTerminalOnlyCommand("hello")).toBe(false);
  });

  it("rejects non-terminal slash commands", () => {
    expect(isTerminalOnlyCommand("/help")).toBe(false);
    expect(isTerminalOnlyCommand("/new")).toBe(false);
  });

  it("word-bounds the first token so prefixes don't match", () => {
    expect(isTerminalOnlyCommand("/memories")).toBe(false);
  });

  it("contains the expected terminal-only commands", () => {
    for (const name of ["memory", "cron", "model", "exit", "q", "kanban"]) {
      expect(TERMINAL_ONLY_COMMANDS.has(name)).toBe(true);
    }
  });
});
