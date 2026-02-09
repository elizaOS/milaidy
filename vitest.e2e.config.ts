import os from "node:os";
import { defineConfig } from "vitest/config";

const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const cpuCount = os.cpus().length;
const e2eWorkers = isCI
  ? 2
  : Math.min(4, Math.max(1, Math.floor(cpuCount * 0.25)));

export default defineConfig({
  // @elizaos/skills has a broken package.json entry; the server handles
  // the missing module gracefully, so tell Vite not to resolve it.
  resolve: {
    alias: {
      "@elizaos/skills": "/dev/null",
    },
  },
  test: {
    pool: "forks",
    maxWorkers: e2eWorkers,
    globalSetup: ["test/e2e-global-setup.ts"],
    include: ["test/**/*.e2e.test.ts", "src/**/*.e2e.test.ts"],
    setupFiles: ["test/setup.ts"],
    exclude: [
      "dist/**",
      "apps/macos/**",
      "apps/macos/.build/**",
      "**/vendor/**",
      "dist/Milaidy.app/**",
    ],
  },
});
