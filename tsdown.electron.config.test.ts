import { defineConfig } from "tsdown";
export default defineConfig([{
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
    ],
    fixedExtension: false,
    inlineOnly: false,
    env: { NODE_ENV: "production" }
}]);
