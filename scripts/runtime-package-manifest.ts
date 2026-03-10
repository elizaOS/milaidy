import fs from "node:fs";
import path from "node:path";

import {
  CORE_PLUGINS,
  OPTIONAL_CORE_PLUGINS,
} from "../src/runtime/core-plugins";

const JS_FILE_RE = /\.(?:[cm]?js)$/i;
const IMPORT_SPECIFIER_RE =
  /\b(?:import|export)\s+(?:[^"'`;]+?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)|\brequire\(\s*["']([^"']+)["']\s*\)/g;
const CORE_PLUGIN_SET = new Set(CORE_PLUGINS);
const OPTIONAL_CORE_PLUGIN_SET = new Set(OPTIONAL_CORE_PLUGINS);
export const DESKTOP_RUNTIME_CAPABILITY_PACKS = [
  "browser-automation",
  "connectors",
  "core-runtime",
  "developer-tools",
  "knowledge",
  "local-ai",
  "streaming",
  "vision-media",
  "voice",
] as const;

export type DesktopRuntimePackageBucket =
  | "base"
  | "lazy-base"
  | "optional-pack";
export type DesktopRuntimeCapabilityPack =
  | "browser-automation"
  | "connectors"
  | "core-runtime"
  | "developer-tools"
  | "knowledge"
  | "local-ai"
  | "streaming"
  | "vision-media"
  | "voice";
export type DesktopRuntimePackageOrigin =
  | "always-bundled"
  | "detected-import"
  | "transitive-runtime-dependency";

export type DesktopRuntimePackagePolicy = {
  bucket: DesktopRuntimePackageBucket;
  capabilityPack: DesktopRuntimeCapabilityPack | null;
  reason: string;
};

export type DesktopRuntimePackageRecord = DesktopRuntimePackagePolicy & {
  bundled: boolean;
  excluded: boolean;
  name: string;
  requestedBy: DesktopRuntimePackageOrigin[];
};

export type DesktopRuntimeInventory = {
  excludedCapabilityPacks: DesktopRuntimeCapabilityPack[];
  excludedPackages: string[];
  generatedAt: string;
  missingPackages: string[];
  packages: DesktopRuntimePackageRecord[];
  scanDir: string;
  summary: {
    baseBundledPackages: number;
    bundledPackages: number;
    explicitRequestedPackages: number;
    excludedPackages: number;
    lazyBaseBundledPackages: number;
    missingPackages: number;
    optionalPackBundledPackages: number;
    transitiveBundledPackages: number;
  };
  targetDist: string;
};

type DesktopRuntimeInventoryInput = {
  alwaysBundledPackages: Iterable<string>;
  bundledPackages: Iterable<string>;
  discoveredPackages: Iterable<string>;
  excludedCapabilityPacks?: Iterable<DesktopRuntimeCapabilityPack>;
  generatedAt?: string;
  missingPackages?: Iterable<string>;
  scanDir: string;
  targetDist: string;
};

export function normalizePackageName(specifier: string): string | null {
  if (
    !specifier ||
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("node:") ||
    specifier.startsWith("file:")
  ) {
    return null;
  }

  if (specifier.startsWith("@")) {
    const [scope, pkg] = specifier.split("/");
    return scope && pkg ? `${scope}/${pkg}` : null;
  }

  const [pkg] = specifier.split("/");
  return pkg || null;
}

export function extractBarePackageSpecifiers(source: string): string[] {
  const found = new Set<string>();
  const matches = source.matchAll(IMPORT_SPECIFIER_RE);

  for (const match of matches) {
    const raw = match[1] || match[2] || match[3];
    const normalized = raw ? normalizePackageName(raw) : null;
    if (normalized) found.add(normalized);
  }

  return [...found].sort();
}

export function discoverRuntimePackages(scanDir: string): string[] {
  const found = new Set<string>();

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!entry.isFile() || !JS_FILE_RE.test(entry.name)) continue;
      const source = fs.readFileSync(entryPath, "utf8");
      for (const pkg of extractBarePackageSpecifiers(source)) {
        found.add(pkg);
      }
    }
  }

  walk(scanDir);
  return [...found].sort();
}

export function discoverAlwaysBundledPackages(
  packageJsonPath: string,
): string[] {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const deps = Object.keys(pkg.dependencies ?? {});
  return deps
    .filter(
      (name) =>
        name.startsWith("@elizaos/") || name.startsWith("@milady/plugin-"),
    )
    .sort();
}

export function isDesktopRuntimeCapabilityPack(
  value: string,
): value is DesktopRuntimeCapabilityPack {
  return DESKTOP_RUNTIME_CAPABILITY_PACKS.includes(
    value as DesktopRuntimeCapabilityPack,
  );
}

function optionalCorePluginPolicy(
  name: string,
): DesktopRuntimePackagePolicy | null {
  switch (name) {
    case "@elizaos/plugin-browser":
    case "@elizaos/plugin-computeruse":
    case "@elizaos/plugin-cua":
      return {
        bucket: "optional-pack",
        capabilityPack: "browser-automation",
        reason:
          "Browser and computer-use plugins are feature-scoped desktop automation surfaces.",
      };
    case "@elizaos/plugin-discord":
    case "@elizaos/plugin-telegram":
    case "@elizaos/plugin-twitch":
      return {
        bucket: "optional-pack",
        capabilityPack: "connectors",
        reason:
          "Social connector plugins are optional integrations and should not expand the base shell by default.",
      };
    case "@elizaos/plugin-edge-tts":
    case "@elizaos/plugin-elevenlabs":
      return {
        bucket: "optional-pack",
        capabilityPack: "voice",
        reason:
          "Voice plugins pull in speech-specific providers and native/runtime dependencies that should stay optional.",
      };
    case "@elizaos/plugin-obsidian":
      return {
        bucket: "lazy-base",
        capabilityPack: "knowledge",
        reason:
          "Knowledge integrations can stay shipped, but they should be activated only when the user enables them.",
      };
    case "@elizaos/plugin-cli":
    case "@elizaos/plugin-code":
    case "@elizaos/plugin-repoprompt":
    case "@elizaos/plugin-claude-code-workbench":
      return {
        bucket: "lazy-base",
        capabilityPack: "developer-tools",
        reason:
          "Developer tooling is useful on desktop, but it should remain lazy rather than part of the always-on startup path.",
      };
    case "@elizaos/plugin-vision":
      return {
        bucket: "optional-pack",
        capabilityPack: "vision-media",
        reason:
          "Vision is already feature-gated in runtime config and should map to a dedicated media/vision delivery path.",
      };
    default:
      return null;
  }
}

export function classifyDesktopRuntimePackage(
  name: string,
): DesktopRuntimePackagePolicy {
  if (name === "@elizaos/core") {
    return {
      bucket: "base",
      capabilityPack: "core-runtime",
      reason: "The core runtime package is part of the base desktop shell.",
    };
  }

  if (
    name === "@elizaos/plugin-local-embedding" ||
    name === "@elizaos/plugin-ollama" ||
    name === "@huggingface/transformers" ||
    name === "node-llama-cpp"
  ) {
    return {
      bucket: "lazy-base",
      capabilityPack: "local-ai",
      reason:
        "Local AI support is preserved, but it should remain runtime-side and lazy rather than startup-critical.",
    };
  }

  if (
    name === "@milady/plugin-retake" ||
    name === "@milady/plugin-pumpfun-streaming" ||
    name === "@milady/plugin-streaming-base" ||
    name === "@milady/plugin-twitch-streaming" ||
    name === "@milady/plugin-x-streaming" ||
    name === "@milady/plugin-youtube-streaming"
  ) {
    return {
      bucket: "optional-pack",
      capabilityPack: "streaming",
      reason:
        "Streaming integrations are user-facing capability packs and should not inflate the base desktop payload by default.",
    };
  }

  if (
    name === "@tensorflow/tfjs-core" ||
    name === "@tensorflow/tfjs-node" ||
    name === "@tensorflow-models/coco-ssd" ||
    name === "@tensorflow-models/mobilenet" ||
    name === "@tensorflow-models/pose-detection" ||
    name === "canvas" ||
    name === "face-api.js" ||
    name === "sharp"
  ) {
    return {
      bucket: "optional-pack",
      capabilityPack: "vision-media",
      reason:
        "Vision and image-processing dependencies are heavy native/media payloads that fit an optional capability pack.",
    };
  }

  if (
    name === "puppeteer-core" ||
    name === "playwright" ||
    name === "playwright-core"
  ) {
    return {
      bucket: "optional-pack",
      capabilityPack: "browser-automation",
      reason:
        "Browser automation dependencies are not required for core chat/settings flows and should stay isolated.",
    };
  }

  if (name === "whisper-node") {
    return {
      bucket: "optional-pack",
      capabilityPack: "voice",
      reason:
        "Speech recognition adds native audio build risk and should be tracked as an optional voice capability.",
    };
  }

  if (CORE_PLUGIN_SET.has(name)) {
    return {
      bucket: "base",
      capabilityPack: "core-runtime",
      reason:
        "This plugin is part of the current core runtime startup contract and remains in the base desktop payload.",
    };
  }

  if (OPTIONAL_CORE_PLUGIN_SET.has(name)) {
    return (
      optionalCorePluginPolicy(name) ?? {
        bucket: "lazy-base",
        capabilityPack: null,
        reason:
          "This runtime plugin is optional today and should stay lazy until it has a dedicated pack boundary.",
      }
    );
  }

  return {
    bucket: "base",
    capabilityPack: null,
    reason:
      "This package is currently part of the base runtime closure or a transitive dependency of it.",
  };
}

export function shouldBundleDesktopRuntimePackage(
  name: string,
  excludedCapabilityPacks: ReadonlySet<DesktopRuntimeCapabilityPack>,
): boolean {
  if (excludedCapabilityPacks.size === 0) {
    return true;
  }

  const policy = classifyDesktopRuntimePackage(name);
  if (policy.bucket !== "optional-pack" || !policy.capabilityPack) {
    return true;
  }

  return !excludedCapabilityPacks.has(policy.capabilityPack);
}

export function buildDesktopRuntimeInventory({
  alwaysBundledPackages,
  bundledPackages,
  discoveredPackages,
  excludedCapabilityPacks = [],
  generatedAt = new Date().toISOString(),
  missingPackages = [],
  scanDir,
  targetDist,
}: DesktopRuntimeInventoryInput): DesktopRuntimeInventory {
  const alwaysBundled = new Set(alwaysBundledPackages);
  const discovered = new Set(discoveredPackages);
  const bundled = new Set(bundledPackages);
  const excludedPacks = new Set(excludedCapabilityPacks);
  const missing = new Set(missingPackages);
  const requested = new Set([...alwaysBundled, ...discovered]);
  const packageNames = new Set([...requested, ...bundled, ...missing]);

  const packages = [...packageNames].sort().map((name) => {
    const requestedBy = new Set<DesktopRuntimePackageOrigin>();
    if (alwaysBundled.has(name)) {
      requestedBy.add("always-bundled");
    }
    if (discovered.has(name)) {
      requestedBy.add("detected-import");
    }
    if (bundled.has(name) && requestedBy.size === 0) {
      requestedBy.add("transitive-runtime-dependency");
    }

    return {
      ...classifyDesktopRuntimePackage(name),
      bundled: bundled.has(name),
      excluded: !shouldBundleDesktopRuntimePackage(name, excludedPacks),
      name,
      requestedBy: [...requestedBy].sort(),
    };
  });

  const bundledPackagesByBucket = packages.filter((entry) => entry.bundled);
  const excludedPackages = packages
    .filter((entry) => entry.excluded)
    .map((entry) => entry.name)
    .sort();

  return {
    excludedCapabilityPacks: [...excludedPacks].sort(),
    excludedPackages,
    generatedAt,
    missingPackages: [...missing].sort(),
    packages,
    scanDir,
    summary: {
      baseBundledPackages: bundledPackagesByBucket.filter(
        (entry) => entry.bucket === "base",
      ).length,
      bundledPackages: bundledPackagesByBucket.length,
      explicitRequestedPackages: requested.size,
      excludedPackages: excludedPackages.length,
      lazyBaseBundledPackages: bundledPackagesByBucket.filter(
        (entry) => entry.bucket === "lazy-base",
      ).length,
      missingPackages: missing.size,
      optionalPackBundledPackages: bundledPackagesByBucket.filter(
        (entry) => entry.bucket === "optional-pack",
      ).length,
      transitiveBundledPackages: bundledPackagesByBucket.filter((entry) =>
        entry.requestedBy.includes("transitive-runtime-dependency"),
      ).length,
    },
    targetDist,
  };
}
