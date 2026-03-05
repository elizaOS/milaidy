import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { build } from "bun";

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

console.log("Generating type declarations...");
// Use -p typescript so npx runs the compiler from the typescript package, not the joke package "tsc".
execSync(
  "npx -p typescript tsc --project tsconfig.build.json --declaration --emitDeclarationOnly --outDir dist",
  {
    stdio: "inherit",
  },
);

console.log("@milady/plugin-bnb-identity built successfully.");
