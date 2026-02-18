import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execCalls } = vi.hoisted(() => ({
  execCalls: [] as Array<{ cmd: string; args: string[] }>,
}));

vi.mock("node:child_process", () => {
  const fsPromises =
    require("node:fs/promises") as typeof import("node:fs/promises");
  const pathMod = require("node:path") as typeof import("node:path");

  return {
    execFile: (
      cmd: string,
      args: string[],
      optionsOrCb: unknown,
      maybeCb?: unknown,
    ) => {
      const cb =
        typeof optionsOrCb === "function" ? optionsOrCb : (maybeCb as unknown);
      if (typeof cb !== "function") {
        throw new Error("execFile mock: callback missing");
      }

      execCalls.push({ cmd, args });

      // Package manager detection
      if (args[0] === "--version") {
        if (cmd === "bun") {
          queueMicrotask(() => cb(new Error("bun not installed"), "", ""));
          return {} as unknown;
        }
        if (cmd === "npm") {
          queueMicrotask(() => cb(null, "10.0.0\n", ""));
          return {} as unknown;
        }
      }

      // Deterministic install: create a minimal node_modules package.json so the
      // installer can read the installed version and resolve an entry point.
      if (cmd === "npm" && args[0] === "install") {
        const spec = String(args[1] ?? "");
        const prefixIndex = args.indexOf("--prefix");
        const targetDir =
          prefixIndex === -1 ? "" : String(args[prefixIndex + 1] ?? "");

        const lastAt = spec.lastIndexOf("@");
        const pkgName = spec.slice(0, lastAt);
        const version = spec.slice(lastAt + 1);

        const pkgDir = pathMod.join(
          targetDir,
          "node_modules",
          ...pkgName.split("/"),
        );
        fsPromises
          .mkdir(pkgDir, { recursive: true })
          .then(() =>
            fsPromises.writeFile(
              pathMod.join(pkgDir, "package.json"),
              JSON.stringify(
                { name: pkgName, version, type: "module", main: "index" },
                null,
                2,
              ),
            ),
          )
          .then(() => cb(null, "", ""))
          .catch((err: unknown) =>
            cb(err instanceof Error ? err : new Error(String(err)), "", ""),
          );
        return {} as unknown;
      }

      queueMicrotask(() =>
        cb(new Error(`Unexpected execFile: ${cmd} ${args.join(" ")}`), "", ""),
      );
      return {} as unknown;
    },
  };
});

vi.mock("./registry-client", () => ({
  getPluginInfo: vi.fn(),
}));

vi.mock("../runtime/restart", () => ({
  requestRestart: vi.fn(),
}));

let tmpDir: string;
let configDir: string;
let configPath: string;
let savedEnv: Record<string, string | undefined>;

function writeConfig(data: Record<string, unknown>) {
  return fs.writeFile(configPath, JSON.stringify(data, null, 2));
}

beforeEach(async () => {
  vi.resetModules();
  execCalls.splice(0, execCalls.length);

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "milady-inst-vtest-"));
  configDir = path.join(tmpDir, ".milady");
  configPath = path.join(configDir, "milady.json");

  await fs.mkdir(configDir, { recursive: true });
  await writeConfig({});

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

describe("plugin-installer (requestedVersion)", () => {
  it("installs the requested version when provided", async () => {
    const requestedVersion = "1.2.23-alpha.0";

    const { getPluginInfo } = await import("./registry-client");
    vi.mocked(getPluginInfo).mockResolvedValue({
      name: "@elizaos/plugin-test",
      gitRepo: "elizaos-plugins/plugin-test",
      gitUrl: "https://github.com/elizaos-plugins/plugin-test.git",
      description: "Test plugin",
      homepage: null,
      topics: [],
      stars: 0,
      language: "TypeScript",
      npm: {
        package: "@elizaos/plugin-test",
        v0Version: null,
        v1Version: null,
        v2Version: "2.0.0-alpha.3",
      },
      git: { v0Branch: null, v1Branch: null, v2Branch: "next" },
      supports: { v0: false, v1: false, v2: true },
    });

    const { installPlugin } = await import("./plugin-installer");
    const result = await installPlugin(
      "@elizaos/plugin-test",
      undefined,
      requestedVersion,
    );

    expect(result.success).toBe(true);
    expect(result.pluginName).toBe("@elizaos/plugin-test");
    expect(result.version).toBe(requestedVersion);

    const installCall = execCalls.find(
      (c) => c.cmd === "npm" && c.args[0] === "install",
    );
    expect(installCall?.args[1]).toBe(
      `@elizaos/plugin-test@${requestedVersion}`,
    );

    const config = JSON.parse(await fs.readFile(configPath, "utf-8")) as {
      plugins?: {
        installs?: Record<string, { spec?: string; version?: string }>;
      };
    };
    expect(config.plugins?.installs?.["@elizaos/plugin-test"]?.version).toBe(
      requestedVersion,
    );
    expect(config.plugins?.installs?.["@elizaos/plugin-test"]?.spec).toBe(
      `@elizaos/plugin-test@${requestedVersion}`,
    );
  });
});
