---
name: electrobun-init
description: Scaffold a new Electrobun desktop app project from scratch. Creates full directory structure, package.json, electrobun.config.ts, tsconfig.json, and entry point files. Includes all 18 official templates.
---

Scaffold a new Electrobun project.

## Steps

1. **Ask the user** for:
   - App name (e.g. `my-app`)
   - App identifier in reverse DNS format (e.g. `com.example.myapp`)

2. **Ask which template** — present this picker:

   **Minimal / Learning:**
   - `hello-world` — Minimal starter, simplest possible Electrobun app
   - `bunny` — Demo/mascot app, visual showcase

   **UI Frameworks:**
   - `svelte` — Svelte frontend
   - `vue` — Vue 3 frontend
   - `solid` — SolidJS frontend
   - `angular` — Angular frontend
   - `react-tailwind-vite` — React + Tailwind CSS, Vite bundler
   - `tailwind-vanilla` — No framework, Tailwind CSS
   - `vanilla-vite` — No framework, Vite bundler

   **App Patterns:**
   - `multi-window` — Multiple independent windows
   - `tray-app` — Menu bar / system tray app, no main window
   - `notes-app` — CRUD notes app with local storage
   - `sqlite-crud` — SQLite database CRUD
   - `photo-booth` — Camera capture and media handling

   **Browser / Multi-tab:**
   - `multitab-browser` — Multi-tab browser shell with navigation

   **3D / Graphics:**
   - `wgpu-threejs` — Three.js 3D scene on native WebGPU
   - `wgpu` — Native GPU rendering with Dawn/WebGPU (no webview)
   - `wgpu-mlp` — WebGPU neural network inference
   - `wgpu-babylon` — BabylonJS on WebGPU

3. **Run init:**
   ```bash
   electrobun init <name> --template=<template>
   ```

4. **Post-init steps:**
   ```bash
   cd <name>
   bun install
   ```

5. **Update config** — Edit `electrobun.config.ts`:
   - Set `app.name`, `app.identifier`, `app.version`
   - For GPU templates (`wgpu`, `wgpu-mlp`, `wgpu-babylon`, `wgpu-threejs`): confirm `bundleWGPU: true` per platform
   - For CEF templates: confirm `bundleCEF: true` per platform

6. **Verify it runs:**
   ```bash
   bun start
   ```
   Expected: App window appears.

7. **Tell the user** the project is ready and suggest: "Run `/electrobun-workflow` to see the full development pipeline from here."
