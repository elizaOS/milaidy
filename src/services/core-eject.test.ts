import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockedStateDir = "";
let originalCwd = "";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("./registry-client", () => ({
  getPluginInfo: vi.fn(),
}));

vi.mock("../config/paths", async () => {
  const actual = await import("../config/paths");
  return {
    ...actual,
    resolveStateDir: vi.fn(() => mockedStateDir),
  };
});

async function loadCoreEject() {
  return await import("./core-eject");
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
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(((
    file,
    args,
    options,
    callback,
  ) => {
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

async function writeTsconfig(repoDir: string): Promise<void> {
  await fs.writeFile(
    path.join(repoDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          paths: {
            "@elizaos/core": ["../packages/typescript/src/index.node.ts"],
            "@elizaos/core/*": ["../packages/typescript/src/*"],
          },
        },
      },
      null,
      2,
    ),
  );
}

async function writeEjectedCore(stateDir: string, withUpstream = true) {
  const monorepoDir = path.join(stateDir, "core", "eliza");
  const coreDir = path.join(monorepoDir, "packages", "core");
  const distDir = path.join(coreDir, "dist");

  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(
    path.join(coreDir, "package.json"),
    JSON.stringify({ name: "@elizaos/core", version: "2.0.0-alpha.99" }),
  );

  if (withUpstream) {
    await fs.mkdir(path.join(stateDir, "core"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "core", ".upstream.json"),
      JSON.stringify(
        {
          $schema: "milaidy-upstream-v1",
          source: "github:elizaos/eliza",
          gitUrl: "https://github.com/elizaos/eliza.git",
          branch: "develop",
          commitHash: "abc123",
          ejectedAt: "2026-02-01T00:00:00.000Z",
          npmPackage: "@elizaos/core",
          npmVersion: "2.0.0-alpha.10",
          lastSyncAt: null,
          localCommits: 0,
        },
        null,
        2,
      ),
    );
  }

  return monorepoDir;
}

let tmpDir = "";
let repoDir = "";

beforeEach(async () => {
  vi.clearAllMocks();
  originalCwd = process.cwd();

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "milady-core-eject-test-"));
  repoDir = path.join(tmpDir, "repo");
  mockedStateDir = path.join(tmpDir, "state");

  await fs.mkdir(repoDir, { recursive: true });
  await fs.mkdir(mockedStateDir, { recursive: true });
  await writeTsconfig(repoDir);

  process.chdir(repoDir);

  const { getPluginInfo } = await import("./registry-client");
  // biome-ignore lint/suspicious/noExplicitAny: mocking
  (getPluginInfo as any).mockResolvedValue({
    name: "@elizaos/core",
    npm: {
      package: "@elizaos/core",
      v0Version: null,
      v1Version: null,
      v2Version: "2.0.0-alpha.10",
    },
  } as never);

  setExecFileHandler(async () => ({ stdout: "" }));
});

afterEach(async () => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("core-eject", () => {
  describe("isWithinEjectedCoreDir", () => {
    it("returns true only for paths inside ejected core subdirectories", async () => {
      const { isWithinEjectedCoreDir } = await loadCoreEject();
      const base = path.join(mockedStateDir, "core");

      expect(isWithinEjectedCoreDir(path.join(base, "eliza"))).toBe(true);
      expect(isWithinEjectedCoreDir(base)).toBe(false);
      expect(isWithinEjectedCoreDir(path.join(base, "..", "outside"))).toBe(
        false,
      );
    });
  });

  describe("ejectCore", () => {
    it("ejects core, builds it, writes upstream metadata, and updates tsconfig", async () => {
      setExecFileHandler(async (file, args) => {
        if (file === "git" && args[0] === "clone") {
          const targetDir = args[args.length - 1];
          const coreDir = path.join(targetDir, "packages", "core");
          await fs.mkdir(path.join(coreDir, "dist"), { recursive: true });
          await fs.writeFile(
            path.join(coreDir, "package.json"),
            JSON.stringify({
              name: "@elizaos/core",
              version: "2.0.0-alpha.99",
            }),
          );
          return;
        }
        if (file === "git" && args.join(" ") === "rev-parse HEAD") {
          return { stdout: "head123\n" };
        }
      });

      const { ejectCore } = await loadCoreEject();
      const result = await ejectCore();

      expect(result.success).toBe(true);
      expect(result.upstreamCommit).toBe("head123");
      await expect(fs.access(result.ejectedPath)).resolves.toBeUndefined();

      const upstreamRaw = await fs.readFile(
        path.join(mockedStateDir, "core", ".upstream.json"),
        "utf-8",
      );
      const upstream = JSON.parse(upstreamRaw) as Record<string, unknown>;
      expect(upstream.$schema).toBe("milaidy-upstream-v1");
      expect(upstream.gitUrl).toBe("https://github.com/elizaos/eliza.git");
      expect(upstream.branch).toBe("develop");
      expect(upstream.commitHash).toBe("head123");

      const tsconfigRaw = await fs.readFile(
        path.join(repoDir, "tsconfig.json"),
        "utf-8",
      );
      const tsconfig = JSON.parse(tsconfigRaw) as {
        compilerOptions: { paths: Record<string, string[]> };
      };
      expect(tsconfig.compilerOptions.paths["@elizaos/core"][0]).toContain(
        "state/core/eliza/packages/core/dist",
      );
      expect(tsconfig.compilerOptions.paths["@elizaos/core/*"][0]).toContain(
        "state/core/eliza/packages/core/dist",
      );
    });

    it("returns already ejected when checkout exists", async () => {
      const monorepoDir = await writeEjectedCore(mockedStateDir);

      const { ejectCore } = await loadCoreEject();
      const result = await ejectCore();

      expect(result.success).toBe(false);
      expect(result.ejectedPath).toBe(monorepoDir);
      expect(result.error).toContain("already ejected");
      expect(
        execFile as unknown as ReturnType<typeof vi.fn>,
      ).not.toHaveBeenCalledWith(
        "git",
        expect.arrayContaining(["clone"]),
        expect.anything(),
        expect.anything(),
      );
    });

    it("serialises concurrent eject calls", async () => {
      let firstCloneFinished = false;
      let secondCloneStartedBeforeFirstFinished = false;
      let releaseFirstClone: (() => void) | null = null;
      const firstCloneGate = new Promise<void>((resolve) => {
        releaseFirstClone = resolve;
      });

      setExecFileHandler(async (file, args) => {
        if (file === "git" && args[0] === "clone") {
          const targetDir = args[args.length - 1];
          if (targetDir.includes("/eliza") && !firstCloneFinished) {
            await firstCloneGate;
            firstCloneFinished = true;
          } else if (!firstCloneFinished) {
            secondCloneStartedBeforeFirstFinished = true;
          }
          const coreDir = path.join(targetDir, "packages", "core");
          await fs.mkdir(path.join(coreDir, "dist"), { recursive: true });
          await fs.writeFile(
            path.join(coreDir, "package.json"),
            JSON.stringify({
              name: "@elizaos/core",
              version: "2.0.0-alpha.99",
            }),
          );
          return;
        }
        if (file === "git" && args.join(" ") === "rev-parse HEAD") {
          return { stdout: "head123\n" };
        }
      });

      const { ejectCore, reinjectCore } = await loadCoreEject();
      const first = ejectCore();
      const second = (async () => {
        await first;
        await reinjectCore();
        return await ejectCore();
      })();

      await new Promise((resolve) => setTimeout(resolve, 20));
      releaseFirstClone?.();

      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult.success).toBe(true);
      expect(secondResult.success).toBe(true);
      expect(secondCloneStartedBeforeFirstFinished).toBe(false);
    });
  });

  describe("syncCore", () => {
    it("returns error when core is not ejected", async () => {
      const { syncCore } = await loadCoreEject();
      const result = await syncCore();

      expect(result.success).toBe(false);
      expect(result.error).toContain("is not ejected");
    });

    it("syncs successfully and updates upstream metadata", async () => {
      const monorepoDir = await writeEjectedCore(mockedStateDir);

      setExecFileHandler(async (file, args, options) => {
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
          args.join(" ") === "rev-list --count HEAD..origin/develop"
        ) {
          return { stdout: "2\n" };
        }
        if (file === "git" && args[0] === "merge") return;
        if (file === "bun" && args.join(" ") === "install --ignore-scripts")
          return;
        if (
          file === "bun" &&
          args.join(" ") === "run --filter @elizaos/core build"
        )
          return;
        if (file === "git" && args.join(" ") === "rev-parse HEAD") {
          return { stdout: "newhead456\n" };
        }
        if (
          file === "git" &&
          args.join(" ") === "rev-list --count origin/develop..HEAD"
        ) {
          return { stdout: "1\n" };
        }
        if (options?.cwd !== monorepoDir && file !== "bun") {
          throw new Error("unexpected cwd");
        }
      });

      const { syncCore } = await loadCoreEject();
      const result = await syncCore();

      expect(result.success).toBe(true);
      expect(result.upstreamCommits).toBe(2);
      expect(result.localChanges).toBe(false);
      expect(result.commitHash).toBe("newhead456");

      const upstreamRaw = await fs.readFile(
        path.join(mockedStateDir, "core", ".upstream.json"),
        "utf-8",
      );
      const upstream = JSON.parse(upstreamRaw) as Record<string, unknown>;
      expect(upstream.$schema).toBe("milaidy-upstream-v1");
      expect(upstream.commitHash).toBe("newhead456");
      expect(upstream.localCommits).toBe(1);
      expect(typeof upstream.lastSyncAt).toBe("string");
    });

    it("reports merge conflicts", async () => {
      await writeEjectedCore(mockedStateDir);

      setExecFileHandler(async (file, args) => {
        if (
          file === "git" &&
          args.join(" ") === "rev-parse --is-shallow-repository"
        ) {
          return { stdout: "false\n" };
        }
        if (file === "git" && args[0] === "fetch") return;
        if (file === "git" && args.join(" ") === "status --porcelain") {
          return { stdout: " M packages/core/src/index.ts\n" };
        }
        if (
          file === "git" &&
          args.join(" ") === "rev-list --count HEAD..origin/develop"
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
          return { stdout: "packages/core/src/a.ts\npackages/core/src/b.ts\n" };
        }
      });

      const { syncCore } = await loadCoreEject();
      const result = await syncCore();

      expect(result.success).toBe(false);
      expect(result.localChanges).toBe(true);
      expect(result.upstreamCommits).toBe(1);
      expect(result.conflicts).toEqual([
        "packages/core/src/a.ts",
        "packages/core/src/b.ts",
      ]);
      expect(result.error).toContain("merge failed");
    });
  });

  describe("reinjectCore", () => {
    it("removes ejected core and restores default tsconfig paths", async () => {
      const monorepoDir = await writeEjectedCore(mockedStateDir);

      const tsconfigPath = path.join(repoDir, "tsconfig.json");
      const tsconfigRaw = await fs.readFile(tsconfigPath, "utf-8");
      const tsconfig = JSON.parse(tsconfigRaw) as {
        compilerOptions: { paths: Record<string, string[]> };
      };
      tsconfig.compilerOptions.paths["@elizaos/core"] = [
        "../tmp/ejected/core/dist",
      ];
      tsconfig.compilerOptions.paths["@elizaos/core/*"] = [
        "../tmp/ejected/core/dist/*",
      ];
      await fs.writeFile(
        tsconfigPath,
        `${JSON.stringify(tsconfig, null, 2)}\n`,
      );

      const { reinjectCore } = await loadCoreEject();
      const result = await reinjectCore();

      expect(result.success).toBe(true);
      expect(result.removedPath).toBe(monorepoDir);
      await expect(fs.access(monorepoDir)).rejects.toThrow();

      const restoredRaw = await fs.readFile(tsconfigPath, "utf-8");
      const restored = JSON.parse(restoredRaw) as {
        compilerOptions: { paths: Record<string, string[]> };
      };
      expect(restored.compilerOptions.paths["@elizaos/core"]).toEqual([
        "../packages/typescript/src/index.node.ts",
      ]);
      expect(restored.compilerOptions.paths["@elizaos/core/*"]).toEqual([
        "../packages/typescript/src/*",
      ]);
    });

    it("returns error when core is not ejected", async () => {
      const { reinjectCore } = await loadCoreEject();
      const result = await reinjectCore();

      expect(result.success).toBe(false);
      expect(result.error).toContain("is not ejected");
    });

    it("guards traversal-like paths with isWithinEjectedCoreDir", async () => {
      const { isWithinEjectedCoreDir } = await loadCoreEject();
      expect(
        isWithinEjectedCoreDir(
          path.join(mockedStateDir, "core", "..", "escape"),
        ),
      ).toBe(false);
    });
  });

  describe("getCoreStatus", () => {
    it("returns npm status when not ejected", async () => {
      const { getCoreStatus } = await loadCoreEject();
      const status = await getCoreStatus();

      expect(status.ejected).toBe(false);
      expect(status.version).toBe("2.0.0-alpha.10");
      expect(status.commitHash).toBeNull();
      expect(status.localChanges).toBe(false);
    });

    it("returns ejected status with version/commit/local changes", async () => {
      await writeEjectedCore(mockedStateDir);

      setExecFileHandler(async (file, args) => {
        if (file === "git" && args.join(" ") === "rev-parse HEAD") {
          return { stdout: "corehead987\n" };
        }
        if (file === "git" && args.join(" ") === "status --porcelain") {
          return { stdout: " M packages/core/src/runtime.ts\n" };
        }
      });

      const { getCoreStatus } = await loadCoreEject();
      const status = await getCoreStatus();

      expect(status.ejected).toBe(true);
      expect(status.version).toBe("2.0.0-alpha.99");
      expect(status.commitHash).toBe("corehead987");
      expect(status.localChanges).toBe(true);
      expect(status.upstream?.$schema).toBe("milaidy-upstream-v1");
    });
  });

  describe("postinstall script prevention (regression)", () => {
    it("every execFileAsync install call in core-eject.ts includes --ignore-scripts", async () => {
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const source = readFileSync(
        resolve(__dirname, "../services/core-eject.ts"),
        "utf-8",
      );
      const installCalls = [
        ...source.matchAll(/execFileAsync\([^)]*\[([^\]]*"install"[^\]]*)\]/gs),
      ];
      expect(installCalls.length).toBeGreaterThanOrEqual(1);
      for (const match of installCalls) {
        expect(match[0]).toContain("--ignore-scripts");
      }
    });
  });
});
