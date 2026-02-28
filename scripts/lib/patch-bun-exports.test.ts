import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyPatchToPackageJson,
  findPackageJsonPaths,
  patchBunExports,
} from "./patch-bun-exports.mjs";

describe("patch-bun-exports", () => {
  it("applyPatchToPackageJson removes bun and default when src/index.ts is missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@elizaos", "plugin-fake");
      const pkgPath = join(pkgDir, "package.json");
      const pkg = {
        name: "@elizaos/plugin-fake",
        version: "1.0.0",
        exports: {
          ".": {
            bun: "./src/index.ts",
            default: "./src/index.ts",
            import: { default: "./dist/index.js" },
          },
        },
      };
      mkdirSync(join(pkgDir, "dist"), { recursive: true });
      writeFileSync(join(pkgDir, "dist", "index.js"), "// dummy", "utf8");
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8");

      const result = applyPatchToPackageJson(pkgPath);
      expect(result).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.exports["."].bun).toBeUndefined();
      expect(updated.exports["."].default).toBeUndefined();
      expect(updated.exports["."].import).toEqual({
        default: "./dist/index.js",
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyPatchToPackageJson does not patch when src/index.ts exists", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@elizaos", "plugin-fake");
      const pkgPath = join(pkgDir, "package.json");
      const pkg = {
        name: "@elizaos/plugin-fake",
        exports: {
          ".": {
            bun: "./src/index.ts",
            import: { default: "./dist/index.js" },
          },
        },
      };
      mkdirSync(join(pkgDir, "src"), { recursive: true });
      writeFileSync(join(pkgDir, "src", "index.ts"), "// exists", "utf8");
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8");

      const result = applyPatchToPackageJson(pkgPath);
      expect(result).toBe(false);

      const unchanged = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(unchanged.exports["."].bun).toBe("./src/index.ts");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("findPackageJsonPaths returns main path and uses replaceAll for safeName", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const scoped = join(
        tmp,
        "node_modules",
        "@elizaos",
        "plugin-coding-agent",
      );
      mkdirSync(scoped, { recursive: true });
      writeFileSync(join(scoped, "package.json"), "{}", "utf8");

      const paths = findPackageJsonPaths(tmp, "@elizaos/plugin-coding-agent");
      expect(paths).toContain(
        join(
          tmp,
          "node_modules",
          "@elizaos",
          "plugin-coding-agent",
          "package.json",
        ),
      );
      expect(paths.length).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchBunExports patches package under root and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@elizaos", "plugin-fake");
      const pkgPath = join(pkgDir, "package.json");
      const pkg = {
        name: "@elizaos/plugin-fake",
        exports: {
          ".": {
            bun: "./src/index.ts",
            import: { default: "./dist/index.js" },
          },
        },
      };
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8");

      const logs: string[] = [];
      const patched = patchBunExports(tmp, "@elizaos/plugin-fake", (msg) =>
        logs.push(msg),
      );
      expect(patched).toBe(true);
      expect(logs.some((l) => l.includes("plugin-fake"))).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.exports["."].bun).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
