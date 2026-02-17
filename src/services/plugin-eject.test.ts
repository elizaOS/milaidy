import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockedStateDir = "";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("./registry-client", () => ({
  getPluginInfo: vi.fn(),
}));

vi.mock("../config/paths", () => ({
  resolveStateDir: vi.fn(() => mockedStateDir),
}));

vi.mock("./plugin-installer", async () => {
  const actual =
    await vi.importActual<typeof import("./plugin-installer")>(
      "./plugin-installer",
    );
  return {
    ...actual,
    detectPackageManager: vi.fn(async () => "npm"),
    resolveGitBranch: vi.fn(async () => "main"),
    sanitisePackageName: vi.fn((name: string) =>
      actual.sanitisePackageName(name),
    ),
    assertValidGitUrl: vi.fn((url: string) => actual.assertValidGitUrl(url)),
  };
});

async function loadPluginEject() {
  return await import("./plugin-eject");
}

function pluginInfo(overrides: Record<string, unknown> = {}) {
  return {
    name: "@elizaos/plugin-test",
    gitRepo: "elizaos-plugins/plugin-test",
    gitUrl: "https://github.com/elizaos-plugins/plugin-test.git",
    npm: {
      package: "@elizaos/plugin-test",
      v0Version: null,
      v1Version: null,
      v2Version: "2.0.0",
    },
    ...overrides,
  };
}

function setExecFileHandler(
  handler: (
    file: string,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv } | undefined,
  ) =>
    | undefined
    | { stdout?: string; stderr?: string }
    | Promise<undefined | { stdout?: string; stderr?: string }>,
) {
  vi.mocked(execFile).mockImplementation(((file, args, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    const opts = (typeof options === "function" ? undefined : options) as
      | { cwd?: string; env?: NodeJS.ProcessEnv }
      | undefined;
    const cmdArgs = (args ?? []) as string[];

    Promise.resolve(handler(file, cmdArgs, opts))
      .then((result) =>
        cb?.(null, {
          stdout: result?.stdout ?? "",
          stderr: result?.stderr ?? "",
        }),
      )
      .catch((err) => cb?.(err));

    return {} as never;
  }) as never);
}

async function writeEjectedPlugin(
  stateDir: string,
  folder: string,
  pkg: { name: string; version?: string },
  upstream?:
    | Record<string, unknown>
    | "missing"
    | "invalid-schema"
    | "invalid-json",
) {
  const pluginDir = path.join(stateDir, "plugins", "ejected", folder);
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, "package.json"),
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version ?? "1.0.0",
      },
      null,
      2,
    ),
  );

  if (upstream === "missing" || upstream === undefined) return pluginDir;

  const upstreamPath = path.join(pluginDir, ".upstream.json");
  if (upstream === "invalid-json") {
    await fs.writeFile(upstreamPath, "{not-json", "utf-8");
    return pluginDir;
  }

  if (upstream === "invalid-schema") {
    await fs.writeFile(
      upstreamPath,
      JSON.stringify({
        $schema: "wrong-schema",
        gitUrl: "https://github.com/elizaos-plugins/plugin-test.git",
        branch: "main",
        commitHash: "abc123",
        npmPackage: "@elizaos/plugin-test",
        npmVersion: "2.0.0",
      }),
      "utf-8",
    );
    return pluginDir;
  }

  await fs.writeFile(
    upstreamPath,
    JSON.stringify(
      {
        $schema: "milaidy-upstream-v1",
        source: "github:elizaos-plugins/plugin-test",
        gitUrl: "https://github.com/elizaos-plugins/plugin-test.git",
        branch: "main",
        commitHash: "abc123",
        ejectedAt: "2026-02-01T00:00:00.000Z",
        npmPackage: "@elizaos/plugin-test",
        npmVersion: "2.0.0",
        lastSyncAt: null,
        localCommits: 0,
        ...upstream,
      },
      null,
      2,
    ),
    "utf-8",
  );
  return pluginDir;
}

let tmpDir = "";

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "milady-eject-test-"));
  mockedStateDir = tmpDir;
  setExecFileHandler(async () => ({ stdout: "" }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("plugin-eject", () => {
  describe("isWithinEjectedDir", () => {
    it("returns true only for paths inside ejected subdirectories", async () => {
      const { isWithinEjectedDir } = await loadPluginEject();
      const base = path.join(tmpDir, "plugins", "ejected");

      expect(isWithinEjectedDir(path.join(base, "plugin-a"))).toBe(true);
      expect(isWithinEjectedDir(base)).toBe(false);
      expect(isWithinEjectedDir(path.join(base, "..", "outside"))).toBe(false);
    });
  });

  describe("ejectPlugin", () => {
    it("ejects a plugin and writes upstream metadata", async () => {
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(pluginInfo() as never);

      setExecFileHandler(async (file, args) => {
        if (file !== "git" && file !== "npm") return;
        if (file === "git" && args[0] === "clone") {
          const targetDir = args[args.length - 1];
          await fs.mkdir(targetDir, { recursive: true });
          await fs.writeFile(
            path.join(targetDir, "package.json"),
            JSON.stringify({ name: "@elizaos/plugin-test", version: "2.0.0" }),
          );
          return;
        }
        if (file === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
          return { stdout: "abc123\n" };
        }
      });

      const { ejectPlugin } = await loadPluginEject();
      const result = await ejectPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(true);
      expect(result.pluginName).toBe("@elizaos/plugin-test");
      expect(result.upstreamCommit).toBe("abc123");
      await expect(fs.access(result.ejectedPath)).resolves.toBeUndefined();

      const upstreamRaw = await fs.readFile(
        path.join(result.ejectedPath, ".upstream.json"),
        "utf-8",
      );
      const upstream = JSON.parse(upstreamRaw) as Record<string, unknown>;
      expect(upstream.$schema).toBe("milaidy-upstream-v1");
      expect(upstream.gitUrl).toBe(
        "https://github.com/elizaos-plugins/plugin-test.git",
      );
      expect(upstream.branch).toBe("main");
      expect(upstream.commitHash).toBe("abc123");
    });

    it("returns already ejected error when target exists", async () => {
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(pluginInfo() as never);

      const existing = path.join(
        tmpDir,
        "plugins",
        "ejected",
        "_elizaos_plugin-test",
      );
      await fs.mkdir(existing, { recursive: true });

      const { ejectPlugin } = await loadPluginEject();
      const result = await ejectPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(result.error).toContain("already ejected");
      expect(vi.mocked(execFile)).not.toHaveBeenCalledWith(
        "git",
        expect.arrayContaining(["clone"]),
        expect.anything(),
        expect.anything(),
      );
    });

    it("returns validation error when plugin ID is empty", async () => {
      const { ejectPlugin } = await loadPluginEject();
      const result = await ejectPlugin("   ");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Plugin ID is required");
    });

    it("returns registry error when plugin is missing", async () => {
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(null);

      const { ejectPlugin } = await loadPluginEject();
      const result = await ejectPlugin("@elizaos/plugin-missing");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found in registry");
    });

    it("rejects path traversal when sanitised dir escapes ejected root", async () => {
      const { getPluginInfo } = await import("./registry-client");
      const installer = await import("./plugin-installer");
      vi.mocked(getPluginInfo).mockResolvedValue(pluginInfo() as never);
      vi.mocked(installer.sanitisePackageName).mockReturnValueOnce("../escape");

      const { ejectPlugin } = await loadPluginEject();
      const result = await ejectPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Refusing to write outside");
    });

    it("serialises concurrent eject calls", async () => {
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockImplementation(async (id: string) => {
        if (id.includes("one")) {
          return pluginInfo({
            name: "@elizaos/plugin-one",
            gitRepo: "elizaos-plugins/plugin-one",
            npm: { package: "@elizaos/plugin-one", v2Version: "1.0.0" },
          }) as never;
        }
        return pluginInfo({
          name: "@elizaos/plugin-two",
          gitRepo: "elizaos-plugins/plugin-two",
          npm: { package: "@elizaos/plugin-two", v2Version: "1.0.0" },
        }) as never;
      });

      let firstCloneFinished = false;
      let secondCloneStartedBeforeFirstFinished = false;
      let releaseFirstClone: (() => void) | null = null;
      const firstCloneGate = new Promise<void>((resolve) => {
        releaseFirstClone = resolve;
      });

      setExecFileHandler(async (file, args) => {
        if (file === "git" && args[0] === "clone") {
          const targetDir = args[args.length - 1];
          if (targetDir.includes("plugin-one")) {
            await firstCloneGate;
            firstCloneFinished = true;
          } else if (!firstCloneFinished) {
            secondCloneStartedBeforeFirstFinished = true;
          }
          await fs.mkdir(targetDir, { recursive: true });
          await fs.writeFile(
            path.join(targetDir, "package.json"),
            JSON.stringify({
              name: path.basename(targetDir),
              version: "1.0.0",
            }),
          );
          return;
        }
        if (file === "git" && args[0] === "rev-parse") {
          return { stdout: "head123\n" };
        }
      });

      const { ejectPlugin } = await loadPluginEject();
      const first = ejectPlugin("@elizaos/plugin-one");
      const second = ejectPlugin("@elizaos/plugin-two");

      await new Promise((resolve) => setTimeout(resolve, 20));
      releaseFirstClone?.();

      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult.success).toBe(true);
      expect(secondResult.success).toBe(true);
      expect(secondCloneStartedBeforeFirstFinished).toBe(false);
    });

    it("cleans up cloned dir when install step fails", async () => {
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(pluginInfo() as never);

      const targetDir = path.join(
        tmpDir,
        "plugins",
        "ejected",
        "_elizaos_plugin-test",
      );

      setExecFileHandler(async (file, args) => {
        if (file === "git" && args[0] === "clone") {
          await fs.mkdir(targetDir, { recursive: true });
          await fs.writeFile(
            path.join(targetDir, "package.json"),
            JSON.stringify({ name: "@elizaos/plugin-test", version: "1.0.0" }),
          );
          return;
        }
        if (file === "npm" && args.join(" ") === "install") {
          throw new Error("install failed");
        }
        if (file === "git" && args.join(" ") === "rev-parse HEAD") {
          return { stdout: "should-not-run\n" };
        }
      });

      const { ejectPlugin } = await loadPluginEject();
      const result = await ejectPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(result.error).toContain("install failed");
      await expect(fs.access(targetDir)).rejects.toThrow();
    });

    it("rejects invalid package name from registry info", async () => {
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(
        pluginInfo({ name: "bad name" }) as never,
      );

      const { ejectPlugin } = await loadPluginEject();
      const result = await ejectPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid package name");
    });

    it("rejects invalid git URL from registry info", async () => {
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(
        pluginInfo({
          gitUrl: "git@github.com:elizaos-plugins/plugin-test.git",
        }) as never,
      );

      const { ejectPlugin } = await loadPluginEject();
      const result = await ejectPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid git URL");
    });

    it("rejects invalid branch before attempting clone", async () => {
      const installer = await import("./plugin-installer");
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(pluginInfo() as never);
      vi.mocked(installer.resolveGitBranch).mockResolvedValue("bad branch");

      const { ejectPlugin } = await loadPluginEject();
      const result = await ejectPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid git branch");
    });

    it("propagates non-ENOENT access errors before cloning", async () => {
      const installer = await import("./plugin-installer");
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(pluginInfo() as never);
      vi.mocked(installer.resolveGitBranch).mockResolvedValue("main");

      vi.spyOn(fs, "access").mockRejectedValueOnce(
        Object.assign(new Error("permission denied"), {
          code: "EACCES",
        }) as NodeJS.ErrnoException,
      );

      const { ejectPlugin } = await loadPluginEject();
      await expect(ejectPlugin("@elizaos/plugin-test")).rejects.toThrow(
        "permission denied",
      );
    });

    it("falls back to npm when primary package manager install fails", async () => {
      const installer = await import("./plugin-installer");
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(pluginInfo() as never);
      vi.mocked(installer.detectPackageManager).mockResolvedValue("bun");

      const targetDir = path.join(
        tmpDir,
        "plugins",
        "ejected",
        "_elizaos_plugin-test",
      );
      setExecFileHandler(async (file, args) => {
        if (file === "git" && args[0] === "clone") {
          await fs.mkdir(targetDir, { recursive: true });
          return;
        }
        if (file === "bun" && args[0] === "install") {
          throw new Error("bun missing");
        }
        if (file === "npm" && args[0] === "install") {
          return;
        }
        if (file === "git" && args.join(" ") === "rev-parse HEAD") {
          return { stdout: "abc123\n" };
        }
      });

      const { ejectPlugin } = await loadPluginEject();
      const result = await ejectPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(true);
      expect(result.pluginName).toBe("@elizaos/plugin-test");
      expect(execFile).toHaveBeenCalledWith(
        "bun",
        ["install"],
        expect.any(Object),
        expect.any(Function),
      );
      expect(execFile).toHaveBeenCalledWith(
        "npm",
        ["install"],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("continues when build script fails during ejected plugin install", async () => {
      const installer = await import("./plugin-installer");
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(pluginInfo() as never);
      vi.mocked(installer.detectPackageManager).mockResolvedValue("npm");

      const targetDir = path.join(
        tmpDir,
        "plugins",
        "ejected",
        "_elizaos_plugin-test",
      );
      setExecFileHandler(async (file, args) => {
        if (file === "git" && args[0] === "clone") {
          await fs.mkdir(targetDir, { recursive: true });
          await fs.writeFile(
            path.join(targetDir, "package.json"),
            JSON.stringify(
              { name: "@elizaos/plugin-test", scripts: { build: "echo" } },
              null,
              2,
            ),
          );
          return;
        }
        if (file === "npm" && args.join(" ") === "install") return;
        if (file === "npm" && args.join(" ") === "run build") {
          throw new Error("build failed");
        }
        if (file === "git" && args.join(" ") === "rev-parse HEAD") {
          return { stdout: "abc123\n" };
        }
      });

      const { ejectPlugin } = await loadPluginEject();
      const result = await ejectPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(true);
      expect(execFile).toHaveBeenCalledWith(
        "npm",
        ["run", "build"],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("converts non-Error install errors during eject", async () => {
      const { getPluginInfo } = await import("./registry-client");
      const installer = await import("./plugin-installer");
      vi.mocked(getPluginInfo).mockResolvedValue(pluginInfo() as never);
      vi.mocked(installer.detectPackageManager).mockResolvedValue("npm");

      const targetDir = path.join(
        tmpDir,
        "plugins",
        "ejected",
        "_elizaos_plugin-test",
      );
      setExecFileHandler(async (file, args) => {
        if (file === "git" && args[0] === "clone") {
          await fs.mkdir(targetDir, { recursive: true });
          await fs.writeFile(
            path.join(targetDir, "package.json"),
            JSON.stringify({ name: "@elizaos/plugin-test", version: "1.0.0" }),
          );
          return;
        }
        if (file === "npm" && args.join(" ") === "install") {
          throw "install failed without Error";
        }
        if (file === "git" && args.join(" ") === "rev-parse HEAD") {
          return { stdout: "should-not-run\n" };
        }
      });

      const { ejectPlugin } = await loadPluginEject();
      const result = await ejectPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(result.error).toBe("install failed without Error");
      await expect(fs.access(targetDir)).rejects.toThrow();
    });
  });

  describe("syncPlugin", () => {
    it("returns error when plugin is not ejected", async () => {
      const { syncPlugin } = await loadPluginEject();
      const result = await syncPlugin("@elizaos/plugin-missing");

      expect(result.success).toBe(false);
      expect(result.error).toContain("is not ejected");
    });

    it("treats unmatched installed entries as not ejected", async () => {
      const baseDir = path.join(tmpDir, "plugins", "ejected");
      const otherDir = path.join(baseDir, "_elizaos_plugin-other");
      await fs.mkdir(otherDir, { recursive: true });
      await fs.writeFile(
        path.join(otherDir, "package.json"),
        JSON.stringify({ name: "@elizaos/plugin-other", version: "1.0.0" }),
      );

      const { syncPlugin } = await loadPluginEject();
      const result = await syncPlugin("plugin-missing");

      expect(result.success).toBe(false);
      expect(result.error).toContain("is not ejected");
    });

    it("rethrows unexpected readdir errors when resolving plugin id", async () => {
      const baseDir = path.join(tmpDir, "plugins", "ejected");
      await fs.mkdir(baseDir, { recursive: true });

      const expectedError = Object.assign(new Error("permission denied"), {
        code: "EACCES",
      });
      const readdirSpy = vi
        .spyOn(fs, "readdir")
        .mockRejectedValueOnce(expectedError as NodeJS.ErrnoException);

      const { syncPlugin } = await loadPluginEject();
      await expect(syncPlugin("plugin-missing")).rejects.toThrow(
        "permission denied",
      );

      readdirSpy.mockRestore();
    });

    it("refuses to sync resolved plugin paths outside ejected root", async () => {
      vi.spyOn(fs, "readdir").mockResolvedValueOnce([
        {
          name: "../outside",
          isDirectory: () => true,
        },
      ] as never);

      const { syncPlugin } = await loadPluginEject();
      const result = await syncPlugin("../outside");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Refusing to sync plugin outside");
      expect(result.conflicts).toEqual([]);
    });

    it("syncs successfully and updates upstream metadata", async () => {
      const pluginDir = await writeEjectedPlugin(
        tmpDir,
        "_elizaos_plugin-test",
        { name: "@elizaos/plugin-test", version: "1.0.0" },
        {},
      );

      setExecFileHandler(async (file, args, _options) => {
        if (
          file === "git" &&
          args.join(" ") === "rev-parse --is-shallow-repository"
        ) {
          return { stdout: "false\n" };
        }
        if (file === "git" && args[0] === "fetch") return;
        if (file === "git" && args.join(" ") === "status --porcelain") {
          return { stdout: "" };
        }
        if (
          file === "git" &&
          args.join(" ") === "rev-list --count HEAD..origin/main"
        ) {
          return { stdout: "2\n" };
        }
        if (file === "git" && args[0] === "merge") return;
        if (file === "npm" && args.join(" ") === "install") return;
        if (file === "git" && args.join(" ") === "rev-parse HEAD") {
          return { stdout: "newhead456\n" };
        }
        if (
          file === "git" &&
          args.join(" ") === "rev-list --count origin/main..HEAD"
        ) {
          return { stdout: "1\n" };
        }
        if (options?.cwd !== pluginDir && file !== "npm") {
          throw new Error("unexpected cwd");
        }
      });

      const { syncPlugin } = await loadPluginEject();
      const result = await syncPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(true);
      expect(result.upstreamCommits).toBe(2);
      expect(result.localChanges).toBe(false);
      expect(result.commitHash).toBe("newhead456");

      const upstreamRaw = await fs.readFile(
        path.join(pluginDir, ".upstream.json"),
        "utf-8",
      );
      const upstream = JSON.parse(upstreamRaw) as Record<string, unknown>;
      expect(upstream.$schema).toBe("milaidy-upstream-v1");
      expect(upstream.commitHash).toBe("newhead456");
      expect(upstream.localCommits).toBe(1);
      expect(typeof upstream.lastSyncAt).toBe("string");
    });

    it("reports conflicts on merge failure", async () => {
      await writeEjectedPlugin(
        tmpDir,
        "_elizaos_plugin-test",
        { name: "@elizaos/plugin-test", version: "1.0.0" },
        {},
      );

      setExecFileHandler(async (file, args) => {
        if (
          file === "git" &&
          args.join(" ") === "rev-parse --is-shallow-repository"
        ) {
          return { stdout: "false\n" };
        }
        if (file === "git" && args[0] === "fetch") return;
        if (file === "git" && args.join(" ") === "status --porcelain") {
          return { stdout: " M src/local.ts\n" };
        }
        if (
          file === "git" &&
          args.join(" ") === "rev-list --count HEAD..origin/main"
        ) {
          return { stdout: "1\n" };
        }
        if (file === "git" && args[0] === "merge") {
          throw new Error("merge failed");
        }
        if (
          file === "git" &&
          args.join(" ") === "diff --name-only --diff-filter=U"
        ) {
          return { stdout: "src/conflict-a.ts\nsrc/conflict-b.ts\n" };
        }
      });

      const { syncPlugin } = await loadPluginEject();
      const result = await syncPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(result.localChanges).toBe(true);
      expect(result.upstreamCommits).toBe(1);
      expect(result.conflicts).toEqual([
        "src/conflict-a.ts",
        "src/conflict-b.ts",
      ]);
      expect(result.error).toContain("merge failed");
    });

    it("handles shallow clones by trying --unshallow and continuing", async () => {
      await writeEjectedPlugin(
        tmpDir,
        "_elizaos_plugin-test",
        { name: "@elizaos/plugin-test", version: "1.0.0" },
        {},
      );

      setExecFileHandler(async (file, args) => {
        if (
          file === "git" &&
          args.join(" ") === "rev-parse --is-shallow-repository"
        ) {
          return { stdout: "true\n" };
        }
        if (
          file === "git" &&
          args.join(" ") === "fetch --unshallow origin main"
        ) {
          throw new Error("remote rejected");
        }
        if (file === "git" && args.join(" ") === "fetch origin main") return;
        if (file === "git" && args.join(" ") === "status --porcelain") {
          return { stdout: "" };
        }
        if (
          file === "git" &&
          args.join(" ") === "rev-list --count HEAD..origin/main"
        ) {
          return { stdout: "0\n" };
        }
        if (file === "npm" && args.join(" ") === "install") return;
        if (file === "git" && args.join(" ") === "rev-parse HEAD") {
          return { stdout: "head789\n" };
        }
        if (
          file === "git" &&
          args.join(" ") === "rev-list --count origin/main..HEAD"
        ) {
          return { stdout: "0\n" };
        }
      });

      const { syncPlugin } = await loadPluginEject();
      const result = await syncPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(true);
      expect(vi.mocked(execFile)).toHaveBeenCalledWith(
        "git",
        ["fetch", "--unshallow", "origin", "main"],
        expect.any(Object),
        expect.any(Function),
      );
      expect(vi.mocked(execFile)).toHaveBeenCalledWith(
        "git",
        ["fetch", "origin", "main"],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("rejects invalid upstream schema metadata", async () => {
      await writeEjectedPlugin(
        tmpDir,
        "_elizaos_plugin-test",
        { name: "@elizaos/plugin-test", version: "1.0.0" },
        "invalid-schema",
      );

      const { syncPlugin } = await loadPluginEject();
      const result = await syncPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing or invalid");
    });

    it("rejects metadata with invalid upstream URL or branch", async () => {
      await writeEjectedPlugin(
        tmpDir,
        "_elizaos_plugin-test",
        { name: "@elizaos/plugin-test", version: "1.0.0" },
        {
          gitUrl: "git@github.com:elizaos-plugins/plugin-test.git",
          branch: "bad branch",
          commitHash: "abc123",
        },
      );

      const { syncPlugin } = await loadPluginEject();
      const result = await syncPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid upstream metadata");
      expect(result.upstreamCommits).toBe(0);
    });

    it("continues when shallow check throws and then applies normal fetch flow", async () => {
      await writeEjectedPlugin(
        tmpDir,
        "_elizaos_plugin-test",
        { name: "@elizaos/plugin-test", version: "1.0.0" },
        {},
      );

      setExecFileHandler(async (file, args, _options) => {
        if (
          file === "git" &&
          args.join(" ") === "rev-parse --is-shallow-repository"
        ) {
          throw new Error("transient git error");
        }
        if (
          file === "git" &&
          args.join(" ") === "fetch --unshallow origin main"
        ) {
          return;
        }
        if (file === "git" && args.join(" ") === "fetch origin main") return;
        if (file === "git" && args.join(" ") === "status --porcelain")
          return { stdout: "" };
        if (
          file === "git" &&
          args.join(" ") === "rev-list --count HEAD..origin/main"
        ) {
          return { stdout: "0\n" };
        }
        if (file === "git" && args.join(" ") === "rev-parse HEAD") {
          return { stdout: "head001\n" };
        }
        if (
          file === "git" &&
          args.join(" ") === "rev-list --count origin/main..HEAD"
        ) {
          return { stdout: "1\n" };
        }
        if (file === "npm" && args.join(" ") === "install") return;
        if (file === "git" && args[0] === "merge") return;
      });

      const { syncPlugin } = await loadPluginEject();
      const result = await syncPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(true);
      expect(vi.mocked(execFile)).toHaveBeenCalledWith(
        "git",
        ["fetch", "origin", "main"],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("treats merge conflicts as empty when conflict diff cannot be read", async () => {
      await writeEjectedPlugin(
        tmpDir,
        "_elizaos_plugin-test",
        { name: "@elizaos/plugin-test", version: "1.0.0" },
        {},
      );

      setExecFileHandler(async (file, args) => {
        if (
          file === "git" &&
          args.join(" ") === "rev-parse --is-shallow-repository"
        ) {
          return { stdout: "false\n" };
        }
        if (file === "git" && args[0] === "fetch") return;
        if (file === "git" && args.join(" ") === "status --porcelain") {
          return { stdout: "" };
        }
        if (
          file === "git" &&
          args.join(" ") === "rev-list --count HEAD..origin/main"
        ) {
          return { stdout: "1\n" };
        }
        if (
          file === "git" &&
          args.join(" ") === "merge --no-edit origin/main"
        ) {
          throw new Error("merge failed");
        }
        if (
          file === "git" &&
          args.join(" ") === "diff --name-only --diff-filter=U"
        ) {
          throw new Error("diff unavailable");
        }
      });

      const { syncPlugin } = await loadPluginEject();
      const result = await syncPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(result.conflicts).toEqual([]);
      expect(result.error).toContain("merge failed");
    });

    it("reports non-Error merge errors as string", async () => {
      await writeEjectedPlugin(
        tmpDir,
        "_elizaos_plugin-test",
        { name: "@elizaos/plugin-test", version: "1.0.0" },
        {},
      );

      setExecFileHandler(async (file, args) => {
        if (
          file === "git" &&
          args.join(" ") === "rev-parse --is-shallow-repository"
        ) {
          return { stdout: "false\n" };
        }
        if (file === "git" && args[0] === "fetch") return;
        if (file === "git" && args.join(" ") === "status --porcelain") {
          return { stdout: "" };
        }
        if (
          file === "git" &&
          args.join(" ") === "rev-list --count HEAD..origin/main"
        ) {
          return { stdout: "1\n" };
        }
        if (
          file === "git" &&
          args.join(" ") === "merge --no-edit origin/main"
        ) {
          throw 123;
        }
        if (
          file === "git" &&
          args.join(" ") === "diff --name-only --diff-filter=U"
        ) {
          return { stdout: "src/conflict.ts\n" };
        }
      });

      const { syncPlugin } = await loadPluginEject();
      const result = await syncPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(result.conflicts).toEqual(["src/conflict.ts"]);
      expect(result.error).toBe("123");
      expect(result.upstreamCommits).toBe(1);
    });
  });

  describe("reinjectPlugin", () => {
    it("removes an ejected plugin directory", async () => {
      const pluginDir = await writeEjectedPlugin(
        tmpDir,
        "_elizaos_plugin-test",
        { name: "@elizaos/plugin-test", version: "1.0.0" },
        {},
      );

      const { reinjectPlugin } = await loadPluginEject();
      const result = await reinjectPlugin("test");

      expect(result.success).toBe(true);
      expect(result.pluginName).toBe("@elizaos/plugin-test");
      expect(result.removedPath).toBe(pluginDir);
      await expect(fs.access(pluginDir)).rejects.toThrow();
    });

    it("returns error when plugin is not ejected", async () => {
      const { reinjectPlugin } = await loadPluginEject();
      const result = await reinjectPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(result.error).toContain("is not ejected");
    });

    it("refuses traversal-like resolved paths outside ejected root", async () => {
      await fs.mkdir(path.join(tmpDir, "plugins", "ejected"), {
        recursive: true,
      });
      const readdirSpy = vi.spyOn(fs, "readdir").mockResolvedValueOnce([
        {
          name: "../outside",
          isDirectory: () => true,
        },
      ] as never);

      const { reinjectPlugin } = await loadPluginEject();
      const result = await reinjectPlugin("../outside");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Refusing to remove plugin outside");
      readdirSpy.mockRestore();
    });
  });

  describe("listEjectedPlugins", () => {
    it("returns empty list for nonexistent ejected dir", async () => {
      const { listEjectedPlugins } = await loadPluginEject();
      const list = await listEjectedPlugins();
      expect(list).toEqual([]);
    });

    it("returns empty list for an empty ejected dir", async () => {
      await fs.mkdir(path.join(tmpDir, "plugins", "ejected"), {
        recursive: true,
      });
      const { listEjectedPlugins } = await loadPluginEject();
      const list = await listEjectedPlugins();
      expect(list).toEqual([]);
    });

    it("rethrows unexpected readdir errors", async () => {
      const expectedError = Object.assign(new Error("permission denied"), {
        code: "EACCES",
      });
      const readdirSpy = vi
        .spyOn(fs, "readdir")
        .mockRejectedValueOnce(expectedError);

      const { listEjectedPlugins } = await loadPluginEject();
      await expect(listEjectedPlugins()).rejects.toThrow("permission denied");

      readdirSpy.mockRestore();
    });

    it("skips non-directory and outside entries", async () => {
      const base = path.join(tmpDir, "plugins", "ejected");
      await fs.mkdir(base, { recursive: true });
      await fs.writeFile(path.join(base, "not-dir.txt"), "ignore me");
      const pluginDir = await writeEjectedPlugin(
        tmpDir,
        "_elizaos_plugin-test",
        { name: "@elizaos/plugin-test", version: "1.0.0" },
        { npmPackage: "@elizaos/plugin-test", commitHash: "abc" },
      );
      const readdirSpy = vi.spyOn(fs, "readdir").mockResolvedValueOnce([
        {
          name: "not-dir.txt",
          isDirectory: () => false,
        } as never,
        {
          name: "../outside",
          isDirectory: () => true,
        } as never,
        {
          name: "_elizaos_plugin-test",
          isDirectory: () => true,
        } as never,
      ]);

      const { listEjectedPlugins } = await loadPluginEject();
      const list = await listEjectedPlugins();

      expect(list).toEqual([
        {
          name: "@elizaos/plugin-test",
          path: pluginDir,
          version: "1.0.0",
          upstream: {
            $schema: "milaidy-upstream-v1",
            source: "github:elizaos-plugins/plugin-test",
            gitUrl: "https://github.com/elizaos-plugins/plugin-test.git",
            branch: "main",
            commitHash: "abc",
            ejectedAt: expect.any(String),
            npmPackage: "@elizaos/plugin-test",
            npmVersion: "2.0.0",
            lastSyncAt: null,
            localCommits: 0,
          },
        },
      ]);

      readdirSpy.mockRestore();
    });

    it("lists multiple ejected plugins and handles missing upstream metadata", async () => {
      const alphaDir = await writeEjectedPlugin(
        tmpDir,
        "_elizaos_plugin-alpha",
        { name: "@elizaos/plugin-alpha", version: "1.0.0" },
        {
          npmPackage: "@elizaos/plugin-alpha",
          commitHash: "alpha123",
        },
      );

      const betaDir = await writeEjectedPlugin(
        tmpDir,
        "_elizaos_plugin-beta",
        { name: "@elizaos/plugin-beta", version: "2.0.0" },
        "missing",
      );

      const { listEjectedPlugins } = await loadPluginEject();
      const list = await listEjectedPlugins();

      expect(list.map((item) => item.name)).toEqual([
        "@elizaos/plugin-alpha",
        "@elizaos/plugin-beta",
      ]);

      const alpha = list.find((item) => item.path === alphaDir);
      const beta = list.find((item) => item.path === betaDir);
      expect(alpha?.upstream?.$schema).toBe("milaidy-upstream-v1");
      expect(beta?.upstream).toBeNull();
      expect(alpha?.version).toBe("1.0.0");
      expect(beta?.version).toBe("2.0.0");
    });
  });
});
