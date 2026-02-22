import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const isWindows = process.platform === "win32";
const localWorkers = Math.max(4, Math.min(16, os.cpus().length));
const ciWorkers = isWindows ? 2 : 3;

export default defineConfig({
  resolve: {
    alias: {
      "milady/plugin-sdk": path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
      // @elizaos/skills has a broken package.json entry; the code handles the
      // missing module gracefully (try/catch), so redirect to an empty stub.
      "@elizaos/skills": path.join(
        repoRoot,
        "test",
        "stubs",
        "empty-module.mjs",
      ),
      electron: path.join(repoRoot, "test", "stubs", "electron-module.ts"),
    },
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: isWindows ? 180_000 : 120_000,
    pool: "forks",
    maxWorkers: isCI ? ciWorkers : localWorkers,
    include: [
      "src/**/*.test.ts",
      "scripts/**/*.test.ts",
      "apps/**/*.test.tsx",
      "apps/app/test/app/lifecycle-lock.test.ts",
      "apps/app/test/app/api-client-timeout.test.ts",
      "apps/app/test/app/startup-backend-missing.e2e.test.ts",
      "apps/app/test/app/startup-token-401.e2e.test.ts",
      "apps/app/test/electron-ui/electron-startup-failure.e2e.spec.ts",
      "test/api-server.e2e.test.ts",
      "test/format-error.test.ts",
    ],
    setupFiles: ["test/setup.ts"],
    exclude: [
      "dist/**",
      "**/node_modules/**",
      "**/*.live.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 25,
        functions: 25,
        branches: 15,
        statements: 25,
      },
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // Entrypoints and wiring (covered by CI smoke + manual/e2e flows).
        "src/entry.ts",
        "src/index.ts",
        "src/cli/**",
        "src/hooks/**",
      ],
    },
    server: {
      deps: {
        inline: ["@elizaos/core"],
      },
    },
  },
});
