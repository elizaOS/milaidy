import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getCommandPath,
  getFlagValue,
  getPositiveIntFlagValue,
  getPrimaryCommand,
  getVerboseFlag,
  hasFlag,
  hasHelpOrVersion,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv";

describe("argv helpers", () => {
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "eliza", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "eliza", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "eliza", "config"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "eliza", "config", "--json"], 2)).toEqual([
      "config",
    ]);
    expect(getCommandPath(["node", "eliza", "agents", "list"], 2)).toEqual([
      "agents",
      "list",
    ]);
    expect(
      getCommandPath(["node", "eliza", "config", "--", "ignored"], 2),
    ).toEqual(["config"]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "eliza", "agents", "list"])).toBe(
      "agents",
    );
    expect(getPrimaryCommand(["node", "eliza"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "eliza", "config", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "eliza", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(
      getFlagValue(
        ["node", "eliza", "config", "--timeout", "5000"],
        "--timeout",
      ),
    ).toBe("5000");
    expect(
      getFlagValue(["node", "eliza", "config", "--timeout=2500"], "--timeout"),
    ).toBe("2500");
    expect(
      getFlagValue(["node", "eliza", "config", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getFlagValue(
        ["node", "eliza", "config", "--timeout", "--json"],
        "--timeout",
      ),
    ).toBe(null);
    expect(
      getFlagValue(["node", "eliza", "--", "--timeout=99"], "--timeout"),
    ).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "eliza", "config", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "eliza", "config", "--debug"])).toBe(false);
    expect(
      getVerboseFlag(["node", "eliza", "config", "--debug"], {
        includeDebug: true,
      }),
    ).toBe(true);
  });

  it("parses positive integer flag values", () => {
    expect(
      getPositiveIntFlagValue(["node", "eliza", "config"], "--timeout"),
    ).toBeUndefined();
    expect(
      getPositiveIntFlagValue(
        ["node", "eliza", "config", "--timeout"],
        "--timeout",
      ),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(
        ["node", "eliza", "config", "--timeout", "5000"],
        "--timeout",
      ),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(
        ["node", "eliza", "config", "--timeout", "nope"],
        "--timeout",
      ),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "eliza",
      rawArgs: ["node", "eliza", "config"],
    });
    expect(nodeArgv).toEqual(["node", "eliza", "config"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "eliza",
      rawArgs: ["node-22", "eliza", "config"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "eliza", "config"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "eliza",
      rawArgs: ["node-22.2.0.exe", "eliza", "config"],
    });
    expect(versionedNodeWindowsArgv).toEqual([
      "node-22.2.0.exe",
      "eliza",
      "config",
    ]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "eliza",
      rawArgs: ["node-22.2", "eliza", "config"],
    });
    expect(versionedNodePatchlessArgv).toEqual([
      "node-22.2",
      "eliza",
      "config",
    ]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "eliza",
      rawArgs: ["node-22.2.exe", "eliza", "config"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual([
      "node-22.2.exe",
      "eliza",
      "config",
    ]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "eliza",
      rawArgs: ["/usr/bin/node-22.2.0", "eliza", "config"],
    });
    expect(versionedNodeWithPathArgv).toEqual([
      "/usr/bin/node-22.2.0",
      "eliza",
      "config",
    ]);

    const nodejsArgv = buildParseArgv({
      programName: "eliza",
      rawArgs: ["nodejs", "eliza", "config"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "eliza", "config"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "eliza",
      rawArgs: ["node-dev", "eliza", "config"],
    });
    expect(nonVersionedNodeArgv).toEqual([
      "node",
      "eliza",
      "node-dev",
      "eliza",
      "config",
    ]);

    const directArgv = buildParseArgv({
      programName: "eliza",
      rawArgs: ["eliza", "config"],
    });
    expect(directArgv).toEqual(["node", "eliza", "config"]);

    const directElizaAiArgv = buildParseArgv({
      programName: "eliza",
      rawArgs: ["elizaai", "config"],
    });
    expect(directElizaAiArgv).toEqual(["node", "eliza", "config"]);

    const bunArgv = buildParseArgv({
      programName: "eliza",
      rawArgs: ["bun", "src/entry.ts", "config"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "config"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "eliza",
      fallbackArgv: ["config"],
    });
    expect(fallbackArgv).toEqual(["node", "eliza", "config"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "eliza", "memory", "status"])).toBe(
      false,
    );
    expect(
      shouldMigrateState(["node", "eliza", "agent", "--message", "hi"]),
    ).toBe(false);
    expect(shouldMigrateState(["node", "eliza", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "eliza", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
