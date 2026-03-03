import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveConfigPath,
  resolveDefaultConfigCandidates,
  resolveOAuthDir,
  resolveOAuthPath,
  resolveStateDir,
  resolveUserPath,
} from "./paths";

describe("oauth paths", () => {
  it("prefers MILADY_OAUTH_DIR over MILADY_STATE_DIR", () => {
    const env = {
      MILADY_OAUTH_DIR: "/custom/oauth",
      MILADY_STATE_DIR: "/custom/state",
    } as NodeJS.ProcessEnv;

    expect(resolveOAuthDir(env, "/custom/state")).toBe(
      path.resolve("/custom/oauth"),
    );
    expect(resolveOAuthPath(env, "/custom/state")).toBe(
      path.join(path.resolve("/custom/oauth"), "oauth.json"),
    );
  });

  it("derives oauth path from MILADY_STATE_DIR when unset", () => {
    const env = {
      MILADY_STATE_DIR: "/custom/state",
    } as NodeJS.ProcessEnv;

    expect(resolveOAuthDir(env, "/custom/state")).toBe(
      path.join("/custom/state", "credentials"),
    );
    expect(resolveOAuthPath(env, "/custom/state")).toBe(
      path.join("/custom/state", "credentials", "oauth.json"),
    );
  });
});

describe("state + config path candidates", () => {
  it("uses MILADY_STATE_DIR when set", () => {
    const env = {
      MILADY_STATE_DIR: "/new/state",
    } as NodeJS.ProcessEnv;

    expect(resolveStateDir(env, () => "/home/test")).toBe(
      path.resolve("/new/state"),
    );
  });

  it("returns only milady.json in .milady directory", () => {
    const home = "/home/test";
    const candidates = resolveDefaultConfigCandidates(
      {} as NodeJS.ProcessEnv,
      () => home,
    );
    const expected = [path.join(home, ".milady", "milady.json")];
    expect(candidates).toEqual(expected);
  });

  it("defaults to ~/.milady when no env override", () => {
    const home = "/home/test";
    const resolved = resolveStateDir({} as NodeJS.ProcessEnv, () => home);
    expect(resolved).toBe(path.join(home, ".milady"));
  });

  it("config path defaults to milady.json in state dir", () => {
    const home = "/home/test";
    const state = resolveStateDir({} as NodeJS.ProcessEnv, () => home);
    const resolved = resolveConfigPath({} as NodeJS.ProcessEnv, state);
    expect(resolved).toBe(path.join(home, ".milady", "milady.json"));
  });

  it("respects state dir overrides", () => {
    const overrideDir = "/custom/override";
    const env = { MILADY_STATE_DIR: overrideDir } as NodeJS.ProcessEnv;
    const resolved = resolveConfigPath(env, overrideDir);
    expect(resolved).toBe(path.join(overrideDir, "milady.json"));
  });
});

describe("resolveUserPath", () => {
  it("expands ~ to home dir", () => {
    expect(resolveUserPath("~")).toBe(path.resolve(os.homedir()));
  });

  it("expands ~/ to home dir", () => {
    expect(resolveUserPath("~/milady")).toBe(
      path.resolve(os.homedir(), "milady"),
    );
  });

  it("expands ~\\ (Windows separator) to home dir", () => {
    const result = resolveUserPath("~\\milady");
    expect(result).toContain("milady");
    expect(result.startsWith("~")).toBe(false);
  });

  it("resolves relative paths", () => {
    expect(resolveUserPath("tmp/dir")).toBe(path.resolve("tmp/dir"));
  });

  it("returns empty string for empty input", () => {
    expect(resolveUserPath("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(resolveUserPath("   ")).toBe("");
  });

  it("resolves absolute paths as-is", () => {
    expect(resolveUserPath("/usr/local/bin")).toBe(
      path.resolve("/usr/local/bin"),
    );
  });

  it("does NOT expand ~user (only bare ~ or ~/)", () => {
    const result = resolveUserPath("~otheruser/foo");
    expect(result).toBe(path.resolve("~otheruser/foo"));
  });

  it("trims leading/trailing whitespace", () => {
    expect(resolveUserPath("  ~/foo  ")).toBe(
      path.resolve(os.homedir(), "foo"),
    );
  });
});

describe("resolveConfigPath", () => {
  it("respects MILADY_CONFIG_PATH env override", () => {
    const env = {
      MILADY_CONFIG_PATH: "/custom/config.json",
    } as NodeJS.ProcessEnv;
    const result = resolveConfigPath(env);
    expect(result).toBe(path.resolve("/custom/config.json"));
  });

  it("ignores whitespace-only MILADY_CONFIG_PATH", () => {
    const env = { MILADY_CONFIG_PATH: "   " } as NodeJS.ProcessEnv;
    const home = "/home/test";
    const state = resolveStateDir(env, () => home);
    const result = resolveConfigPath(env, state);
    expect(result).toBe(path.join(home, ".milady", "milady.json"));
  });
});

describe("resolveDefaultConfigCandidates", () => {
  it("returns explicit path when MILADY_CONFIG_PATH is set", () => {
    const env = { MILADY_CONFIG_PATH: "/my/config.json" } as NodeJS.ProcessEnv;
    const candidates = resolveDefaultConfigCandidates(env, () => "/home/test");
    expect(candidates).toEqual([path.resolve("/my/config.json")]);
  });

  it("uses MILADY_STATE_DIR when MILADY_CONFIG_PATH is not set", () => {
    const env = { MILADY_STATE_DIR: "/custom/state" } as NodeJS.ProcessEnv;
    const candidates = resolveDefaultConfigCandidates(env, () => "/home/test");
    expect(candidates).toEqual([
      path.join(path.resolve("/custom/state"), "milady.json"),
    ]);
  });

  it("ignores whitespace-only env overrides", () => {
    const env = {
      MILADY_CONFIG_PATH: "  ",
      MILADY_STATE_DIR: "  ",
    } as NodeJS.ProcessEnv;
    const home = "/home/test";
    const candidates = resolveDefaultConfigCandidates(env, () => home);
    expect(candidates).toEqual([path.join(home, ".milady", "milady.json")]);
  });
});
