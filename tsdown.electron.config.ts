// ESM polyfill for __dirname and __filename
const esmShim = `
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __pathDirname } from 'node:path';
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __pathDirname(__filename);
`;

// Packages with native .node binaries must be externalized
const nativeExternals = [
  "node-llama-cpp",
  "@reflink/reflink",
  "@reflink/reflink-darwin-arm64",
  "@reflink/reflink-darwin-x64",
  "@reflink/reflink-linux-arm64-gnu",
  "@reflink/reflink-linux-x64-gnu",
  "fsevents",
  "koffi",
  "canvas",
  "onnxruntime-node",
  "sharp",
];

const commonConfig = {
  format: "esm",
  platform: "node",
  outDir: "dist-electron",
  banner: { js: esmShim },
  noExternal: [/.*/, "json5"],
  external: nativeExternals,
  fixedExtension: false,
  inlineOnly: false,
  env: { NODE_ENV: "production" },
};

export default [
  {
    ...commonConfig,
    entry: "src/index.ts",
  },
  {
    ...commonConfig,
    entry: "src/entry.ts",
  },
  {
    ...commonConfig,
    entry: "src/runtime/eliza.ts",
    // Disable code splitting to prevent circular chunk dependencies.
    outputOptions: { codeSplitting: false },
  },
  {
    ...commonConfig,
    entry: "src/api/server.ts",
    // Disable code splitting to prevent circular chunk dependencies.
    // Without this, rolldown places the __exportAll runtime helper in the
    // entry chunk and shared chunks import it back, creating a circular
    // import that fails when Electron loads server.js via dynamic import().
    outputOptions: { codeSplitting: false },
  },
  {
    ...commonConfig,
    entry: "src/plugins/whatsapp/index.ts",
  },
];
