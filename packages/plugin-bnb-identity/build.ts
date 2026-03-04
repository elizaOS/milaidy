import { build } from "bun";
import { rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });

await build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "node",
  format: "esm",
  splitting: false,
  sourcemap: "external",
  external: ["@elizaos/core"],
});

console.log("@milady/plugin-bnb-identity built successfully.");
