import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EMOTE_CATALOG } from "../../../../src/emotes/catalog";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const APP_DIR = join(TEST_DIR, "../..");
const PUBLIC_DIR = join(APP_DIR, "public");
const BUNDLED_VRM_SOURCE_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const BUNDLED_BACKGROUND_SOURCE_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
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
    const expectedFiles = new Set<string>([
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
      ...BUNDLED_VRM_SOURCE_IDS.map((id) => `vrms/previews/milady-${id}.png`),
      ...BUNDLED_VRM_SOURCE_IDS.map((id) => `vrms/milady-${id}.vrm.gz`),
      ...BUNDLED_BACKGROUND_SOURCE_IDS.map(
        (id) => `vrms/backgrounds/milady-${id}.png`,
      ),
    ]);

    expect(actualFiles).toEqual([...expectedFiles].sort());
  });

  it("keeps the archived bundle-only candidates outside apps/app/public", () => {
    const archivedCandidates = [
      "public_src/dev/vrm-gzip-smoke.html",
      "public_src/screenshotter.html",
      "public_src/animations/idle.glb",
      "public_src/vrms/milady-1.vrm",
      "public_src/vrms/test-binary.vrm.gz",
      "public_src/worlds/companion-day-collider.glb",
      "public_src/animations/Idle.fbx",
    ];

    for (const relPath of archivedCandidates) {
      expect(existsSync(join(APP_DIR, relPath))).toBe(true);
    }
  });
});
