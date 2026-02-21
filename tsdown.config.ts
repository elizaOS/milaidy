import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

// Packages with native .node binaries must be externalized — rolldown cannot
// bundle Mach-O/ELF shared libraries and will error trying to read them as
// UTF-8.  This list covers direct + transitive native deps.
const nativeExternals = [
  "node-llama-cpp",
  "@reflink/reflink",
  "@reflink/reflink-darwin-arm64",
  "@reflink/reflink-darwin-x64",
  "@reflink/reflink-linux-arm64-gnu",
  "@reflink/reflink-linux-x64-gnu",
  "fsevents",
];

export default defineConfig([
  {
    entry: "src/index.ts",
    env,
    fixedExtension: false,
    platform: "node",
    external: nativeExternals,
  },
  {
    entry: "src/entry.ts",
    env,
    fixedExtension: false,
    platform: "node",
    unbundle: true,
    inlineOnly: false,
    external: nativeExternals,
  },
  {
    entry: "src/runtime/eliza.ts",
    env,
    fixedExtension: false,
    platform: "node",
    unbundle: true,
    inlineOnly: false,
    external: nativeExternals,
  },
  {
    entry: "src/api/server.ts",
    env,
    fixedExtension: false,
    platform: "node",
    unbundle: true,
    inlineOnly: false,
    external: nativeExternals,
  },
  {
    entry: "src/plugins/retake/index.ts",
    outDir: "dist/plugins/retake",
    env,
    fixedExtension: false,
    platform: "node",
    unbundle: true,
    inlineOnly: false,
    external: [...nativeExternals, "socket.io-client"],
  },
  {
    entry: "src/plugins/whatsapp/index.ts",
    outDir: "dist/plugins/whatsapp",
    env,
    fixedExtension: false,
    platform: "node",
    unbundle: true,
    inlineOnly: false,
    external: nativeExternals,
  },
]);
