import { describe, expect, it } from "vitest";
import {
  chooseMiladyRuntime,
  isKnownUnstableBunOnLinux,
  resolveNodeExecPath,
  resolveRuntimeExecPath,
} from "./run-node-runtime.mjs";

describe("run-node runtime selection", () => {
  it("detects Bun 1.3.9 on Linux as unstable", () => {
    expect(
      isKnownUnstableBunOnLinux({ platform: "linux", bunVersion: "1.3.9" }),
    ).toBe(true);
    expect(
      isKnownUnstableBunOnLinux({
        platform: "linux",
        bunVersion: "1.3.9-hotfix",
      }),
    ).toBe(true);
    expect(
      isKnownUnstableBunOnLinux({ platform: "darwin", bunVersion: "1.3.9" }),
    ).toBe(false);
    expect(
      isKnownUnstableBunOnLinux({ platform: "linux", bunVersion: "1.3.10" }),
    ).toBe(false);
  });

  it("honors explicit runtime overrides", () => {
    expect(
      chooseMiladyRuntime({
        requestedRuntime: "node",
        platform: "linux",
        bunVersion: "1.3.9",
      }),
    ).toEqual({ runtime: "node", warning: null });

    expect(
      chooseMiladyRuntime({
        requestedRuntime: "bun",
        platform: "linux",
        bunVersion: "1.3.9",
      }),
    ).toEqual({ runtime: "bun", warning: null });
  });

  it("falls back to node for linux Bun 1.3.9 when runtime is not set", () => {
    const selected = chooseMiladyRuntime({
      requestedRuntime: undefined,
      platform: "linux",
      bunVersion: "1.3.9",
    });
    expect(selected.runtime).toBe("node");
    expect(selected.warning).toContain("Bun 1.3.9");
  });

  it("defaults to bun otherwise", () => {
    expect(
      chooseMiladyRuntime({
        requestedRuntime: undefined,
        platform: "linux",
        bunVersion: "1.3.10",
      }),
    ).toEqual({ runtime: "bun", warning: null });
  });
});

describe("run-node executable resolution", () => {
  it("uses node on PATH when current exec is bun", () => {
    expect(
      resolveNodeExecPath({
        currentExecPath: "/Users/home/.bun/bin/bun",
        platform: "linux",
      }),
    ).toBe("node");
  });

  it("keeps current exec path when it already points to node", () => {
    expect(
      resolveNodeExecPath({
        currentExecPath: "/usr/bin/node",
        platform: "linux",
      }),
    ).toBe("/usr/bin/node");
  });

  it("prefers explicit node path override", () => {
    expect(
      resolveNodeExecPath({
        currentExecPath: "/Users/home/.bun/bin/bun",
        platform: "linux",
        explicitNodePath: "/custom/node",
      }),
    ).toBe("/custom/node");
  });

  it("resolves runtime executable for bun and node", () => {
    expect(
      resolveRuntimeExecPath({
        runtime: "bun",
        currentExecPath: "/usr/bin/node",
        platform: "linux",
      }),
    ).toBe("bun");

    expect(
      resolveRuntimeExecPath({
        runtime: "node",
        currentExecPath: "/Users/home/.bun/bin/bun",
        platform: "linux",
      }),
    ).toBe("node");
  });
});
