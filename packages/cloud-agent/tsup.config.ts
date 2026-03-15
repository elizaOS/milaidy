import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/cli.ts",
    "src/bridge/index.ts",
    "src/health/index.ts",
    "src/types.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node22",
  outDir: "dist",
  splitting: false,
  // All @elizaos/* packages are external (peer deps, dynamically imported)
  external: [
    "@elizaos/core",
    "@elizaos/plugin-sql",
    "@elizaos/plugin-elizacloud",
  ],
});
