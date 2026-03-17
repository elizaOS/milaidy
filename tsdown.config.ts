// tsdown config — no import needed, defineConfig is a type-only identity fn

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

// @elizaos/plugin-* are loaded at runtime via dynamic import(); every entry that
// transitively includes eliza.ts needs the plugin regex so rolldown treats them
// as external and doesn't emit UNRESOLVED_IMPORT warnings.
const pluginExternal = /^@elizaos\/plugin-/;
const allExternals = [...nativeExternals, pluginExternal];

// @elizaos/autonomous moved from src/ to an npm package. The src/ files are now
// thin re-exports, but tsdown won't inline node_modules packages. Point entries
// directly at the autonomous source so the bundled dist/ is self-contained.
const autonomousRoot = "node_modules/@elizaos/autonomous/src";

export default [
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
    // Also externalize @elizaos/autonomous so the unbundle walk doesn't emit
    // thin re-export stubs for runtime/eliza.js and api/server.js — those are
    // built as fully-inlined bundles by the dedicated entries below.
    external: [...allExternals, /^@elizaos\/autonomous/],
  },
  {
    entry: `${autonomousRoot}/runtime/eliza.ts`,
    outDir: "dist/runtime",
    env,
    fixedExtension: false,
    platform: "node",
    inlineOnly: false,
    external: allExternals,
    outputOptions: { codeSplitting: false },
  },
  {
    entry: `${autonomousRoot}/api/server.ts`,
    outDir: "dist/api",
    env,
    fixedExtension: false,
    platform: "node",
    inlineOnly: false,
    external: allExternals,
    // Disable code splitting to prevent circular chunk dependencies.
    // Without this, rolldown places the __exportAll runtime helper in the
    // entry chunk and shared chunks import it back, creating a circular
    // import that fails when Electron loads server.js via dynamic import().
    outputOptions: { codeSplitting: false },
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
];
