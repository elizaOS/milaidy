// ESM polyfill for __dirname and __filename
const esmShim = `
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __pathDirname } from 'node:path';
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __pathDirname(__filename);
`;

export default [{
  entry: {
    "index": "src/index.ts",
    "entry": "src/entry.ts",
    "eliza": "src/runtime/eliza.ts",
    "server": "src/api/server.ts",
    "plugins/whatsapp/index": "src/plugins/whatsapp/index.ts",
    "plugins/retake/index": "src/plugins/retake/index.ts"
  },
  format: "esm",
  platform: "node",
  outDir: "dist-electron",
  banner: { js: esmShim },
  noExternal: [/.*/, "json5"],
  external: [
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
  ],
  fixedExtension: false,
  inlineOnly: false,
  env: { NODE_ENV: "production" }
}];
