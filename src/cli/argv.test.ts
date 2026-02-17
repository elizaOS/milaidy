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
    expect(hasHelpOrVersion(["node", "milady", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "milady", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "milady", "config"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "milady", "config", "--json"], 2)).toEqual([
      "config",
    ]);
    expect(getCommandPath(["node", "milady", "agents", "list"], 2)).toEqual([
      "agents",
      "list",
    ]);
    expect(
      getCommandPath(["node", "milady", "config", "--", "ignored"], 2),
    ).toEqual(["config"]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "milady", "agents", "list"])).toBe(
      "agents",
    );
    expect(getPrimaryCommand(["node", "milady"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "milady", "config", "--json"], "--json")).toBe(
      true,
    );
    expect(hasFlag(["node", "milady", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(
      getFlagValue(
        ["node", "milady", "config", "--timeout", "5000"],
        "--timeout",
      ),
    ).toBe("5000");
    expect(
      getFlagValue(["node", "milady", "config", "--timeout=2500"], "--timeout"),
    ).toBe("2500");
    expect(
      getFlagValue(["node", "milady", "config", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getFlagValue(
        ["node", "milady", "config", "--timeout", "--json"],
        "--timeout",
      ),
    ).toBe(null);
    expect(
      getFlagValue(["node", "milady", "--", "--timeout=99"], "--timeout"),
    ).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "milady", "config", "--verbose"])).toBe(
      true,
    );
    expect(getVerboseFlag(["node", "milady", "config", "--debug"])).toBe(false);
    expect(
      getVerboseFlag(["node", "milady", "config", "--debug"], {
        includeDebug: true,
      }),
    ).toBe(true);
  });

  it("parses positive integer flag values", () => {
    expect(
      getPositiveIntFlagValue(["node", "milady", "config"], "--timeout"),
    ).toBeUndefined();
    expect(
      getPositiveIntFlagValue(
        ["node", "milady", "config", "--timeout"],
        "--timeout",
      ),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(
        ["node", "milady", "config", "--timeout", "5000"],
        "--timeout",
      ),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(
        ["node", "milady", "config", "--timeout", "nope"],
        "--timeout",
      ),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "milady",
      rawArgs: ["node", "milady", "config"],
    });
    expect(nodeArgv).toEqual(["node", "milady", "config"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "milady",
      rawArgs: ["node-22", "milady", "config"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "milady", "config"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "milady",
      rawArgs: ["node-22.2.0.exe", "milady", "config"],
    });
    expect(versionedNodeWindowsArgv).toEqual([
      "node-22.2.0.exe",
      "milady",
      "config",
    ]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "milady",
      rawArgs: ["node-22.2", "milady", "config"],
    });
    expect(versionedNodePatchlessArgv).toEqual([
      "node-22.2",
      "milady",
      "config",
    ]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "milady",
      rawArgs: ["node-22.2.exe", "milady", "config"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual([
      "node-22.2.exe",
      "milady",
      "config",
    ]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "milady",
      rawArgs: ["/usr/bin/node-22.2.0", "milady", "config"],
    });
    expect(versionedNodeWithPathArgv).toEqual([
      "/usr/bin/node-22.2.0",
      "milady",
      "config",
    ]);

    const nodejsArgv = buildParseArgv({
      programName: "milady",
      rawArgs: ["nodejs", "milady", "config"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "milady", "config"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "milady",
      rawArgs: ["node-dev", "milady", "config"],
    });
    expect(nonVersionedNodeArgv).toEqual([
      "node",
      "milady",
      "node-dev",
      "milady",
      "config",
    ]);

    const directArgv = buildParseArgv({
      programName: "milady",
      rawArgs: ["milady", "config"],
    });
    expect(directArgv).toEqual(["node", "milady", "config"]);

    const bunArgv = buildParseArgv({
      programName: "milady",
      rawArgs: ["bun", "src/entry.ts", "config"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "config"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "milady",
      fallbackArgv: ["config"],
    });
    expect(fallbackArgv).toEqual(["node", "milady", "config"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "milady", "memory", "status"])).toBe(
      false,
    );
    expect(
      shouldMigrateState(["node", "milady", "agent", "--message", "hi"]),
    ).toBe(false);
    expect(shouldMigrateState(["node", "milady", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "milady", "message", "send"])).toBe(
      true,
    );
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
