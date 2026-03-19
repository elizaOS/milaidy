import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EMOTE_CATALOG } from "../../../../src/emotes/catalog";
import { MILADY_CHARACTER_ASSETS } from "../../src/character-catalog";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const APP_DIR = join(TEST_DIR, "../..");
const PUBLIC_DIR = join(APP_DIR, "public");
const PROVIDER_LOGOS = [
  "logos/anthropic-icon-white.png",
  "logos/anthropic-icon.png",
  "logos/claude-icon.png",
  "logos/deepseek-icon.png",
  "logos/elizaos-icon.png",
  "logos/gemini-icon.png",
  "logos/grok-icon-white.png",
  "logos/grok-icon.png",
  "logos/groq-icon-white.png",
  "logos/groq-icon.png",
  "logos/mistral-icon.png",
  "logos/ollama-icon-white.png",
  "logos/ollama-icon.png",
  "logos/openai-icon-white.png",
  "logos/openai-icon.png",
  "logos/openrouter-icon-white.png",
  "logos/openrouter-icon.png",
  "logos/together-ai-icon.png",
  "logos/zai-icon-white.png",
  "logos/zai-icon.png",
] as const;

function listFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
      continue;
    }
    files.push(relative(PUBLIC_DIR, fullPath).replaceAll("\\", "/"));
  }

  return files.sort();
}

describe("app public bundle assets", () => {
  it("only keeps the runtime allowlist in apps/app/public", () => {
    const actualFiles = listFiles(PUBLIC_DIR);
    // Build expected set from all known asset sources, then intersect with
    // files that actually exist on disk.  Some character VRMs/previews are
    // generated at build time and may not be present in CI (git-tracked only).
    const allExpected = new Set<string>([
      "android-chrome-192x192.png",
      "android-chrome-512x512.png",
      "apple-touch-icon.png",
      "favicon-16x16.png",
      "favicon-32x32.png",
      "favicon.ico",
      "og-image.png",
      "site.webmanifest",
      "animations/idle.glb.gz",
      "vrm-decoders/draco/draco_decoder.js",
      "vrm-decoders/draco/draco_decoder.wasm",
      "vrm-decoders/draco/draco_wasm_wrapper.js",
      "worlds/companion-day.spz",
      "worlds/companion-night.spz",
      ...PROVIDER_LOGOS,
      ...EMOTE_CATALOG.map((emote) => emote.path.replace(/^\//, "")),
      ...MILADY_CHARACTER_ASSETS.map((asset) =>
        asset.previewPath.replace(/^\//, ""),
      ),
      // Eliza-branded previews (1:1 copies of milady previews for rebranding)
      ...MILADY_CHARACTER_ASSETS.map((asset) =>
        asset.previewPath.replace(/^\//, "").replace("milady-", "eliza-"),
      ),
      ...MILADY_CHARACTER_ASSETS.map((asset) =>
        asset.compressedVrmPath.replace(/^\//, ""),
      ),
      ...MILADY_CHARACTER_ASSETS.map((asset) =>
        asset.backgroundPath.replace(/^\//, ""),
      ),
      // Eliza-branded backgrounds (1:1 copies for rebranding)
      ...MILADY_CHARACTER_ASSETS.map((asset) =>
        asset.backgroundPath.replace(/^\//, "").replace("milady-", "eliza-"),
      ),
    ]);

    // Only expect files that actually exist on disk (some are build artifacts)
    const expectedFiles = [...allExpected]
      .filter((f) => existsSync(join(PUBLIC_DIR, f)))
      .sort();

    expect(actualFiles).toEqual(expectedFiles);
  });

  it("keeps the archived bundle-only candidates outside apps/app/public", () => {
    const archivedCandidates = [
      "public_src/dev/vrm-gzip-smoke.html",
      "public_src/screenshotter.html",
      "public_src/animations/idle.glb",
      "public_src/vrms/milady-1.vrm",
      "public_src/worlds/companion-day-collider.glb",
      "public_src/animations/Idle.fbx",
    ];

    for (const relPath of archivedCandidates) {
      expect(existsSync(join(APP_DIR, relPath))).toBe(true);
    }
  });
});
