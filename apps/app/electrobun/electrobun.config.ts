import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Milady",
    identifier: "com.miladyai.milady",
    version: "2.0.0-alpha.76",
    urlSchemes: ["milady"],
  },
  runtime: {
    exitOnLastWindowClosed: false,
  },
  build: {
    bun: {
      entrypoint: "src/index.ts",
    },
    views: {},
    // Copy the Vite-built renderer (apps/app/dist/) into the bundle as renderer/.
    // The Bun main script lives in app/bun/, so ../renderer resolves to app/renderer/.
    // Also copy the webview bridge preload and native dylib into their expected locations.
    copy: {
      "../dist": "renderer",
      "src/preload.js": "bun/preload.js",
      "src/libMacWindowEffects.dylib": "libMacWindowEffects.dylib",
    },
    mac: {
      codesign: true,
      notarize: true,
      defaultRenderer: "native",
      icons: "assets/appIcon.iconset",
      entitlements: {
        // JIT compiler support (required for Bun's JIT on hardened+notarized builds)
        "com.apple.security.cs.allow-jit": true,
        // Dynamic executable memory (required alongside allow-jit)
        "com.apple.security.cs.allow-unsigned-executable-memory": true,
        // Library validation disabled (required for third-party native binaries: whisper.cpp, sharp)
        "com.apple.security.cs.disable-library-validation": true,
        // Code-signing hardened runtime — allow dyld env vars (e.g. DYLD_INSERT_LIBRARIES)
        "com.apple.security.cs.allow-dyld-environment-variables": true,
        // Network access (API calls, local agent/gateway server)
        "com.apple.security.network.client": true,
        "com.apple.security.network.server": true,
        // File access for screenshots, user-selected files
        "com.apple.security.files.user-selected.read-write": true,
        // Hardware device access
        "com.apple.security.device.camera": true,
        "com.apple.security.device.microphone": true,
        // Screen recording (screencapture, retake/computer-use)
        "com.apple.security.device.screen-recording": true,
      },
    },
    linux: {
      bundleCEF: true,
      icon: "assets/appIcon.png",
    },
    win: {
      bundleCEF: true,
      icon: "assets/appIcon.ico",
    },
  },
  release: {
    baseUrl: "https://milady.ai/releases/",
    generatePatch: true,
  },
} satisfies ElectrobunConfig;
