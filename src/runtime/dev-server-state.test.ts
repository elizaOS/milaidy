import { describe, expect, it } from "vitest";
import {
  type DevServerStatePathResolution,
  resolveDevServerStatePaths,
} from "./dev-server-state";

function resolveFor(env: NodeJS.ProcessEnv): DevServerStatePathResolution {
  return resolveDevServerStatePaths("/tmp/milaidy-main", env);
}

describe("resolveDevServerStatePaths", () => {
  it("defaults to workspace-local state when env vars are missing", () => {
    const resolved = resolveFor({});
    expect(resolved.stateDir).toBe("/tmp/milaidy-main/.milady-state");
    expect(resolved.configPath).toBe(
      "/tmp/milaidy-main/.milady-state/milady.json",
    );
    expect(resolved.changed).toBe(true);
  });

  it("derives config path from state dir when only MILADY_STATE_DIR is set", () => {
    const resolved = resolveFor({
      MILADY_STATE_DIR: "/tmp/custom-state",
    });
    expect(resolved.stateDir).toBe("/tmp/custom-state");
    expect(resolved.configPath).toBe("/tmp/custom-state/milady.json");
    expect(resolved.notes).toContain(
      "derived MILADY_CONFIG_PATH from MILADY_STATE_DIR",
    );
  });

  it("derives state dir from config path when only MILADY_CONFIG_PATH is set", () => {
    const resolved = resolveFor({
      MILADY_CONFIG_PATH: "/tmp/alpha/milady.json",
    });
    expect(resolved.stateDir).toBe("/tmp/alpha");
    expect(resolved.configPath).toBe("/tmp/alpha/milady.json");
    expect(resolved.notes).toContain(
      "derived MILADY_STATE_DIR from MILADY_CONFIG_PATH",
    );
  });

  it("forces config path to match state dir when both are set but mismatched", () => {
    const resolved = resolveFor({
      MILADY_STATE_DIR: "/tmp/state-a",
      MILADY_CONFIG_PATH: "/tmp/state-b/milady.json",
    });
    expect(resolved.stateDir).toBe("/tmp/state-a");
    expect(resolved.configPath).toBe("/tmp/state-a/milady.json");
    expect(resolved.notes.join(" ")).toContain("config/state mismatch");
  });

  it("does not report changes when env already matches canonical paths", () => {
    const resolved = resolveFor({
      MILADY_STATE_DIR: "/tmp/state-a",
      MILADY_CONFIG_PATH: "/tmp/state-a/milady.json",
    });
    expect(resolved.stateDir).toBe("/tmp/state-a");
    expect(resolved.configPath).toBe("/tmp/state-a/milady.json");
    expect(resolved.changed).toBe(false);
  });
});
