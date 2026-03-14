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
  applyExtensionlessJsExportAliases,
  applyMissingLifecycleScriptPatch,
  applyNobleHashesCompat,
  applyPatchToPackageJson,
  applyProperLockfileSignalExitCompat,
  findPackageFilePaths,
  findPackageJsonPaths,
  patchBunExports,
  patchExtensionlessJsExports,
  patchMissingLifecycleScript,
  patchNobleHashesCompat,
  patchProperLockfileSignalExitCompat,
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

  it("findPackageJsonPaths matches scoped packages in Bun cache", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const bunScoped = join(
        tmp,
        "node_modules",
        ".bun",
        "@noble+hashes@2.0.1",
        "node_modules",
        "@noble",
        "hashes",
      );
      mkdirSync(bunScoped, { recursive: true });
      writeFileSync(join(bunScoped, "package.json"), "{}", "utf8");

      const paths = findPackageJsonPaths(tmp, "@noble/hashes");
      expect(paths).toContain(join(bunScoped, "package.json"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("findPackageFilePaths locates arbitrary files in the Bun cache", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const lockfilePath = join(
        tmp,
        "node_modules",
        ".bun",
        "proper-lockfile@4.1.2",
        "node_modules",
        "proper-lockfile",
        "lib",
        "lockfile.js",
      );
      mkdirSync(join(lockfilePath, ".."), { recursive: true });
      writeFileSync(lockfilePath, "// test", "utf8");

      const paths = findPackageFilePaths(
        tmp,
        "proper-lockfile",
        "lib/lockfile.js",
      );
      expect(paths).toContain(lockfilePath);
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

  it("applyExtensionlessJsExportAliases adds extensionless aliases for .js subpaths", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@noble", "hashes");
      const pkgPath = join(pkgDir, "package.json");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: "@noble/hashes",
            exports: {
              ".": "./index.js",
              "./sha3.js": "./sha3.js",
              "./utils.js": "./utils.js",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const patched = applyExtensionlessJsExportAliases(pkgPath);
      expect(patched).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.exports["./sha3"]).toBe("./sha3.js");
      expect(updated.exports["./utils"]).toBe("./utils.js");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchExtensionlessJsExports patches package under root and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@noble", "hashes");
      const pkgPath = join(pkgDir, "package.json");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: "@noble/hashes",
            exports: {
              ".": "./index.js",
              "./sha3.js": "./sha3.js",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchExtensionlessJsExports(tmp, "@noble/hashes", (msg) =>
        logs.push(msg),
      );
      expect(patched).toBe(true);
      expect(logs.some((l) => l.includes("@noble/hashes"))).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.exports["./sha3"]).toBe("./sha3.js");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyNobleHashesCompat restores legacy ethers shims for @noble/hashes", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@noble", "hashes");
      const pkgPath = join(pkgDir, "package.json");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(join(pkgDir, "legacy.js"), "export const ripemd160 = 1;\n");
      writeFileSync(
        join(pkgDir, "sha2.js"),
        "export const sha256 = 1; export const sha512 = 2;\n",
      );
      writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: "@noble/hashes",
            version: "2.0.1",
            exports: {
              ".": "./index.js",
              "./sha3": "./sha3.js",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const patched = applyNobleHashesCompat(pkgPath);
      expect(patched).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.exports["./ripemd160"]).toBe("./ripemd160.js");
      expect(updated.exports["./ripemd160.js"]).toBe("./ripemd160.js");
      expect(updated.exports["./sha256"]).toBe("./sha256.js");
      expect(updated.exports["./sha512"]).toBe("./sha512.js");
      expect(readFileSync(join(pkgDir, "ripemd160.js"), "utf8")).toContain(
        'export { ripemd160 } from "./legacy.js";',
      );
      expect(readFileSync(join(pkgDir, "sha256.js"), "utf8")).toContain(
        'export { sha256 } from "./sha2.js";',
      );
      expect(readFileSync(join(pkgDir, "sha512.js"), "utf8")).toContain(
        'export { sha512 } from "./sha2.js";',
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchNobleHashesCompat patches package copies and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@noble", "hashes");
      const pkgPath = join(pkgDir, "package.json");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(join(pkgDir, "legacy.js"), "export const ripemd160 = 1;\n");
      writeFileSync(
        join(pkgDir, "sha2.js"),
        "export const sha256 = 1; export const sha512 = 2;\n",
      );
      writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: "@noble/hashes",
            version: "2.0.1",
            exports: {
              ".": "./index.js",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchNobleHashesCompat(tmp, (msg) => logs.push(msg));
      expect(patched).toBe(true);
      expect(logs.some((l) => l.includes("ethers-compatible"))).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.exports["./sha256"]).toBe("./sha256.js");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyMissingLifecycleScriptPatch removes broken postinstall hooks when the target file is missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@elizaos", "plugin-fake");
      const pkgPath = join(pkgDir, "package.json");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: "@elizaos/plugin-fake",
            scripts: {
              postinstall: "node ./scripts/missing-hook.mjs",
              build: "bun run build.ts",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const patched = applyMissingLifecycleScriptPatch(
        pkgPath,
        "postinstall",
        "./scripts/missing-hook.mjs",
      );
      expect(patched).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.scripts.postinstall).toBeUndefined();
      expect(updated.scripts.build).toBe("bun run build.ts");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchMissingLifecycleScript patches package copies and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const pkgDir = join(tmp, "node_modules", "@elizaos", "plugin-fake");
      const pkgPath = join(pkgDir, "package.json");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: "@elizaos/plugin-fake",
            scripts: {
              postinstall: "node ./scripts/missing-hook.mjs",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchMissingLifecycleScript(
        tmp,
        "@elizaos/plugin-fake",
        "postinstall",
        "./scripts/missing-hook.mjs",
        (msg) => logs.push(msg),
      );
      expect(patched).toBe(true);
      expect(logs.some((l) => l.includes("missing-hook.mjs"))).toBe(true);

      const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
      expect(updated.scripts).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyProperLockfileSignalExitCompat supports signal-exit v3 and v4 shapes", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "proper-lockfile",
        "lib",
        "lockfile.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        "const onExit = require('signal-exit');\nonExit(() => {});\n",
        "utf8",
      );

      const patched = applyProperLockfileSignalExitCompat(filePath);
      expect(patched).toBe(true);
      const updated = readFileSync(filePath, "utf8");
      expect(updated).toContain("const signalExit = require('signal-exit');");
      expect(updated).toContain(
        "const onExit = typeof signalExit === 'function' ? signalExit : signalExit.onExit;",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchProperLockfileSignalExitCompat patches discovered copies and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        ".bun",
        "proper-lockfile@4.1.2",
        "node_modules",
        "proper-lockfile",
        "lib",
        "lockfile.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        "const onExit = require('signal-exit');\nonExit(() => {});\n",
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchProperLockfileSignalExitCompat(tmp, (msg) =>
        logs.push(msg),
      );
      expect(patched).toBe(true);
      expect(logs.some((l) => l.includes("proper-lockfile"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
