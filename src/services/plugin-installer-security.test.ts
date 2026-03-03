import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Plugin installer security tests.
 *
 * Verify that npm/bun install commands include --ignore-scripts
 * to prevent postinstall lifecycle scripts from executing arbitrary
 * code on the host.
 *
 * These tests read the source file directly so they break if someone
 * removes --ignore-scripts — that is intentional.
 */

const INSTALLER_PATH = resolve(__dirname, "../services/plugin-installer.ts");
const source = readFileSync(INSTALLER_PATH, "utf-8");

describe("plugin-installer — postinstall script prevention", () => {
  /* ── Core install commands must use --ignore-scripts ──────────── */

  describe("runInstallSpec must pass --ignore-scripts", () => {
    it("bun add includes --ignore-scripts", () => {
      // Match the bun execFileAsync call inside runInstallSpec
      const bunPattern =
        /execFileAsync\(\s*"bun"\s*,\s*\[.*?"--ignore-scripts".*?\]/s;
      expect(bunPattern.test(source)).toBe(true);
    });

    it("npm install includes --ignore-scripts", () => {
      // Match the npm execFileAsync call inside runInstallSpec
      const npmPattern =
        /execFileAsync\(\s*"npm"\s*,\s*\[.*?"--ignore-scripts".*?\]/s;
      expect(npmPattern.test(source)).toBe(true);
    });
  });

  /* ── Git clone path must also use --ignore-scripts ───────────── */

  describe("gitCloneInstall post-clone install must use --ignore-scripts", () => {
    it("pm install after git clone includes --ignore-scripts", () => {
      // The git clone path runs: execFileAsync(pm, ["install", "--ignore-scripts"], ...)
      const gitCloneInstallPattern =
        /execFileAsync\(\s*pm\s*,\s*\[\s*"install"\s*,\s*"--ignore-scripts"\s*\]/;
      expect(gitCloneInstallPattern.test(source)).toBe(true);
    });
  });

  /* ── No unprotected install calls ────────────────────────────── */

  describe("no install/add calls without --ignore-scripts", () => {
    it("every execFileAsync install/add call has --ignore-scripts", () => {
      // Find all execFileAsync calls containing "install" or "add" in args
      const allInstallCalls = [
        ...source.matchAll(
          /execFileAsync\([^)]*\[([^\]]*(?:"install"|"add")[^\]]*)\]/gs,
        ),
      ];

      // Filter to only npm/bun install calls (skip "npm --version" etc.)
      const packageInstalls = allInstallCalls.filter((m) => {
        const args = m[1];
        return args.includes('"install"') || args.includes('"add"');
      });

      expect(packageInstalls.length).toBeGreaterThanOrEqual(3);

      for (const match of packageInstalls) {
        expect(
          match[0],
          `Found install/add call without --ignore-scripts: ${match[0].slice(0, 80)}...`,
        ).toContain("--ignore-scripts");
      }
    });
  });

  /* ── Input validation exports exist ──────────────────────────── */

  describe("input validation functions are present", () => {
    it("exports VALID_PACKAGE_NAME regex", () => {
      expect(source).toContain("export const VALID_PACKAGE_NAME");
    });

    it("exports assertValidPackageName", () => {
      expect(source).toContain("export function assertValidPackageName");
    });

    it("exports VALID_GIT_URL regex", () => {
      expect(source).toContain("export const VALID_GIT_URL");
    });

    it("exports assertValidGitUrl", () => {
      expect(source).toContain("export function assertValidGitUrl");
    });
  });

  /* ── Security comment is present ─────────────────────────────── */

  it("contains security documentation for --ignore-scripts", () => {
    expect(source).toContain(
      "SECURITY: --ignore-scripts prevents npm postinstall",
    );
  });
});
