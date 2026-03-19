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
  applyAgentSkillsCatalogFetchPatch,
  applyAppCoreCloudLoginPopupPatch,
  applyAppCoreMiladyCharacterViewPatch,
  applyAppCoreMiladyIdentityStepPatch,
  applyAppCoreMiladyVrmStatePatch,
  applyAppCoreMiladyVrmTypesPatch,
  applyAppCoreMiladyVrmViewerPatch,
  applyAppCoreOnboardingConnectionStepPatch,
  applyAppCoreVoiceConfigApiKeyPersistencePatch,
  applyAppCoreVoiceConfigSelectionVisibilityPatch,
  applyAppCoreVoiceConfigViewLiveTestPatch,
  applyAppCoreVoiceConfigViewSaveUxPatch,
  applyAppCoreVoiceTypesPresetsPatch,
  applyAutonomousMiladyOnboardingPresetsPatch,
  applyExtensionlessJsExportAliases,
  applyMissingLifecycleScriptPatch,
  applyNobleHashesCompat,
  applyPatchToPackageJson,
  applyProperLockfileSignalExitCompat,
  findPackageFilePaths,
  findPackageJsonPaths,
  patchAgentSkillsCatalogFetch,
  patchAppCoreMiladyAssets,
  patchAutonomousMiladyOnboardingPresets,
  patchBrokenElizaCoreRuntimeDists,
  patchBunExports,
  patchExtensionlessJsExports,
  patchMissingLifecycleScript,
  patchNobleHashesCompat,
  patchProperLockfileSignalExitCompat,
  repairElizaCoreRuntimeDist,
} from "./patch-bun-exports.mjs";

const MOCK_MILADY_CATALOG = {
  assets: [
    { id: 1, slug: "milady-1", title: "Chen", sourceName: "Chen" },
    { id: 2, slug: "milady-2", title: "Jin", sourceName: "Jin" },
    { id: 3, slug: "milady-3", title: "Kei", sourceName: "Kei" },
    { id: 4, slug: "milady-4", title: "Momo", sourceName: "Momo" },
  ],
  injectedCharacters: [
    {
      catchphrase: "I'm ready to assist.",
      name: "Rin",
      avatarAssetId: 1,
      voicePresetId: "alice",
      avatarAsset: {
        id: 1,
        slug: "milady-1",
        title: "Chen",
        sourceName: "Chen",
      },
    },
    {
      catchphrase: "I'm here to help you.",
      name: "Ai",
      avatarAssetId: 2,
      voicePresetId: "sarah",
      avatarAsset: {
        id: 2,
        slug: "milady-2",
        title: "Jin",
        sourceName: "Jin",
      },
    },
  ],
};

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

  it("repairElizaCoreRuntimeDist copies runtime dist into a broken cached core package", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const sourcePkgDir = join(tmp, "node_modules", "@elizaos", "core");
      const brokenPkgDir = join(
        tmp,
        "node_modules",
        ".bun",
        "@elizaos+core@2.0.0-alpha.21",
        "node_modules",
        "@elizaos",
        "core",
      );

      mkdirSync(join(sourcePkgDir, "dist", "node"), { recursive: true });
      mkdirSync(join(sourcePkgDir, "dist", "browser"), { recursive: true });
      writeFileSync(join(sourcePkgDir, "dist", "index.js"), "// root", "utf8");
      writeFileSync(
        join(sourcePkgDir, "dist", "node", "index.node.js"),
        "// node",
        "utf8",
      );
      writeFileSync(
        join(sourcePkgDir, "dist", "browser", "index.browser.js"),
        "// browser",
        "utf8",
      );

      mkdirSync(join(brokenPkgDir, "dist", "testing"), { recursive: true });
      writeFileSync(
        join(brokenPkgDir, "dist", "testing", "index.js"),
        "// only testing",
        "utf8",
      );

      const patched = repairElizaCoreRuntimeDist(brokenPkgDir, sourcePkgDir);
      expect(patched).toBe(true);
      expect(readFileSync(join(brokenPkgDir, "dist", "index.js"), "utf8")).toBe(
        "// root",
      );
      expect(
        readFileSync(
          join(brokenPkgDir, "dist", "node", "index.node.js"),
          "utf8",
        ),
      ).toBe("// node");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchBrokenElizaCoreRuntimeDists repairs broken Bun cache copies from the root install", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const rootPkgDir = join(tmp, "node_modules", "@elizaos", "core");
      const brokenPkgDir = join(
        tmp,
        "node_modules",
        ".bun",
        "@elizaos+core@2.0.0-alpha.13",
        "node_modules",
        "@elizaos",
        "core",
      );

      mkdirSync(join(rootPkgDir, "dist", "node"), { recursive: true });
      mkdirSync(join(rootPkgDir, "dist", "browser"), { recursive: true });
      writeFileSync(join(rootPkgDir, "package.json"), "{}", "utf8");
      writeFileSync(join(rootPkgDir, "dist", "index.js"), "// root", "utf8");
      writeFileSync(
        join(rootPkgDir, "dist", "node", "index.node.js"),
        "// node",
        "utf8",
      );
      writeFileSync(
        join(rootPkgDir, "dist", "browser", "index.browser.js"),
        "// browser",
        "utf8",
      );

      mkdirSync(join(brokenPkgDir, "dist", "testing"), { recursive: true });
      writeFileSync(join(brokenPkgDir, "package.json"), "{}", "utf8");
      writeFileSync(
        join(brokenPkgDir, "dist", "testing", "index.js"),
        "// only testing",
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchBrokenElizaCoreRuntimeDists(tmp, (msg) =>
        logs.push(msg),
      );

      expect(patched).toBe(true);
      expect(logs.some((line) => line.includes("Repaired @elizaos/core"))).toBe(
        true,
      );
      expect(
        readFileSync(
          join(brokenPkgDir, "dist", "node", "index.node.js"),
          "utf8",
        ),
      ).toBe("// node");
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

  it("applyAppCoreMiladyVrmStatePatch rewrites the bundled avatar roster from the catalog", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "app-core",
        "state",
        "vrm.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(filePath, "// upstream", "utf8");

      const patched = applyAppCoreMiladyVrmStatePatch(
        filePath,
        MOCK_MILADY_CATALOG,
      );
      expect(patched).toBe(true);

      const updated = readFileSync(filePath, "utf8");
      expect(updated).toContain(
        "Generated from apps/app/characters/catalog.json",
      );
      expect(updated).toContain('title: "Chen"');
      expect(updated).toContain('title: "Momo"');
      expect(updated).toContain(
        'vrmPath: resolveAppAssetUrl("vrms/milady-1.vrm.gz")',
      );
      expect(updated).toContain(
        'previewPath: resolveAppAssetUrl("vrms/previews/milady-2.png")',
      );
      expect(updated).toContain(
        'backgroundPath: resolveAppAssetUrl("vrms/backgrounds/milady-4.png")',
      );
      expect(updated).toContain(
        "export const VRM_COUNT = BUNDLED_VRM_ASSETS.length;",
      );
      expect(updated).toContain("return resolveBundledVrmAsset(index).title;");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyAppCoreMiladyVrmTypesPatch expands the declared roster size", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "app-core",
        "state",
        "vrm.d.ts",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(filePath, "export declare const VRM_COUNT = 4;\n", "utf8");

      const patched = applyAppCoreMiladyVrmTypesPatch(
        filePath,
        MOCK_MILADY_CATALOG,
      );
      expect(patched).toBe(true);
      expect(readFileSync(filePath, "utf8")).toContain(
        "export declare const VRM_COUNT = 4;",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyAppCoreMiladyVrmViewerPatch repoints the default fallback avatar", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "app-core",
        "components",
        "avatar",
        "VrmViewer.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        'const DEFAULT_VRM_PATH = resolveAppAssetUrl("vrms/eliza-1.vrm.gz");\n',
        "utf8",
      );

      const patched = applyAppCoreMiladyVrmViewerPatch(
        filePath,
        MOCK_MILADY_CATALOG,
      );
      expect(patched).toBe(true);
      expect(readFileSync(filePath, "utf8")).toContain(
        'const DEFAULT_VRM_PATH = resolveAppAssetUrl("vrms/milady-1.vrm.gz");',
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyAppCoreMiladyIdentityStepPatch rewrites injected onboarding characters from the catalog", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "app-core",
        "components",
        "onboarding",
        "IdentityStep.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        `const IDENTITY_PRESETS = {
    "I'm ready to assist.": { name: "Rin", avatarIndex: 1 },
    "I'm here to help you.": { name: "Ai", avatarIndex: 2 },
};
styles.slice(0, 4);
`,
        "utf8",
      );

      const patched = applyAppCoreMiladyIdentityStepPatch(
        filePath,
        MOCK_MILADY_CATALOG,
      );
      expect(patched).toBe(true);
      const updated = readFileSync(filePath, "utf8");
      expect(updated).toContain(
        '"I\'m ready to assist.": { name: "Rin", avatarIndex: 1 }',
      );
      expect(updated).toContain(
        '"I\'m here to help you.": { name: "Ai", avatarIndex: 2 }',
      );
      expect(updated).toContain("styles.slice(0, 2);");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyAppCoreMiladyCharacterViewPatch rewrites injected roster metadata from the catalog", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "app-core",
        "components",
        "CharacterView.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        `const CHARACTER_PRESET_META = {
    "I'm ready to assist.": { name: "Rin", avatarIndex: 1, voicePresetId: "alice" },
};
const visibleCharacterRoster = characterRoster.slice(0, 4);
const avatarIndex = meta?.avatarIndex ?? (index % 4) + 1;
`,
        "utf8",
      );

      const patched = applyAppCoreMiladyCharacterViewPatch(
        filePath,
        MOCK_MILADY_CATALOG,
      );
      expect(patched).toBe(true);
      const updated = readFileSync(filePath, "utf8");
      expect(updated).toContain(
        '"I\'m here to help you.": { name: "Ai", avatarIndex: 2, voicePresetId: "sarah" }',
      );
      expect(updated).toContain("characterRoster.slice(0, 2)");
      expect(updated).toContain("(index % 4) + 1");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyAppCoreOnboardingConnectionStepPatch interpolates appName in hosting question", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "app-core",
        "components",
        "onboarding",
        "ConnectionStep.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        'const node = t("onboarding.hostingQuestion");\n',
        "utf8",
      );

      const patched = applyAppCoreOnboardingConnectionStepPatch(filePath);
      expect(patched).toBe(true);
      const updated = readFileSync(filePath, "utf8");
      expect(updated).toContain(
        't("onboarding.hostingQuestion", { appName: branding.appName ?? "Eliza" })',
      );
      expect(updated).toContain(
        '.replace("{{appName}}", branding.appName ?? "Eliza")',
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyAppCoreCloudLoginPopupPatch preopens popup before async cloud login", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "app-core",
        "state",
        "AppContext.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        `setElizaCloudLoginError(null);
            if (!resp.ok) {
                setElizaCloudLoginError(resp.error || "Failed to start Eliza Cloud login");
                elizaCloudLoginBusyRef.current = false;
                setElizaCloudLoginBusy(false);
                return;
            }
            if (resp.browserUrl) {
                try {
                    await openExternalUrl(resp.browserUrl);
                }
                catch {
                    // Popup was blocked (common when window.open runs after an async
                    // gap and loses user-gesture context). Surface the URL so the user
                    // can open it manually — the polling loop below still runs.
                    setElizaCloudLoginError(\`Open this link to log in: \${resp.browserUrl}\`);
                }
            }
`,
        "utf8",
      );

      const patched = applyAppCoreCloudLoginPopupPatch(filePath);
      expect(patched).toBe(true);
      const updated = readFileSync(filePath, "utf8");
      expect(updated).toContain("let preopenedLoginPopup = null;");
      expect(updated).toContain(
        'window.open("", "_blank", "noopener,noreferrer")',
      );
      expect(updated).toContain(
        "if (preopenedLoginPopup && !preopenedLoginPopup.closed)",
      );
      expect(updated).toContain(
        "preopenedLoginPopup.location.href = resp.browserUrl;",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyAppCoreVoiceConfigViewSaveUxPatch adds inline save button and status", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "app-core",
        "components",
        "VoiceConfigView.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        `const selectedVoiceId = voiceConfig.elevenlabs?.voiceId;
    const selectedPreset = PREMADE_VOICES.find((p) => p.voiceId === selectedVoiceId);
    return (_jsxs("div", { children: [currentMode === "own-key" && (_jsxs("div", { className: "flex flex-col gap-1.5", children: [_jsx("span", { className: "text-xs font-semibold", children: t("voiceconfigview.ElevenLabsAPIKey") }), _jsx(Input, { type: "password", className: "bg-card text-xs", placeholder: voiceConfig.elevenlabs?.apiKey
                                    ? t("mediasettingssection.ApiKeySetLeaveBlank")
                                    : t("mediasettingssection.EnterApiKey"), onChange: (e) => handleApiKeyChange(e.target.value) }), _jsxs("div", { className: "text-[10px] text-[var(--muted)]", children: [t("voiceconfigview.GetYourKeyAt"), " ", _jsx("a", { href: "https://elevenlabs.io", target: "_blank", rel: "noopener noreferrer", className: "text-[var(--text)] underline decoration-[var(--accent)] underline-offset-2 hover:opacity-80", children: t("voiceconfigview.elevenlabsIo") })] }), _jsxs("div", { className: "text-[10px] text-[var(--muted)]", children: [t("voiceconfigview.FastPathDefaultE"), DEFAULT_ELEVEN_FAST_MODEL, "\`)."] })] }))] }));
`,
        "utf8",
      );

      const patched = applyAppCoreVoiceConfigViewSaveUxPatch(filePath);
      expect(patched).toBe(true);
      const updated = readFileSync(filePath, "utf8");
      expect(updated).toContain("const inlineSaveStatusText = saving");
      expect(updated).toContain("Save Voice Settings");
      expect(updated).toContain("disabled: saving || !dirty");
      expect(updated).toContain("inlineSaveStatusTone");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyAppCoreVoiceConfigViewLiveTestPatch switches test playback to ElevenLabs proxy", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "app-core",
        "components",
        "VoiceConfigView.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        `const [testing, setTesting] = useState(false);
const selectedVoiceId = voiceConfig.elevenlabs?.voiceId;
const handleTestVoice = useCallback((previewUrl) => {
    if (audioRef.current) {
        audioRef.current.pause();
    }
    setTesting(true);
    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    audio.onended = () => setTesting(false);
    audio.onerror = () => setTesting(false);
    audio.play().catch(() => setTesting(false));
}, []);
return (_jsxs("div", { children: [selectedPreset && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { variant: "outline", size: "sm", className: "font-semibold", disabled: testing, onClick: () => handleTestVoice(selectedPreset.previewUrl), children: testing
                                ? t("voiceconfigview.Playing")
                                : t("voiceconfigview.TestVoice", {
                                    name: selectedPreset.name,
                                }) }), testing && (_jsx(Button, { variant: "outline", size: "sm", onClick: () => {
                                if (audioRef.current) {
                                    audioRef.current.pause();
                                    setTesting(false);
                                }
                            }, children: t("voiceconfigview.Stop") }))] })), _jsx(WakeWordSection, { serverConfig: swabbleServerConfig })] }));
`,
        "utf8",
      );

      const patched = applyAppCoreVoiceConfigViewLiveTestPatch(filePath);
      expect(patched).toBe(true);
      const updated = readFileSync(filePath, "utf8");
      expect(updated).toContain('fetch("/api/tts/elevenlabs"');
      expect(updated).toContain("setTestError(");
      expect(updated).toContain("onClick: () => void handleTestVoice()");
      expect(updated).toContain('className: "text-[10px] text-[var(--warn)]"');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyAppCoreVoiceConfigApiKeyPersistencePatch keeps raw API keys", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "app-core",
        "components",
        "VoiceConfigView.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        `const sanitizedKey = sanitizeApiKey(normalizedElevenLabs?.apiKey);
            if (normalizedElevenLabs) {
                if (sanitizedKey)
                    normalizedElevenLabs.apiKey = sanitizedKey;
                else
                    delete normalizedElevenLabs.apiKey;
            }
`,
        "utf8",
      );

      const patched = applyAppCoreVoiceConfigApiKeyPersistencePatch(filePath);
      expect(patched).toBe(true);
      const updated = readFileSync(filePath, "utf8");
      expect(updated).toContain("const resolvedApiKey =");
      expect(updated).toContain('resolvedApiKey !== "[REDACTED]"');
      expect(updated).not.toContain(
        "sanitizeApiKey(normalizedElevenLabs?.apiKey)",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyAppCoreVoiceTypesPresetsPatch replaces default voice roster with provided named voices", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "app-core",
        "voice",
        "types.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        `export const PREMADE_VOICES = [
    { id: "rachel", name: "Rachel", voiceId: "21m00Tcm4TlvDq8ikWAM", gender: "female", hint: "Calm, clear", previewUrl: "https://example.com/rachel.mp3" },
];
export const VOICE_PROVIDERS = [{ id: "elevenlabs" }];
`,
        "utf8",
      );

      const patched = applyAppCoreVoiceTypesPresetsPatch(filePath);
      expect(patched).toBe(true);
      const updated = readFileSync(filePath, "utf8");
      expect(updated).toContain('name: "Yun - Elegant, Sweet and Gentle"');
      expect(updated).toContain(
        'name: "Aerisita - Bubbly, Feminine and Outgoing"',
      );
      expect(updated).toContain('voiceId: "IRHApOXLvnW57QJPQH2P"');
      expect(updated).toContain("export const VOICE_PROVIDERS =");
      expect(updated).not.toContain('name: "Rachel"');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyAppCoreVoiceConfigSelectionVisibilityPatch keeps active voice readable", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "app-core",
        "components",
        "VoiceConfigView.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        `const active = selectedVoiceId === preset.voiceId;
return _jsx(Button, { variant: active ? "default" : "outline", size: "sm", className: "h-auto flex-col items-start py-1.5 px-2 text-left" });
`,
        "utf8",
      );

      const patched = applyAppCoreVoiceConfigSelectionVisibilityPatch(filePath);
      expect(patched).toBe(true);
      const updated = readFileSync(filePath, "utf8");
      expect(updated).toContain('variant: "outline"');
      expect(updated).toContain("bg-[var(--accent)]/20 text-white");
      expect(updated).toContain("shadow-[0_0_0_1px_var(--accent)]");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchAppCoreMiladyAssets patches app-core runtime files and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const rootPkgDir = join(tmp, "node_modules", "@elizaos", "app-core");
      const cachedPkgDir = join(
        tmp,
        "node_modules",
        ".bun",
        "@elizaos+app-core@2.0.0-alpha.53",
        "node_modules",
        "@elizaos",
        "app-core",
      );

      for (const pkgDir of [rootPkgDir, cachedPkgDir]) {
        mkdirSync(join(pkgDir, "state"), { recursive: true });
        mkdirSync(join(pkgDir, "components", "avatar"), { recursive: true });
        mkdirSync(join(pkgDir, "components", "onboarding"), {
          recursive: true,
        });
        writeFileSync(join(pkgDir, "state", "vrm.js"), "// upstream", "utf8");
        writeFileSync(
          join(pkgDir, "state", "vrm.d.ts"),
          "export declare const VRM_COUNT = 1;\n",
          "utf8",
        );
        writeFileSync(
          join(pkgDir, "components", "avatar", "VrmViewer.js"),
          'const DEFAULT_VRM_PATH = resolveAppAssetUrl("vrms/eliza-1.vrm.gz");\n',
          "utf8",
        );
        writeFileSync(
          join(pkgDir, "components", "onboarding", "IdentityStep.js"),
          "const IDENTITY_PRESETS = {};\nstyles.slice(0, 4);\n",
          "utf8",
        );
        writeFileSync(
          join(pkgDir, "components", "CharacterView.js"),
          "const CHARACTER_PRESET_META = {};\nconst visibleCharacterRoster = characterRoster.slice(0, 4);\nconst avatarIndex = meta?.avatarIndex ?? (index % 4) + 1;\n",
          "utf8",
        );
      }

      const logs: string[] = [];
      const patched = patchAppCoreMiladyAssets(
        tmp,
        (msg) => logs.push(msg),
        MOCK_MILADY_CATALOG,
      );
      expect(patched).toBe(true);
      expect(
        logs.some((line) => line.includes("@elizaos/app-core state/vrm.js")),
      ).toBe(true);
      expect(
        logs.some((line) =>
          line.includes("@elizaos/app-core components/avatar/VrmViewer.js"),
        ),
      ).toBe(true);
      expect(
        logs.some((line) =>
          line.includes(
            "@elizaos/app-core components/onboarding/IdentityStep.js",
          ),
        ),
      ).toBe(true);
      expect(
        logs.some((line) =>
          line.includes("@elizaos/app-core components/CharacterView.js"),
        ),
      ).toBe(true);
      expect(
        readFileSync(join(rootPkgDir, "state", "vrm.js"), "utf8"),
      ).toContain('vrmPath: resolveAppAssetUrl("vrms/milady-1.vrm.gz")');
      expect(
        readFileSync(join(rootPkgDir, "state", "vrm.d.ts"), "utf8"),
      ).toContain("export declare const VRM_COUNT = 4;");
      expect(
        readFileSync(
          join(rootPkgDir, "components", "onboarding", "IdentityStep.js"),
          "utf8",
        ),
      ).toContain("styles.slice(0, 2);");
      expect(
        readFileSync(
          join(rootPkgDir, "components", "CharacterView.js"),
          "utf8",
        ),
      ).toContain(
        '"I\'m here to help you.": { name: "Ai", avatarIndex: 2, voicePresetId: "sarah" }',
      );
      expect(
        readFileSync(
          join(cachedPkgDir, "components", "avatar", "VrmViewer.js"),
          "utf8",
        ),
      ).toContain("vrms/milady-1.vrm.gz");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyAutonomousMiladyOnboardingPresetsPatch replaces upstream presets with Milady's source", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "autonomous",
        "packages",
        "autonomous",
        "src",
        "onboarding-presets.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(filePath, 'export const STYLE_PRESETS = ["upstream"];\n');

      const miladySource =
        'export const SHARED_STYLE_RULES = ["Keep responses brief."];\nexport const STYLE_PRESETS = ["milady"];\n';
      const patched = applyAutonomousMiladyOnboardingPresetsPatch(
        filePath,
        miladySource,
      );

      expect(patched).toBe(true);
      expect(readFileSync(filePath, "utf8")).toBe(miladySource);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchAutonomousMiladyOnboardingPresets patches installed autonomous copies and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const rootSourcePath = join(tmp, "src", "onboarding-presets.ts");
      const rootPkgPath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "autonomous",
        "packages",
        "autonomous",
        "src",
        "onboarding-presets.js",
      );
      const cachedPkgPath = join(
        tmp,
        "node_modules",
        ".bun",
        "@elizaos+autonomous@2.0.0-alpha.53",
        "node_modules",
        "@elizaos",
        "autonomous",
        "packages",
        "autonomous",
        "src",
        "onboarding-presets.js",
      );

      mkdirSync(join(rootSourcePath, ".."), { recursive: true });
      mkdirSync(join(rootPkgPath, ".."), { recursive: true });
      mkdirSync(join(cachedPkgPath, ".."), { recursive: true });

      const miladySource =
        'export const SHARED_STYLE_RULES = ["Keep responses brief."];\nexport const STYLE_PRESETS = ["milady"];\n';
      writeFileSync(rootSourcePath, miladySource, "utf8");
      writeFileSync(
        rootPkgPath,
        'export const STYLE_PRESETS = ["upstream"];\n',
      );
      writeFileSync(
        cachedPkgPath,
        'export const STYLE_PRESETS = ["upstream"];\n',
      );

      const logs: string[] = [];
      const patched = patchAutonomousMiladyOnboardingPresets(tmp, (msg) =>
        logs.push(msg),
      );

      expect(patched).toBe(true);
      expect(readFileSync(rootPkgPath, "utf8")).toBe(miladySource);
      expect(readFileSync(cachedPkgPath, "utf8")).toBe(miladySource);
      expect(
        logs.some((line) =>
          line.includes(
            "@elizaos/autonomous packages/autonomous/src/onboarding-presets.js",
          ),
        ),
      ).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applyAgentSkillsCatalogFetchPatch coalesces catalog fetches and softens 429 logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        "@elizaos",
        "plugin-agent-skills",
        "dist",
        "index.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        `class AgentSkillsService {
  // Tracks the last catalog fetch failure timestamp for backoff.
  lastFetchErrorAt = 0;
  async getCatalog(options = {}) {
    const ttl = options.notOlderThan ?? CACHE_TTL.CATALOG;
    if (!options.forceRefresh && this.catalogCache) {
      const age = Date.now() - this.catalogCache.cachedAt;
      if (age < ttl) {
        return this.catalogCache.data;
      }
    }
    const sinceLastError = Date.now() - this.lastFetchErrorAt;
    if (this.lastFetchErrorAt > 0 && sinceLastError < FETCH_ERROR_COOLDOWN) {
      return this.catalogCache?.data ?? [];
    }
    try {
      throw new Error("Catalog fetch failed: 429");
    } catch (error) {
      this.lastFetchErrorAt = Date.now();
      this.runtime.logger.warn(\`AgentSkills: Catalog fetch failed (will retry after cooldown): \${error}\`);
      if (!this.catalogCache) {
        this.catalogCache = { data: [], cachedAt: Date.now() };
      }
      return this.catalogCache.data;
    }
  }
  /**
   * Search ClawHub for skills.
   */
  async search() {}
}
`,
        "utf8",
      );

      const patched = applyAgentSkillsCatalogFetchPatch(filePath);
      expect(patched).toBe(true);

      const updated = readFileSync(filePath, "utf8");
      expect(updated).toContain("catalogFetchInFlight = null;");
      expect(updated).toContain("catalogFetchCooldownUntil = 0;");
      expect(updated).toContain(
        'statusError.retryAfter = response.headers.get("retry-after");',
      );
      expect(updated).toContain("this.catalogFetchInFlight = (async () => {");
      expect(updated).toContain("Catalog rate limited (429)");
      expect(updated).not.toContain(
        "const sinceLastError = Date.now() - this.lastFetchErrorAt;",
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("patchAgentSkillsCatalogFetch patches Bun-installed copies and logs", () => {
    const tmp = mkdtempSync(join(tmpdir(), "patch-bun-exports-test-"));
    try {
      const filePath = join(
        tmp,
        "node_modules",
        ".bun",
        "@elizaos+plugin-agent-skills@2.0.0-alpha.11",
        "node_modules",
        "@elizaos",
        "plugin-agent-skills",
        "dist",
        "index.js",
      );
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(
        filePath,
        `class AgentSkillsService {
  // Tracks the last catalog fetch failure timestamp for backoff.
  lastFetchErrorAt = 0;
  async getCatalog(options = {}) {
    return [];
  }
  /**
   * Search ClawHub for skills.
   */
  async search() {}
}
`,
        "utf8",
      );

      const logs: string[] = [];
      const patched = patchAgentSkillsCatalogFetch(tmp, (msg) =>
        logs.push(msg),
      );
      expect(patched).toBe(true);
      expect(logs.some((l) => l.includes("plugin-agent-skills"))).toBe(true);

      const updated = readFileSync(filePath, "utf8");
      expect(updated).toContain("catalogFetchCooldownUntil = 0;");
      expect(updated).toContain("Catalog rate limited (429)");
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
