/**
 * Tests for the self-updater service.
 *
 * Validates install method detection and update command generation
 * without actually running update commands.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process and fs before importing the module
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      realpathSync: vi.fn((p: string) => p),
      readFileSync: vi.fn(() => JSON.stringify({ devDependencies: {} })),
      existsSync: vi.fn(() => false),
    },
    realpathSync: vi.fn((p: string) => p),
    readFileSync: vi.fn(() => JSON.stringify({ devDependencies: {} })),
    existsSync: vi.fn(() => false),
  };
});

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createMockChildProcess } from "../test-support/process-helpers.js";
import type { InstallMethod } from "./self-updater.js";
import {
  buildUpdateCommand,
  detectInstallMethod,
  performUpdate,
} from "./self-updater.js";

// ============================================================================
// 1. Installation method detection
// ============================================================================

describe("detectInstallMethod", () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReset();
    vi.mocked(fs.realpathSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it("detects npm global install", () => {
    vi.mocked(execSync).mockReturnValueOnce(
      Buffer.from("/usr/local/bin/milaidy"),
    );
    vi.mocked(fs.realpathSync).mockReturnValueOnce(
      "/usr/local/lib/node_modules/milaidy/milaidy.mjs",
    );

    expect(detectInstallMethod()).toBe("npm-global");
  });

  it("detects bun global install", () => {
    vi.mocked(execSync).mockReturnValueOnce(
      Buffer.from("/home/user/.bun/bin/milaidy"),
    );
    vi.mocked(fs.realpathSync).mockReturnValueOnce(
      "/home/user/.bun/install/global/node_modules/milaidy/milaidy.mjs",
    );

    expect(detectInstallMethod()).toBe("bun-global");
  });

  it("detects Homebrew install", () => {
    vi.mocked(execSync).mockReturnValueOnce(
      Buffer.from("/opt/homebrew/bin/milaidy"),
    );
    vi.mocked(fs.realpathSync).mockReturnValueOnce(
      "/opt/homebrew/Cellar/milaidy/2.0.0/bin/milaidy",
    );

    expect(detectInstallMethod()).toBe("homebrew");
  });

  it("detects Snap install", () => {
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from("/snap/bin/milaidy"));
    vi.mocked(fs.realpathSync).mockReturnValueOnce(
      "/snap/milaidy/current/bin/milaidy",
    );

    expect(detectInstallMethod()).toBe("snap");
  });

  it("detects apt install", () => {
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from("/usr/bin/milaidy"));
    vi.mocked(fs.realpathSync).mockReturnValueOnce("/usr/bin/milaidy");

    expect(detectInstallMethod()).toBe("apt");
  });

  it("detects Flatpak install", () => {
    vi.mocked(execSync).mockReturnValueOnce(
      Buffer.from("/var/lib/flatpak/app/ai.milady.Milaidy/bin/milaidy"),
    );
    vi.mocked(fs.realpathSync).mockReturnValueOnce(
      "/var/lib/flatpak/app/ai.milady.Milaidy/bin/milaidy",
    );

    expect(detectInstallMethod()).toBe("flatpak");
  });

  it("detects pnpm global install", () => {
    vi.mocked(execSync).mockReturnValueOnce(
      Buffer.from("/home/user/.local/share/pnpm/milaidy"),
    );
    vi.mocked(fs.realpathSync).mockReturnValueOnce(
      "/home/user/.local/share/pnpm/global/5/node_modules/milaidy/milaidy.mjs",
    );

    expect(detectInstallMethod()).toBe("pnpm-global");
  });

  it("returns local-dev when running from source with devDependencies", () => {
    // which returns nothing (no global binary)
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    vi.mocked(fs.readFileSync).mockReturnValueOnce(
      JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
    );

    expect(detectInstallMethod()).toBe("local-dev");
  });

  it("returns unknown when no binary found and not local dev", () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("not found");
    });

    expect(detectInstallMethod()).toBe("unknown");
  });
});

// ============================================================================
// 2. buildUpdateCommand — tests the actual command generation
// ============================================================================

describe("buildUpdateCommand", () => {
  it("npm-global + stable → npm install -g milaidy@latest", () => {
    const result = buildUpdateCommand("npm-global", "stable");
    expect(result).not.toBeNull();
    expect(result?.command).toBe("npm");
    expect(result?.args).toEqual(["install", "-g", "milaidy@latest"]);
  });

  it("npm-global + beta → npm install -g milaidy@beta", () => {
    const result = buildUpdateCommand("npm-global", "beta");
    expect(result).not.toBeNull();
    expect(result?.command).toBe("npm");
    expect(result?.args).toEqual(["install", "-g", "milaidy@beta"]);
  });

  it("npm-global + nightly → npm install -g milaidy@nightly", () => {
    const result = buildUpdateCommand("npm-global", "nightly");
    expect(result).not.toBeNull();
    expect(result?.command).toBe("npm");
    expect(result?.args).toEqual(["install", "-g", "milaidy@nightly"]);
  });

  it("bun-global + stable → bun install -g milaidy@latest", () => {
    const result = buildUpdateCommand("bun-global", "stable");
    expect(result).not.toBeNull();
    expect(result?.command).toBe("bun");
    expect(result?.args).toEqual(["install", "-g", "milaidy@latest"]);
  });

  it("pnpm-global + beta → pnpm add -g milaidy@beta", () => {
    const result = buildUpdateCommand("pnpm-global", "beta");
    expect(result).not.toBeNull();
    expect(result?.command).toBe("pnpm");
    expect(result?.args).toEqual(["add", "-g", "milaidy@beta"]);
  });

  it("homebrew → brew upgrade milaidy (ignores channel)", () => {
    const result = buildUpdateCommand("homebrew", "stable");
    expect(result).not.toBeNull();
    expect(result?.command).toBe("brew");
    expect(result?.args).toEqual(["upgrade", "milaidy"]);
  });

  it("homebrew produces identical command regardless of channel", () => {
    const stable = buildUpdateCommand("homebrew", "stable");
    const beta = buildUpdateCommand("homebrew", "beta");
    const nightly = buildUpdateCommand("homebrew", "nightly");

    // Homebrew doesn't support dist-tags, so all channels produce the same command
    expect(stable).toEqual(beta);
    expect(beta).toEqual(nightly);
  });

  it("snap + nightly → snap refresh with --channel=edge", () => {
    const result = buildUpdateCommand("snap", "nightly");
    expect(result).not.toBeNull();
    expect(result?.command).toBe("sudo");
    expect(result?.args).toContain("--channel=edge");
  });

  it("snap + beta → snap refresh with --channel=beta", () => {
    const result = buildUpdateCommand("snap", "beta");
    expect(result).not.toBeNull();
    expect(result?.args).toContain("--channel=beta");
  });

  it("snap + stable → snap refresh with --channel=stable", () => {
    const result = buildUpdateCommand("snap", "stable");
    expect(result).not.toBeNull();
    expect(result?.args).toContain("--channel=stable");
  });

  it("apt → sudo apt-get update && install (as shell string)", () => {
    const result = buildUpdateCommand("apt", "stable");
    expect(result).not.toBeNull();
    expect(result?.command).toBe("sh");
    expect(result?.args[0]).toBe("-c");
    // The actual command is a single shell string
    expect(result?.args[1]).toContain("apt-get update");
    expect(result?.args[1]).toContain("apt-get install");
    expect(result?.args[1]).toContain("milaidy");
  });

  it("flatpak → flatpak update ai.milady.Milaidy", () => {
    const result = buildUpdateCommand("flatpak", "stable");
    expect(result).not.toBeNull();
    expect(result?.command).toBe("flatpak");
    expect(result?.args).toEqual(["update", "ai.milady.Milaidy"]);
  });

  it("local-dev → null (cannot auto-update)", () => {
    const result = buildUpdateCommand("local-dev", "stable");
    expect(result).toBeNull();
  });

  it("unknown → falls back to npm install -g", () => {
    const result = buildUpdateCommand("unknown", "stable");
    expect(result).not.toBeNull();
    expect(result?.command).toBe("npm");
    expect(result?.args).toContain("milaidy@latest");
  });
});

// ============================================================================
// 3. performUpdate — tests the actual update execution with mocked child_process
// ============================================================================

describe("performUpdate", () => {
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(execSync).mockReset();
    vi.mocked(spawn).mockReset();
    vi.mocked(fs.realpathSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
    // performUpdate streams child stderr to process.stderr; silence that stream
    // in tests so mocked failure-path output does not pollute test logs.
    stderrWriteSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stderrWriteSpy.mockRestore();
  });

  it("returns error for local-dev installs without spawning", async () => {
    // detectInstallMethod returns local-dev when which fails and devDependencies exist
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.startsWith("which")) {
        throw new Error("not found");
      }
      throw new Error("unexpected call");
    });
    vi.mocked(fs.readFileSync).mockReturnValueOnce(
      JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }),
    );

    const result = await performUpdate("2.0.0-alpha.7", "stable");

    expect(result.success).toBe(false);
    expect(result.method).toBe("local-dev");
    expect(result.error).toContain("git pull");
    // spawn should NOT have been called
    expect(spawn).not.toHaveBeenCalled();
  });

  it("reports failure when update command exits non-zero", async () => {
    // detectInstallMethod returns npm-global
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.startsWith("which")) {
        return Buffer.from("/usr/local/bin/milaidy");
      }
      throw new Error("unexpected");
    });
    vi.mocked(fs.realpathSync).mockReturnValueOnce(
      "/usr/local/lib/node_modules/milaidy/milaidy.mjs",
    );

    // Simulate npm install failing
    vi.mocked(spawn).mockReturnValueOnce(
      createMockChildProcess({
        exitCode: 1,
        stderrOutput: "npm ERR! code E403\nnpm ERR! 403 Forbidden",
      }),
    );

    const result = await performUpdate("2.0.0-alpha.7", "stable");

    expect(result.success).toBe(false);
    expect(result.method).toBe("npm-global");
    expect(result.command).toContain("npm install -g milaidy@latest");
    expect(result.error).toContain("E403");
  });

  it("reports success and captures new version on exit 0", async () => {
    // detectInstallMethod returns npm-global
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.startsWith("which")) {
        return Buffer.from("/usr/local/bin/milaidy");
      }
      // readPostUpdateVersion calls: milaidy --version
      if (typeof cmd === "string" && cmd.includes("--version")) {
        return Buffer.from("2.1.0\n");
      }
      throw new Error(`unexpected execSync call: ${cmd}`);
    });
    vi.mocked(fs.realpathSync).mockReturnValueOnce(
      "/usr/local/lib/node_modules/milaidy/milaidy.mjs",
    );

    // Simulate npm install succeeding
    vi.mocked(spawn).mockReturnValueOnce(
      createMockChildProcess({ exitCode: 0 }),
    );

    const result = await performUpdate("2.0.0-alpha.7", "stable");

    expect(result.success).toBe(true);
    expect(result.method).toBe("npm-global");
    expect(result.previousVersion).toBe("2.0.0-alpha.7");
    expect(result.newVersion).toBe("2.1.0");
    expect(result.error).toBeNull();
  });
});

// ============================================================================
// 4. Edge cases in detectInstallMethod and performUpdate
// ============================================================================

describe("detectInstallMethod edge cases", () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReset();
    vi.mocked(fs.realpathSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it("falls back to raw which path when realpathSync throws", () => {
    // which succeeds but realpathSync throws (e.g., broken symlink)
    vi.mocked(execSync).mockReturnValueOnce(
      Buffer.from("/opt/homebrew/bin/milaidy"),
    );
    vi.mocked(fs.realpathSync).mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    // Should still detect homebrew from the raw which output
    expect(detectInstallMethod()).toBe("homebrew");
  });

  it("detects Homebrew via /homebrew/ path (not /Cellar/)", () => {
    vi.mocked(execSync).mockReturnValueOnce(
      Buffer.from("/opt/homebrew/bin/milaidy"),
    );
    vi.mocked(fs.realpathSync).mockReturnValueOnce("/opt/homebrew/bin/milaidy");

    expect(detectInstallMethod()).toBe("homebrew");
  });

  it("returns unknown when binary is in an unrecognized location", () => {
    vi.mocked(execSync).mockReturnValueOnce(Buffer.from("/opt/custom/milaidy"));
    vi.mocked(fs.realpathSync).mockReturnValueOnce("/opt/custom/milaidy");

    expect(detectInstallMethod()).toBe("unknown");
  });
});

describe("performUpdate edge cases", () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReset();
    vi.mocked(spawn).mockReset();
    vi.mocked(fs.realpathSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it("uses pre-provided method instead of detecting", async () => {
    // When method is provided, detectInstallMethod is NOT called
    // so we don't need to mock which/realpathSync at all
    vi.mocked(spawn).mockReturnValueOnce(
      createMockChildProcess({ exitCode: 0 }),
    );
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.includes("--version")) {
        return Buffer.from("2.1.0\n");
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    const result = await performUpdate("2.0.0", "beta", "bun-global");

    expect(result.success).toBe(true);
    expect(result.method).toBe("bun-global");
    expect(result.command).toContain("bun install -g milaidy@beta");
  });

  it("handles spawn error event (command not found)", async () => {
    vi.mocked(spawn).mockReturnValueOnce(
      createMockChildProcess({
        exitCode: 1,
        emitError: new Error("spawn npm ENOENT"),
      }),
    );

    const result = await performUpdate("2.0.0", "stable", "npm-global");

    expect(result.success).toBe(false);
    expect(result.error).toContain("spawn npm ENOENT");
  });

  it("parses pre-release version from readPostUpdateVersion", async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.includes("--version")) {
        return Buffer.from("2.1.0-beta.3\n");
      }
      throw new Error(`unexpected: ${cmd}`);
    });
    vi.mocked(spawn).mockReturnValueOnce(
      createMockChildProcess({ exitCode: 0 }),
    );

    const result = await performUpdate("2.0.0", "beta", "npm-global");

    expect(result.success).toBe(true);
    expect(result.newVersion).toBe("2.1.0-beta.3");
  });

  it("parses version from prefixed output like 'milaidy/2.1.0'", async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.includes("--version")) {
        return Buffer.from("milaidy/2.1.0\n");
      }
      throw new Error(`unexpected: ${cmd}`);
    });
    vi.mocked(spawn).mockReturnValueOnce(
      createMockChildProcess({ exitCode: 0 }),
    );

    const result = await performUpdate("2.0.0", "stable", "npm-global");

    expect(result.success).toBe(true);
    expect(result.newVersion).toBe("2.1.0");
  });

  it("returns null newVersion when --version output is garbage", async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.includes("--version")) {
        return Buffer.from("ERROR: something went wrong\n");
      }
      throw new Error(`unexpected: ${cmd}`);
    });
    vi.mocked(spawn).mockReturnValueOnce(
      createMockChildProcess({ exitCode: 0 }),
    );

    const result = await performUpdate("2.0.0", "stable", "npm-global");

    expect(result.success).toBe(true);
    expect(result.newVersion).toBeNull(); // Couldn't parse version
  });

  it("returns null newVersion when --version command throws", async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.includes("--version")) {
        throw new Error("command not found");
      }
      throw new Error(`unexpected: ${cmd}`);
    });
    vi.mocked(spawn).mockReturnValueOnce(
      createMockChildProcess({ exitCode: 0 }),
    );

    const result = await performUpdate("2.0.0", "stable", "npm-global");

    expect(result.success).toBe(true);
    expect(result.newVersion).toBeNull();
  });

  it("reports exit code in error message when stderr is empty", async () => {
    vi.mocked(spawn).mockReturnValueOnce(
      createMockChildProcess({ exitCode: 127 }),
    ); // no stderr

    const result = await performUpdate("2.0.0", "stable", "npm-global");

    expect(result.success).toBe(false);
    expect(result.error).toContain("127");
  });
});

// ============================================================================
// 5. Install method type exhaustiveness
// ============================================================================

describe("InstallMethod type", () => {
  it("covers all known installation methods", () => {
    const methods: InstallMethod[] = [
      "npm-global",
      "bun-global",
      "pnpm-global",
      "homebrew",
      "snap",
      "apt",
      "flatpak",
      "local-dev",
      "unknown",
    ];

    // Verify all methods are distinct
    const unique = new Set(methods);
    expect(unique.size).toBe(methods.length);

    // Verify each method generates a command (except local-dev)
    for (const method of methods) {
      const cmd = buildUpdateCommand(method, "stable");
      if (method === "local-dev") {
        expect(cmd).toBeNull();
      } else {
        expect(cmd).not.toBeNull();
        expect(cmd?.command).toBeTruthy();
        expect(cmd?.args.length).toBeGreaterThan(0);
      }
    }
  });
});
