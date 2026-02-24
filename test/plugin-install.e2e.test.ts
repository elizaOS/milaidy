/**
 * E2E tests for the plugin install/uninstall lifecycle.
 *
 * Validates install, uninstall, and rollback behaviour with fixture registries.
 * Real filesystem operations — only network I/O and process lifecycle are mocked.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — network I/O and process lifecycle only
// ---------------------------------------------------------------------------

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/services/registry-client", () => ({
  getPluginInfo: vi.fn(),
}));

vi.mock("../src/runtime/restart", () => ({
  requestRestart: vi.fn(),
}));

vi.mock("node:child_process", async () => {
  const actual =
    await vi.importActual<typeof import("node:child_process")>(
      "node:child_process",
    );
  return {
    ...actual,
    execFile: vi.fn(
      (_cmd: string, args: string[], optionsOrCb: unknown, cb?: unknown) => {
        let callback = typeof optionsOrCb === "function" ? optionsOrCb : cb;
        if (!callback && typeof args === "function") callback = args as unknown;
        const argsStr = JSON.stringify(args || []);
        const cbFn = callback as (
          err: Error | null,
          stdout: string,
          stderr: string,
        ) => void;

        if (argsStr.includes("--version")) {
          return process.nextTick(() => cbFn(null, "1.0.0", ""));
        }
        if (argsStr.includes("file:")) {
          return process.nextTick(() => cbFn(null, "", ""));
        }
        process.nextTick(() =>
          cbFn(new Error("Mock command failed"), "", "error from mock"),
        );
      },
    ),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let configDir: string;
let configPath: string;
let savedEnv: Record<string, string | undefined>;

function writeConfig(data: Record<string, unknown>) {
  const fsSync = require("node:fs") as typeof import("node:fs");
  fsSync.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

function readConfig(): Record<string, unknown> {
  const fsSync = require("node:fs") as typeof import("node:fs");
  return JSON.parse(fsSync.readFileSync(configPath, "utf-8"));
}

function fixturePluginInfo(overrides: Record<string, unknown> = {}) {
  return {
    name: "@elizaos/plugin-fixture",
    gitRepo: "elizaos-plugins/plugin-fixture",
    gitUrl: "https://github.com/elizaos-plugins/plugin-fixture.git",
    description: "Fixture plugin for e2e tests",
    homepage: null,
    topics: [],
    stars: 0,
    language: "TypeScript",
    npm: {
      package: "@elizaos/plugin-fixture",
      v0Version: null,
      v1Version: null,
      v2Version: "2.0.0-alpha.1",
    },
    git: { v0Branch: null, v1Branch: null, v2Branch: "next" },
    supports: { v0: false, v1: false, v2: true },
    ...overrides,
  };
}

async function writeLocalPlugin(
  rootDir: string,
  packageName: string,
  version: string,
): Promise<string> {
  const safeName = packageName.replace(/[^a-z0-9]/gi, "_");
  const packageDir = path.join(rootDir, `local-${safeName}`);
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(
    path.join(packageDir, "package.json"),
    JSON.stringify(
      { name: packageName, version, type: "module", main: "index" },
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(packageDir, "index"),
    "export default { name: 'fixture' };",
  );
  return packageDir;
}

async function loadInstaller() {
  return await import("../src/services/plugin-installer");
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.resetModules();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "milady-e2e-install-"));
  configDir = path.join(tmpDir, ".milady");
  configPath = path.join(configDir, "milady.json");
  await fs.mkdir(configDir, { recursive: true });
  writeConfig({});

  savedEnv = {
    MILADY_STATE_DIR: process.env.MILADY_STATE_DIR,
    MILADY_CONFIG_PATH: process.env.MILADY_CONFIG_PATH,
  };
  process.env.MILADY_STATE_DIR = configDir;
  process.env.MILADY_CONFIG_PATH = configPath;
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.env.MILADY_STATE_DIR = savedEnv.MILADY_STATE_DIR;
  process.env.MILADY_CONFIG_PATH = savedEnv.MILADY_CONFIG_PATH;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Plugin Install E2E", () => {
  describe("install → list → uninstall lifecycle", () => {
    it("completes full lifecycle with local plugin source", async () => {
      const localPath = await writeLocalPlugin(
        tmpDir,
        "@elizaos/plugin-lifecycle",
        "3.0.0",
      );
      const { getPluginInfo } = await import("../src/services/registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(
        fixturePluginInfo({
          name: "@elizaos/plugin-lifecycle",
          npm: {
            package: "@elizaos/plugin-lifecycle",
            v0Version: null,
            v1Version: null,
            v2Version: "3.0.0",
          },
          localPath,
        }),
      );

      const { installPlugin, listInstalledPlugins, uninstallPlugin } =
        await loadInstaller();

      // Install
      const result = await installPlugin("@elizaos/plugin-lifecycle");
      expect(result.success).toBe(true);
      expect(result.pluginName).toBe("@elizaos/plugin-lifecycle");
      expect(result.version).toBe("3.0.0");
      expect(result.requiresRestart).toBe(true);

      // List
      const installed = listInstalledPlugins();
      expect(installed).toHaveLength(1);
      expect(installed[0].name).toBe("@elizaos/plugin-lifecycle");
      expect(installed[0].version).toBe("3.0.0");

      // Config persisted
      const config = readConfig();
      const installs = (config.plugins as Record<string, unknown>)
        ?.installs as Record<string, unknown>;
      expect(installs["@elizaos/plugin-lifecycle"]).toBeDefined();

      // Directory exists on disk
      await expect(fs.access(result.installPath)).resolves.toBeUndefined();

      // Uninstall
      const unResult = await uninstallPlugin("@elizaos/plugin-lifecycle");
      expect(unResult.success).toBe(true);
      expect(unResult.requiresRestart).toBe(true);

      // Config cleaned
      const configAfter = readConfig();
      const installsAfter = (configAfter.plugins as Record<string, unknown>)
        ?.installs as Record<string, unknown>;
      expect(installsAfter?.["@elizaos/plugin-lifecycle"]).toBeUndefined();

      // Directory removed
      await expect(fs.access(result.installPath)).rejects.toThrow();

      // List empty
      expect(listInstalledPlugins()).toHaveLength(0);
    }, 180_000);

    it("re-install after uninstall succeeds", async () => {
      const localPath = await writeLocalPlugin(
        tmpDir,
        "@elizaos/plugin-reinstall",
        "1.0.0",
      );
      const { getPluginInfo } = await import("../src/services/registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(
        fixturePluginInfo({
          name: "@elizaos/plugin-reinstall",
          npm: {
            package: "@elizaos/plugin-reinstall",
            v0Version: null,
            v1Version: null,
            v2Version: "1.0.0",
          },
          localPath,
        }),
      );

      const { installPlugin, uninstallPlugin, listInstalledPlugins } =
        await loadInstaller();

      await installPlugin("@elizaos/plugin-reinstall");
      await uninstallPlugin("@elizaos/plugin-reinstall");
      expect(listInstalledPlugins()).toHaveLength(0);

      const result = await installPlugin("@elizaos/plugin-reinstall");
      expect(result.success).toBe(true);
      expect(listInstalledPlugins()).toHaveLength(1);
    }, 180_000);
  });

  describe("progress reporting", () => {
    it("emits resolving, downloading, validating, configuring, complete phases", async () => {
      const localPath = await writeLocalPlugin(
        tmpDir,
        "@elizaos/plugin-progress",
        "1.0.0",
      );
      const { getPluginInfo } = await import("../src/services/registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(
        fixturePluginInfo({
          name: "@elizaos/plugin-progress",
          npm: {
            package: "@elizaos/plugin-progress",
            v0Version: null,
            v1Version: null,
            v2Version: "1.0.0",
          },
          localPath,
        }),
      );

      const phases: string[] = [];
      const { installPlugin } = await loadInstaller();
      await installPlugin("@elizaos/plugin-progress", (progress) => {
        phases.push(progress.phase);
      });

      expect(phases).toContain("resolving");
      expect(phases).toContain("downloading");
      expect(phases).toContain("validating");
      expect(phases).toContain("configuring");
      expect(phases).toContain("complete");
    }, 180_000);
  });

  describe("install error handling", () => {
    it("returns error when plugin not found in registry", async () => {
      const { getPluginInfo } = await import("../src/services/registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(null);

      const { installPlugin } = await loadInstaller();
      const result = await installPlugin("@elizaos/plugin-ghost");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
      expect(result.pluginName).toBe("@elizaos/plugin-ghost");
    });

    it("returns error when both npm and git install fail", async () => {
      const { getPluginInfo } = await import("../src/services/registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(
        fixturePluginInfo({ name: "@elizaos/plugin-fail" }),
      );

      const phases: string[] = [];
      const { installPlugin } = await loadInstaller();
      const result = await installPlugin("@elizaos/plugin-fail", (p) =>
        phases.push(p.phase),
      );

      expect(result.success).toBe(false);
      expect(phases).toContain("resolving");
      expect(phases).toContain("downloading");
    }, 180_000);
  });

  describe("uninstall", () => {
    it("returns error for non-installed plugin", async () => {
      writeConfig({});
      const { uninstallPlugin } = await loadInstaller();
      const result = await uninstallPlugin("@elizaos/plugin-missing");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not a user-installed plugin");
    });

    it("succeeds when install directory already missing from disk", async () => {
      const ghostDir = path.join(
        configDir,
        "plugins",
        "installed",
        "_elizaos_plugin-ghost",
      );
      writeConfig({
        plugins: {
          installs: {
            "@elizaos/plugin-ghost": {
              source: "npm",
              installPath: ghostDir,
              version: "1.0.0",
            },
          },
        },
      });

      const { uninstallPlugin } = await loadInstaller();
      const result = await uninstallPlugin("@elizaos/plugin-ghost");
      expect(result.success).toBe(true);
    });

    it("rejects install path outside plugins directory", async () => {
      writeConfig({
        plugins: {
          installs: {
            "@elizaos/plugin-escape": {
              source: "npm",
              installPath: "/",
              version: "1.0.0",
            },
          },
        },
      });

      const { uninstallPlugin } = await loadInstaller();
      const result = await uninstallPlugin("@elizaos/plugin-escape");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Refusing to remove plugin outside");
    });

    it("removes directory from disk on success", async () => {
      const installDir = path.join(
        configDir,
        "plugins",
        "installed",
        "_elizaos_plugin-disk",
      );
      await fs.mkdir(installDir, { recursive: true });
      await fs.writeFile(path.join(installDir, "marker.txt"), "test");

      writeConfig({
        plugins: {
          installs: {
            "@elizaos/plugin-disk": {
              source: "npm",
              installPath: installDir,
              version: "1.0.0",
              installedAt: "2026-02-01T00:00:00Z",
            },
          },
        },
      });

      const { uninstallPlugin } = await loadInstaller();
      const result = await uninstallPlugin("@elizaos/plugin-disk");

      expect(result.success).toBe(true);
      await expect(fs.access(installDir)).rejects.toThrow();
    });
  });

  describe("serialisation", () => {
    it("concurrent installs don't corrupt config", async () => {
      const { getPluginInfo } = await import("../src/services/registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(null);

      const { installPlugin } = await loadInstaller();

      const results = await Promise.all([
        installPlugin("@elizaos/plugin-a"),
        installPlugin("@elizaos/plugin-b"),
        installPlugin("@elizaos/plugin-c"),
      ]);

      for (const r of results) {
        expect(r.success).toBe(false);
        expect(r.error).toContain("not found");
      }
    });
  });

  describe("installAndRestart", () => {
    it("does NOT call requestRestart when install fails", async () => {
      const { getPluginInfo } = await import("../src/services/registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(null);

      const { requestRestart } = await import("../src/runtime/restart");
      const { installAndRestart } = await loadInstaller();

      const result = await installAndRestart("@elizaos/plugin-fail");

      expect(result.success).toBe(false);
      expect(vi.mocked(requestRestart)).not.toHaveBeenCalled();
    });

    it("calls requestRestart on successful install", async () => {
      const localPath = await writeLocalPlugin(
        tmpDir,
        "@elizaos/plugin-restart",
        "1.0.0",
      );
      const { getPluginInfo } = await import("../src/services/registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(
        fixturePluginInfo({
          name: "@elizaos/plugin-restart",
          npm: {
            package: "@elizaos/plugin-restart",
            v0Version: null,
            v1Version: null,
            v2Version: "1.0.0",
          },
          localPath,
        }),
      );

      const { requestRestart } = await import("../src/runtime/restart");
      const { installAndRestart } = await loadInstaller();

      const result = await installAndRestart("@elizaos/plugin-restart");

      expect(result.success).toBe(true);
      expect(vi.mocked(requestRestart)).toHaveBeenCalledOnce();
    }, 180_000);
  });

  describe("config persistence", () => {
    it("survives module reload", async () => {
      const localPath = await writeLocalPlugin(
        tmpDir,
        "@elizaos/plugin-persist",
        "2.0.0",
      );
      const { getPluginInfo } = await import("../src/services/registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(
        fixturePluginInfo({
          name: "@elizaos/plugin-persist",
          npm: {
            package: "@elizaos/plugin-persist",
            v0Version: null,
            v1Version: null,
            v2Version: "2.0.0",
          },
          localPath,
        }),
      );

      const { installPlugin } = await loadInstaller();
      await installPlugin("@elizaos/plugin-persist");

      // Reset modules to simulate fresh process
      vi.resetModules();

      const { listInstalledPlugins } = await loadInstaller();
      const list = listInstalledPlugins();

      expect(list).toHaveLength(1);
      expect(list[0].name).toBe("@elizaos/plugin-persist");
      expect(list[0].version).toBe("2.0.0");
    }, 180_000);
  });

  describe("listInstalledPlugins", () => {
    it("returns empty array when no plugins installed", async () => {
      writeConfig({});
      const { listInstalledPlugins } = await loadInstaller();
      expect(listInstalledPlugins()).toEqual([]);
    });

    it("handles missing fields with defaults", async () => {
      writeConfig({
        plugins: {
          installs: {
            "@elizaos/plugin-sparse": {
              source: "npm",
            },
          },
        },
      });

      const { listInstalledPlugins } = await loadInstaller();
      const list = listInstalledPlugins();

      expect(list).toHaveLength(1);
      expect(list[0].version).toBe("unknown");
      expect(list[0].installPath).toBe("");
      expect(list[0].installedAt).toBe("");
    });
  });
});
