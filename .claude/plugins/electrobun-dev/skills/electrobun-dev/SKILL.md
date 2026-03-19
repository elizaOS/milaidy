---
name: Electrobun Dev
description: Use when running Electrobun in development mode — electrobun dev, --watch flag, hot reload, CEF devtools, debugging the renderer, or understanding the dev build cycle.
version: 1.0.0
---

# Electrobun Dev Mode

## Commands

```bash
electrobun dev          # build (dev env) once, then launch app
electrobun dev --watch  # build, launch, then watch for changes and rebuild+relaunch
```

Shorthand via package.json (standard templates):
```bash
bun start               # → electrobun dev
bun run dev             # → electrobun dev --watch
```

## What Happens on `electrobun dev`

1. Reads `electrobun.config.ts`
2. Downloads any missing native binaries (Bun, launcher, WGPU/CEF if configured)
3. Bundles `build.bun.entrypoint` via `Bun.build()` in dev mode (no minify, sourcemaps inline)
4. Bundles each `build.views.*` entrypoint
5. Copies `build.copy` files to build output
6. Skips codesign and notarization
7. Writes app bundle to `build/dev-<os>-<arch>/`
8. Launches the app, streaming stdout/stderr to your terminal

## Watch Mode (`--watch`)

After initial build+launch, watch mode monitors:
- Dir containing `build.bun.entrypoint`
- Dir(s) containing each `build.views.*` entrypoint
- Dirs listed in `build.watch` (extra paths)
- Dirs of files listed in `build.copy`

**Debounce:** 300ms — rapid saves are coalesced into one rebuild.

**Ignored automatically:** `build/`, `artifacts/`, `node_modules/`, and patterns in `build.watchIgnore`.

**On change:** kills running app → rebuilds → relaunches.

### Extra watch paths

```typescript
// electrobun.config.ts
build: {
  watch: ["src/shared/", "assets/"],
  watchIgnore: ["src/**/*.test.ts", "src/**/*.spec.ts"],
}
```

## CEF DevTools (Chromium inspector)

When using `renderer: "cef"` or `defaultRenderer: "cef"`, the CEF renderer exposes Chrome DevTools at:

```
http://localhost:9222
```

Open in any Chrome/Chromium browser while the app is running. Lists all active renderer pages — click to inspect.

Note: DevTools are only available in `dev` builds. They are not exposed in `canary` or `stable`.

## Native WebView Debugging (macOS)

For `renderer: "native"` (WKWebView), enable the developer extras:

```typescript
// In src/bun/index.ts — call openDevTools() on the BrowserView instance
const view = new BrowserView({ ... });
view.openDevTools();  // Opens Safari Web Inspector (uses private WKWebView _inspector API)
```

Or in Safari: Develop → [Your App] → [webview name]

## Debugging Tips

1. **Console output**: All `console.log` from bun-side code appears in the terminal. Renderer-side `console.log` only appears in devtools (not terminal).
2. **RPC tracing**: Add `console.log` to request/message handlers to trace cross-process calls.
3. **Source maps**: Dev builds include inline source maps. Stack traces point to `.ts` source lines.
4. **Slow reload?** Add only changed dirs to `build.watch` rather than broad patterns.
5. **App not relaunching?** If the app process is holding a file lock, kill it manually: `pkill -f "<AppName>"`

## Build Output (dev)

```
build/dev-macos-arm64/
└── <AppName>-dev.app/
    └── Contents/
        ├── MacOS/
        │   ├── launcher          # native launcher
        │   └── main.js           # bundled bun entrypoint
        ├── Resources/
        │   ├── <viewname>/       # bundled renderer
        │   └── bun               # bun runtime binary
        └── Info.plist
```
