import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const isLiveOnly = process.env.MILADY_LIVE_TEST === "1";
const liveTestFiles = [
  "test/wallet-live.e2e.test.ts",
  "test/api-auth-live.e2e.test.ts",
  "test/cloud-providers.e2e.test.ts",
];

export default defineConfig({
  resolve: {
    alias: {
      "milady/plugin-sdk": path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
      "@elizaos/core": path.join(
        repoRoot,
        "node_modules",
        "@elizaos",
        "core",
        "dist",
        "node",
        "index.node.js",
      ),
      "@elizaos/skills": path.join(
        repoRoot,
        "test",
        "stubs",
        "empty-module.mjs",
      ),
      "@elizaos/plugin-agent-orchestrator": path.join(
        repoRoot,
        "test",
        "stubs",
        "coding-agent-module.ts",
      ),
      "@elizaos/plugin-coding-agent": path.join(
        repoRoot,
        "test",
        "stubs",
        "coding-agent-module.ts",
      ),
      "@elizaos/plugin-pdf": path.join(
        repoRoot,
        "test",
        "stubs",
        "empty-module.mjs",
      ),
      "@elizaos/plugin-form": path.join(
        repoRoot,
        "test",
        "stubs",
        "empty-module.mjs",
      ),
      "@elizaos/plugin-pi-ai": path.join(
        repoRoot,
        "test",
        "stubs",
        "pi-ai-module.ts",
      ),
    },
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: "forks",
    maxWorkers: 1,
    sequence: {
      concurrent: false,
      shuffle: false,
    },
    include: isLiveOnly ? liveTestFiles : ["test/**/*.e2e.test.ts"],
    setupFiles: ["test/setup.ts"],
    exclude: ["dist/**", "**/node_modules/**", "test/capacitor-plugins.e2e.test.ts"],
    server: {
      deps: {
        inline: ["@elizaos/core", "zod"],
      },
    },
  },
});
