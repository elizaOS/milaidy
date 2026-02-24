/**
 * Tests that the $include config directive cannot be persisted to disk
 * via saveMiladyConfig, preventing arbitrary local file read on reload.
 *
 * Attack vector: An authenticated client sends:
 *   PUT /api/config
 *   { "env": { "$include": "~/.milady/auth/credentials.json" } }
 *
 * Without protection, the persisted config would contain the $include
 * directive, and the next loadMiladyConfig() → resolveConfigIncludes
 * pass would read credentials.json into the config.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveMiladyConfig } from "../config/config";
import type { MiladyConfig } from "../config/types";

// Mock resolveConfigPath so we can write to a temp file
let tmpConfigPath: string;

vi.mock("../config/paths", () => ({
  resolveConfigPath: () => tmpConfigPath,
  resolveUserPath: (p: string) => p,
}));

describe("$include config injection — saveMiladyConfig defense-in-depth", () => {
  beforeEach(() => {
    tmpConfigPath = path.join(
      os.tmpdir(),
      `milady-test-config-${Date.now()}.json`,
    );
  });

  afterEach(() => {
    try {
      fs.unlinkSync(tmpConfigPath);
    } catch {
      /* already cleaned */
    }
  });

  it("strips $include directives at the top level", () => {
    const config = {
      logging: { level: "error" },
      $include: "/etc/passwd",
    } as unknown as MiladyConfig;

    saveMiladyConfig(config);
    const written = JSON.parse(fs.readFileSync(tmpConfigPath, "utf-8"));

    expect(written).not.toHaveProperty("$include");
    expect(written.logging).toEqual({ level: "error" });
  });

  it("strips $include directives nested inside env", () => {
    const config = {
      logging: { level: "error" },
      env: {
        SOME_KEY: "value",
        $include: "~/.milady/auth/credentials.json",
      },
    } as unknown as MiladyConfig;

    saveMiladyConfig(config);
    const written = JSON.parse(fs.readFileSync(tmpConfigPath, "utf-8"));

    expect(written.env).not.toHaveProperty("$include");
    expect(written.env.SOME_KEY).toBe("value");
  });

  it("strips $include directives nested deeply", () => {
    const config = {
      logging: { level: "error" },
      plugins: {
        myPlugin: {
          settings: {
            $include: "/etc/shadow",
            foo: "bar",
          },
        },
      },
    } as unknown as MiladyConfig;

    saveMiladyConfig(config);
    const written = JSON.parse(fs.readFileSync(tmpConfigPath, "utf-8"));

    expect(written.plugins.myPlugin.settings).not.toHaveProperty("$include");
    expect(written.plugins.myPlugin.settings.foo).toBe("bar");
  });

  it("strips $include from arrays of objects", () => {
    const config = {
      logging: { level: "error" },
      agents: [{ name: "alice", $include: "/etc/hosts" }, { name: "bob" }],
    } as unknown as MiladyConfig;

    saveMiladyConfig(config);
    const written = JSON.parse(fs.readFileSync(tmpConfigPath, "utf-8"));

    expect(written.agents[0]).not.toHaveProperty("$include");
    expect(written.agents[0].name).toBe("alice");
    expect(written.agents[1].name).toBe("bob");
  });

  it("preserves legitimate config keys that resemble $include", () => {
    const config = {
      logging: { level: "error" },
      env: {
        include: "this-is-fine",
        INCLUDE: "also-fine",
        $other: "fine-too",
      },
    } as unknown as MiladyConfig;

    saveMiladyConfig(config);
    const written = JSON.parse(fs.readFileSync(tmpConfigPath, "utf-8"));

    expect(written.env.include).toBe("this-is-fine");
    expect(written.env.INCLUDE).toBe("also-fine");
    expect(written.env.$other).toBe("fine-too");
  });
});
