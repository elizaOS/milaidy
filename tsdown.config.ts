import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

// Pure-JS packages that must be inlined even in unbundle mode because
// Electron's ESM resolver cannot find them in the packaged app.
const forceInline = ["zod"];

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
    noExternal: forceInline,
  },
  {
    entry: "src/runtime/eliza.ts",
    env,
    fixedExtension: false,
    platform: "node",
    unbundle: true,
    inlineOnly: false,
    external: nativeExternals,
    noExternal: forceInline,
  },
  {
    entry: "src/api/server.ts",
    env,
    fixedExtension: false,
    platform: "node",
    unbundle: true,
    inlineOnly: false,
    external: nativeExternals,
    noExternal: forceInline,
  },
  {
    entry: "src/plugins/telegram-enhanced/index.ts",
    outDir: "dist/plugins/telegram-enhanced",
    env,
    fixedExtension: false,
    platform: "node",
    unbundle: true,
    inlineOnly: false,
    external: nativeExternals,
    noExternal: forceInline,
  },
  {
    entry: "src/plugins/opinion/index.ts",
    outDir: "dist/plugins/opinion",
    env,
    fixedExtension: false,
    platform: "node",
    external: nativeExternals,
  },
]);
