---
name: Electrobun Core
description: Use when working on any Electrobun desktop app — BrowserWindow, BrowserView, events, app lifecycle, ApplicationMenu, Tray, and electrobun.config.ts. Activates automatically when editing Electrobun project files.
version: 1.0.0
---

# Electrobun Core Patterns

Electrobun is a cross-platform desktop app framework (macOS/Windows/Linux) using Bun as runtime and a native system webview (or CEF) as renderer. The bun process and renderer run as separate processes; they communicate via RPC (see electrobun-rpc skill).

## Project Structure

```
src/
├── bun/          # Main process (Bun side)
│   └── index.ts  # Entry point
└── mainview/     # Renderer process
    ├── index.html
    ├── index.css
    └── index.ts
```

## electrobun.config.ts

```typescript
import { defineConfig } from "electrobun/config";

export default defineConfig({
  app: {
    name: "MyApp",
    identifier: "com.example.myapp",
    version: "1.0.0",
    urlSchemes: ["myapp"], // enables myapp:// deep links
  },
  build: {
    bun: { entrypoint: "src/bun/index.ts" },
    views: {
      mainview: { entrypoint: "src/mainview/index.ts" },
    },
    mac: {
      bundleWGPU: false,
      bundleCEF: false,
      defaultRenderer: "native", // or "cef"
      codesign: true,
      notarize: true,
      icons: "assets/icon.icns",
    },
    win: { bundleWGPU: false, bundleCEF: false, icon: "assets/icon.ico" },
    linux: { bundleWGPU: false, bundleCEF: false },
    copy: { "assets/": "assets/" },
  },
  runtime: { exitOnLastWindowClosed: true },
  scripts: {
    preBuild: "bun run generate-assets.ts",
    postBuild: "echo Build complete",
  },
  release: {
    baseUrl: "https://releases.example.com/myapp",
    generatePatch: true,
  },
});
```

## BrowserWindow

```typescript
import { BrowserWindow } from "electrobun/bun";

const win = new BrowserWindow({
  title: "My App",
  frame: { x: 100, y: 100, width: 1200, height: 800 },
  url: "http://localhost:3000",        // OR
  html: "<h1>Hello</h1>",             // inline HTML
  preload: "src/mainview/preload.ts",  // injected before content
  renderer: "native",                  // "native" | "cef"
  titleBarStyle: "hiddenInset",        // "default" | "hidden" | "hiddenInset"
  transparent: false,
  sandbox: false,                      // true = no RPC, limited events
});
```

The primary webview is `win.webview` (a BrowserView instance).

## BrowserView (additional views)

```typescript
import { BrowserView } from "electrobun/bun";

const sidebar = new BrowserView({
  url: "src/sidebar/index.html",
  frame: { x: 0, y: 0, width: 300, height: 800 },
  renderer: "native",
  rpc: sidebarRPC,
  navigationRules: {
    allowedUrls: ["http://localhost:*"],
    deniedUrls: ["*"],
  },
});

win.addBrowserView(sidebar);
```

Each BrowserView is a separate renderer process.

## Events

```typescript
import { Electrobun } from "electrobun/bun";

Electrobun.events.on("open-url", (e) => {
  console.log("Deep link:", e.data.url);
});

Electrobun.events.on("application-menu-clicked", (e) => {
  const { action, role } = e.data;
  win.webview.rpc?.send.menuAction({ action, role });
});

win.on("close", () => { /* window closed */ });
win.webview.on("dom-ready", () => { /* safe to interact with page */ });
win.webview.on("will-navigate", (e) => { /* can cancel navigation */ });
win.webview.on("did-navigate", (e) => { /* navigation complete */ });
win.webview.on("page-title-updated", (e) => { /* title changed */ });
```

## ApplicationMenu

```typescript
import { ApplicationMenu } from "electrobun/bun";

ApplicationMenu.setMenu([
  {
    label: "File",
    submenu: [
      { label: "New", action: "file-new", accelerator: "CmdOrCtrl+N" },
      { label: "Open", action: "file-open", accelerator: "CmdOrCtrl+O" },
      { type: "separator" },
      { label: "Quit", role: "quit" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { label: "Undo", role: "undo" },
      { label: "Redo", role: "redo" },
      { type: "separator" },
      { label: "Cut", role: "cut" },
      { label: "Copy", role: "copy" },
      { label: "Paste", role: "paste" },
    ],
  },
]);
```

## Tray

```typescript
import { Tray } from "electrobun/bun";

const tray = new Tray({
  icon: "assets/tray-icon.png",
  tooltip: "My App",
});

tray.setMenu([
  { label: "Show", action: "tray-show" },
  { label: "Quit", role: "quit" },
]);
// Note: tray click events do NOT fire on Linux (AppIndicator limitation)
```

## Platform Quirks

- **Linux**: ApplicationMenu renders as app menu bar. Tray click events don't fire with AppIndicator.
- **Windows**: `titleBarStyle: "hiddenInset"` has no effect — use `"hidden"`.
- **macOS**: Full native feel. All APIs work as documented.
- **CEF renderer**: Requires `bundleCEF: true` in config; adds ~120MB to bundle size.

## CLI Commands

```bash
bunx electrobun init            # Scaffold new project
electrobun dev                  # Dev mode
electrobun dev --watch          # Dev with hot reload
electrobun build                # Production build
electrobun build --env=canary   # Canary build
electrobun run                  # Run built app
```
