---
name: Electrobun Config
description: The complete electrobun.config.ts field reference. Use when editing config, looking up a specific option, understanding defaults, or configuring platform-specific behaviour.
version: 1.0.0
---

# electrobun.config.ts — Complete Reference

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {

  // ── App identity ────────────────────────────────────────────────────────
  app: {
    name: "MyApp",                    // Display name (default: "MyApp")
    identifier: "com.example.myapp", // Reverse DNS bundle ID (REQUIRED, must be unique)
    version: "0.1.0",                // Semver — bump for each release
    description: "My app",           // Used in Linux .desktop file
    urlSchemes: ["myapp"],           // Deep link schemes: myapp:// (macOS only currently)
  },

  // ── Build ────────────────────────────────────────────────────────────────
  build: {

    // Output directories
    buildFolder: "build",            // Where built apps go (default: "build")
    artifactFolder: "artifacts",     // Where release artifacts go (default: "artifacts")
    targets: "current",              // Target platforms; "current" = host platform (default: "current")

    // Bun main process bundle
    bun: {
      entrypoint: "src/bun/index.ts",  // Main process entry (default: "src/bun/index.ts")
      minify: false,                   // Any Bun.build() options work here
      sourcemap: "inline",
      define: { "process.env.NODE_ENV": '"development"' },
    },

    // Renderer (browser-side) bundles — one per BrowserView with a TS entrypoint
    views: {
      mainview: { entrypoint: "src/mainview/index.ts" },
      sidebar:  { entrypoint: "src/sidebar/index.ts" },
      // Each key becomes a URL scheme: mainview://index.html
    },

    // Static file copies — key: source path, value: dest path in bundle Resources
    copy: {
      "assets/": "assets/",
      "data/schema.sql": "data/schema.sql",
    },

    // ASAR archive (packs Resources into a single file — reduces file count)
    useAsar: false,                  // default: false
    asarUnpack: ["*.node", "*.dll", "*.dylib", "*.so"],  // default — native libs always unpacked

    // Version overrides (pin runtime versions — test thoroughly before use)
    cefVersion: undefined,           // e.g. "CEF_128+chromium-128.0.6613.84"
    wgpuVersion: undefined,          // e.g. "0.2.3"
    bunVersion: undefined,           // e.g. "1.4.2"

    // Locale trimming — reduces CEF bundle size on Linux/Windows
    locales: "*",                    // "*" = all locales; ["en", "de"] = only those

    // Watch mode extras
    watch: [],                       // Additional paths to watch in `dev --watch`
    watchIgnore: [],                 // Glob patterns to ignore in watch mode

    // ── Platform: macOS ───────────────────────────────────────────────────
    mac: {
      bundleCEF: false,              // Use CEF instead of WKWebView (adds ~120MB)
      bundleWGPU: false,             // Bundle Dawn for GpuWindow (adds ~8MB)
      defaultRenderer: "native",    // "native" (WKWebView) | "cef" (Chromium)
      codesign: false,               // Enable codesign (requires ELECTROBUN_DEVELOPER_ID)
      notarize: false,               // Enable notarization (requires Apple creds env vars)
      icons: "icon.iconset",         // Path to .iconset folder (must contain icon_1024x1024.png)
      entitlements: {                // Hardened runtime entitlements
        "com.apple.security.cs.allow-jit": true,
        "com.apple.security.cs.allow-unsigned-executable-memory": true,
      },
      chromiumFlags: {               // CEF Chromium flags (CEF only)
        "disable-web-security": true,
        "allow-running-insecure-content": true,
      },
    },

    // ── Platform: Windows ─────────────────────────────────────────────────
    win: {
      bundleCEF: false,
      bundleWGPU: false,
      defaultRenderer: "native",    // "native" (WebView2) | "cef"
      icon: "assets/icon.ico",      // .ico file path
      chromiumFlags: {},
    },

    // ── Platform: Linux ───────────────────────────────────────────────────
    linux: {
      bundleCEF: false,
      bundleWGPU: false,
      defaultRenderer: "native",    // "native" (GTKWebKit) | "cef"
      icon: "assets/icon.png",      // .png file path
      chromiumFlags: {},
    },
  },

  // ── Runtime config ───────────────────────────────────────────────────────
  runtime: {
    exitOnLastWindowClosed: true,   // Quit app when last window closes (default: true)
    // Any additional keys are accessible via BuildConfig at runtime
    apiEndpoint: "https://api.example.com",
  },

  // ── Build lifecycle hooks ─────────────────────────────────────────────────
  scripts: {
    preBuild: "bun run scripts/pre-build.ts",   // Runs before bundling
    postBuild: "bun run scripts/post-build.ts", // Runs after bundle, before codesign
    postWrap: "echo Done wrapping",              // Runs after .app is assembled
    postPackage: "bun run scripts/upload.ts",    // Runs after DMG/installer created
  },

  // ── Release / auto-update ─────────────────────────────────────────────────
  release: {
    baseUrl: "https://cdn.example.com/releases/myapp",
    generatePatch: true,            // Generate bsdiff patch (default: true)
  },

} satisfies ElectrobunConfig;
```

## Most-Changed Fields by Task

**Starting a new project:** `app.name`, `app.identifier`, `app.version`

**Adding a new renderer view:** `build.views.<viewname>`

**Enabling GPU rendering:** `build.mac.bundleWGPU: true` (all platforms you target)

**Enabling CEF:** `build.mac.bundleCEF: true`, `build.mac.defaultRenderer: "cef"`

**Setting up releases:** `release.baseUrl`, `release.generatePatch: true`

**Code signing:** `build.mac.codesign: true`, `build.mac.notarize: true`, set env vars

**Adding static assets:** `build.copy`

**Deep linking:** `app.urlSchemes`
