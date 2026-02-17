import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "milady/plugin-sdk": path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
      "@elizaos/skills": path.join(
        repoRoot,
        "test",
        "stubs",
        "empty-module.mjs",
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
    include: ["test/**/*.e2e.test.ts"],
    setupFiles: ["test/setup.ts"],
    exclude: ["dist/**", "**/node_modules/**"],
  },
});
