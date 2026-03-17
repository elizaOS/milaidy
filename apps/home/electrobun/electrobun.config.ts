import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Eliza Home",
    identifier: "com.elizaos.home",
    version: "2.0.0-alpha.87",
    description: "Eliza Home - AI chat",
    urlSchemes: ["eliza"],
  },
  runtime: {
    exitOnLastWindowClosed: false,
  },
  build: {
    bun: {
      entrypoint: "src/index.ts",
    },
    views: {},
    watch: ["../dist", "src/"],
    watchIgnore: [
      "src/**/*.test.ts",
      "src/**/*.spec.ts",
      "artifacts/",
      "build/",
    ],
    copy: {
      "../dist": "renderer",
      "../../app/electrobun/src/preload.js": "bun/preload.js",
      // ElizaOS backend server bundle
      "../../../dist": "eliza-dist",
      ...(process.platform === "darwin"
        ? { "../../app/electrobun/src/libMacWindowEffects.dylib": "libMacWindowEffects.dylib" }
        : {}),
    },
    mac: {
      codesign: process.env.ELECTROBUN_SKIP_CODESIGN !== "1",
      notarize:
        process.env.ELECTROBUN_SKIP_CODESIGN !== "1" &&
        process.env.ELIZA_HOME_ELECTROBUN_NOTARIZE !== "0",
      defaultRenderer: "native",
      icons: "assets/appIcon.iconset",
      entitlements: {
        "com.apple.security.cs.allow-jit": true,
        "com.apple.security.cs.allow-unsigned-executable-memory": true,
        "com.apple.security.cs.disable-library-validation": true,
        "com.apple.security.network.client": true,
        "com.apple.security.network.server": true,
        "com.apple.security.files.user-selected.read-write": true,
        "com.apple.security.device.microphone": true,
      },
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: "cef",
      icon: "assets/appIcon.png",
    },
    win: {
      bundleCEF: true,
      defaultRenderer: "cef",
      icon: "assets/appIcon.ico",
    },
  },
  release: {
    baseUrl: "https://eliza.ai/releases/home/",
    generatePatch: true,
  },
} satisfies ElectrobunConfig;
