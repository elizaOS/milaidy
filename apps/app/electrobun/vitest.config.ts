import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // bun:ffi is a Bun built-in — not available in Vitest (Vite) environment.
      // Map it to a stub so modules that import it can be tested.
      "bun:ffi": path.resolve(here, "src/__stubs__/bun-ffi.ts"),
    },
  },
  test: {
    root: here,
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    globals: true,
    coverage: {
      thresholds: {
        lines: 25,
        functions: 25,
        statements: 25,
        branches: 15,
      },
    },
  },
});
