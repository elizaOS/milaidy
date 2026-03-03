import { describe, expect, it } from "vitest";
import {
  normalizeTelegramCommandDescription,
  normalizeTelegramCommandName,
  resolveTelegramCustomCommands,
  TELEGRAM_COMMAND_NAME_PATTERN,
} from "./telegram-custom-commands.js";

/* ── normalizeTelegramCommandName ──────────────────────────────────── */

describe("normalizeTelegramCommandName", () => {
  it("lowercases and trims", () => {
    expect(normalizeTelegramCommandName("  MyCommand  ")).toBe("mycommand");
  });

  it("strips leading slash", () => {
    expect(normalizeTelegramCommandName("/start")).toBe("start");
  });

  it("strips leading slash with whitespace", () => {
    expect(normalizeTelegramCommandName("  /help  ")).toBe("help");
  });

  it("returns empty for blank input", () => {
    expect(normalizeTelegramCommandName("")).toBe("");
    expect(normalizeTelegramCommandName("   ")).toBe("");
  });
});

/* ── normalizeTelegramCommandDescription ───────────────────────────── */

describe("normalizeTelegramCommandDescription", () => {
  it("trims whitespace", () => {
    expect(normalizeTelegramCommandDescription("  hello world  ")).toBe(
      "hello world",
    );
  });

  it("returns empty for blank input", () => {
    expect(normalizeTelegramCommandDescription("   ")).toBe("");
  });
});

/* ── TELEGRAM_COMMAND_NAME_PATTERN ─────────────────────────────────── */

describe("TELEGRAM_COMMAND_NAME_PATTERN", () => {
  it("accepts lowercase alphanumeric with underscores", () => {
    expect(TELEGRAM_COMMAND_NAME_PATTERN.test("start")).toBe(true);
    expect(TELEGRAM_COMMAND_NAME_PATTERN.test("my_command_1")).toBe(true);
  });

  it("rejects uppercase", () => {
    expect(TELEGRAM_COMMAND_NAME_PATTERN.test("Start")).toBe(false);
  });

  it("rejects special characters", () => {
    expect(TELEGRAM_COMMAND_NAME_PATTERN.test("my-command")).toBe(false);
    expect(TELEGRAM_COMMAND_NAME_PATTERN.test("cmd!")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(TELEGRAM_COMMAND_NAME_PATTERN.test("")).toBe(false);
  });

  it("rejects strings longer than 32 chars", () => {
    expect(TELEGRAM_COMMAND_NAME_PATTERN.test("a".repeat(32))).toBe(true);
    expect(TELEGRAM_COMMAND_NAME_PATTERN.test("a".repeat(33))).toBe(false);
  });
});

/* ── resolveTelegramCustomCommands ─────────────────────────────────── */

describe("resolveTelegramCustomCommands", () => {
  it("resolves valid commands", () => {
    const result = resolveTelegramCustomCommands({
      commands: [
        { command: "/start", description: "Start the bot" },
        { command: "help", description: "Show help" },
      ],
    });
    expect(result.commands).toEqual([
      { command: "start", description: "Start the bot" },
      { command: "help", description: "Show help" },
    ]);
    expect(result.issues).toEqual([]);
  });

  it("returns empty for null/undefined commands", () => {
    expect(resolveTelegramCustomCommands({ commands: null }).commands).toEqual(
      [],
    );
    expect(
      resolveTelegramCustomCommands({ commands: undefined }).commands,
    ).toEqual([]);
    expect(resolveTelegramCustomCommands({}).commands).toEqual([]);
  });

  it("reports issue for missing command name", () => {
    const result = resolveTelegramCustomCommands({
      commands: [{ command: "", description: "desc" }],
    });
    expect(result.commands).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].field).toBe("command");
    expect(result.issues[0].index).toBe(0);
  });

  it("reports issue for null command name", () => {
    const result = resolveTelegramCustomCommands({
      commands: [{ command: null, description: "desc" }],
    });
    expect(result.commands).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].field).toBe("command");
  });

  it("reports issue for invalid command pattern", () => {
    const result = resolveTelegramCustomCommands({
      commands: [{ command: "my-command", description: "desc" }],
    });
    expect(result.commands).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain("invalid");
  });

  it("reports issue for reserved command", () => {
    const reserved = new Set(["start", "help"]);
    const result = resolveTelegramCustomCommands({
      commands: [{ command: "/start", description: "Start" }],
      reservedCommands: reserved,
    });
    expect(result.commands).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain("conflicts");
  });

  it("skips reserved check when checkReserved is false", () => {
    const reserved = new Set(["start"]);
    const result = resolveTelegramCustomCommands({
      commands: [{ command: "/start", description: "Start" }],
      reservedCommands: reserved,
      checkReserved: false,
    });
    expect(result.commands).toHaveLength(1);
    expect(result.issues).toEqual([]);
  });

  it("reports duplicate commands", () => {
    const result = resolveTelegramCustomCommands({
      commands: [
        { command: "/test", description: "First" },
        { command: "/test", description: "Second" },
      ],
    });
    expect(result.commands).toHaveLength(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain("duplicated");
    expect(result.issues[0].index).toBe(1);
  });

  it("allows duplicates when checkDuplicates is false", () => {
    const result = resolveTelegramCustomCommands({
      commands: [
        { command: "/test", description: "First" },
        { command: "/test", description: "Second" },
      ],
      checkDuplicates: false,
    });
    expect(result.commands).toHaveLength(2);
    expect(result.issues).toEqual([]);
  });

  it("reports issue for missing description", () => {
    const result = resolveTelegramCustomCommands({
      commands: [{ command: "/test", description: "" }],
    });
    expect(result.commands).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].field).toBe("description");
  });

  it("handles mixed valid and invalid commands", () => {
    const result = resolveTelegramCustomCommands({
      commands: [
        { command: "/valid", description: "OK" },
        { command: "", description: "missing" },
        { command: "/also_valid", description: "Also OK" },
      ],
    });
    expect(result.commands).toHaveLength(2);
    expect(result.issues).toHaveLength(1);
  });

  it("handles command name over 32 chars", () => {
    const longCmd = "a".repeat(33);
    const result = resolveTelegramCustomCommands({
      commands: [{ command: longCmd, description: "desc" }],
    });
    expect(result.commands).toEqual([]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain("invalid");
  });
});
