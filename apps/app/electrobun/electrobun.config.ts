import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Milady",
    identifier: "com.miladyai.milady",
    version: "2.0.0-alpha.84",
    urlSchemes: ["milady"],
  },
  runtime: {
    exitOnLastWindowClosed: false,
  },
  scripts: {
    // Sign native code inside milady-dist/node_modules on the inner app bundle
    // before Electrobun runs platform signing and the staged artifact flow
    // performs the final notarization/stapling pass.
    postBuild: "scripts/postwrap-sign-runtime-macos.ts",
    // Capture wrapper-bundle binary metadata after the self-extractor is created.
    postWrap: "scripts/postwrap-diagnostics.ts",
  },
  build: {
    bun: {
      entrypoint: "src/index.ts",
    },
    views: {},
    // Milady intentionally supports both desktop WebGPU paths:
    // 1. renderer-webview WebGPU (`three/webgpu` via browser `navigator.gpu`)
    // 2. Electrobun-native Dawn for Bun-side GpuWindow / <electrobun-wgpu>
    //    surfaces and future native compute workloads.
    // Copy the Vite-built renderer (apps/app/dist/) into the bundle as renderer/.
    // The Bun main script lives in app/bun/, so ../renderer resolves to app/renderer/.
    // Also copy the webview bridge preload and native dylib into their expected locations.
    copy: {
      "../dist": "renderer",
      "src/preload.js": "bun/preload.js",
      // ElizaOS backend server bundle (tsdown output from repo root dist/).
      // agent.ts walks up from import.meta.dir looking for milady-dist/ to spawn eliza.js.
      // Paths are relative to apps/app/electrobun/ (where electrobun build is run).
      "../../../dist": "milady-dist",
      // libMacWindowEffects.dylib is macOS-only — only copy when building on macOS.
      // On Windows/Linux this file does not exist and the copy would fail the build.
      ...(process.platform === "darwin"
        ? { "src/libMacWindowEffects.dylib": "libMacWindowEffects.dylib" }
        : {}),
    },
    mac: {
      bundleWGPU: true,
      codesign: process.env.ELECTROBUN_SKIP_CODESIGN !== "1",
      notarize:
        process.env.ELECTROBUN_SKIP_CODESIGN !== "1" &&
        process.env.MILADY_ELECTROBUN_NOTARIZE !== "0",
      defaultRenderer: "native",
      icons: "assets/appIcon.iconset",
      entitlements: {
        // JIT compiler support (required for Bun's JIT on hardened+notarized builds)
        "com.apple.security.cs.allow-jit": true,
        // Dynamic executable memory (required alongside allow-jit)
        "com.apple.security.cs.allow-unsigned-executable-memory": true,
        // Library validation disabled (required for third-party native binaries: whisper.cpp, sharp)
        // This also covers unsigned dylib loading — allow-dyld-environment-variables is not needed.
        "com.apple.security.cs.disable-library-validation": true,
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
      bundleWGPU: true,
      defaultRenderer: "cef",
      icon: "assets/appIcon.png",
    },
    win: {
      bundleCEF: true,
      bundleWGPU: true,
      defaultRenderer: "cef",
      icon: "assets/appIcon.ico",
    },
  },
  release: {
    baseUrl: "https://milady.ai/releases/",
    generatePatch: true,
  },
} satisfies ElectrobunConfig;
