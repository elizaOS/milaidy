import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

export default defineConfig([
  {
    entry: "src/index.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/entry.ts",
    env,
    fixedExtension: false,
    platform: "node",
    unbundle: true,
    inlineOnly: false,
  },
  {
    entry: "src/runtime/eliza.ts",
    env,
    fixedExtension: false,
    platform: "node",
    unbundle: true,
    inlineOnly: false,
  },
  {
    entry: "src/api/server.ts",
    env,
    fixedExtension: false,
    platform: "node",
    unbundle: true,
    inlineOnly: false,
  },
]);
