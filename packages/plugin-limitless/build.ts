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
  external: ["@elizaos/core", "viem", "socket.io-client", "eventsource"],
});

console.log("Generating type declarations...");
execSync(
  "npx -p typescript tsc --project tsconfig.json --declaration --emitDeclarationOnly --outDir dist",
  {
    stdio: "inherit",
  },
);

console.log("@milady/plugin-limitless built successfully.");
