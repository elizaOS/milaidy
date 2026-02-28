# Plugin resolution: why NODE_PATH is needed

This doc explains **why** dynamic plugin imports fail without `NODE_PATH` and **how** we fix it across CLI, dev server, and Electron.

## The problem

The runtime (`src/runtime/eliza.ts`) loads plugins via dynamic import:

```ts
import("@elizaos/plugin-coding-agent")
```

Node resolves this by walking up from the **importing file's directory**. When eliza runs from different locations, resolution can fail:

| Entry point | Importing file location | Walks up from | Reaches root `node_modules`? |
|---|---|---|---|
| `bun run dev` | `src/runtime/eliza.ts` | `src/runtime/` | Usually yes (2 levels) |
| `milady start` (CLI) | `dist/runtime/eliza.js` | `dist/runtime/` | Usually yes (2 levels) |
| Electron dev | `milady-dist/eliza.js` | `apps/app/electron/milady-dist/` | **No** — walks into `apps/` |
| Electron packaged | `app.asar.unpacked/milady-dist/eliza.js` | Inside the `.app` bundle | **No** — different filesystem |

In the Electron cases (and sometimes the built dist case depending on bundler behavior), the walk never reaches the repo root where `@elizaos/plugin-*` packages are installed. The import fails with "Cannot find module".

## The fix: NODE_PATH

`NODE_PATH` is a Node.js environment variable that adds extra directories to module resolution. We set it in **three places** so every entry path resolves plugins:

### 1. `src/runtime/eliza.ts` (module-level)

```ts
const _repoRoot = path.resolve(_elizaDir, "..", "..");
const _rootModules = path.join(_repoRoot, "node_modules");
if (existsSync(_rootModules)) {
  process.env.NODE_PATH = ...;
  Module._initPaths();
}
```

**Why here:** Covers `bun run dev` (dev-server.ts imports eliza directly) and any other in-process import of eliza. The `existsSync` guard means this is a no-op in packaged apps where the repo root doesn't exist.

### 2. `scripts/run-node.mjs` (child process env)

```js
const rootModules = path.join(cwd, "node_modules");
env.NODE_PATH = ...;
```

**Why here:** The CLI runner spawns a child process that runs `milady.mjs` → `dist/entry.js` → `dist/eliza.js`. Setting `NODE_PATH` in the child's env ensures the child resolves from root even though `dist/` doesn't have its own `node_modules`.

### 3. `apps/app/electron/src/native/agent.ts` (Electron main process)

```ts
// Dev: walk up from __dirname to find node_modules
// Packaged: use ASAR node_modules
```

**Why here:** The Electron main process loads `milady-dist/eliza.js` via `dynamicImport()`. In dev mode, `__dirname` is deep inside `apps/app/electron/build/src/native/` — we walk up to find the first `node_modules` directory (the monorepo root). In packaged mode, we use the ASAR's `node_modules` instead.

## Why not just use the bundler?

tsdown with `noExternal: [/.*/]` inlines most dependencies, but `@elizaos/plugin-*` packages are loaded via **runtime dynamic import** (the plugin name comes from config, not a static import). The bundler can't inline them because it doesn't know which plugins will be loaded. They must be resolvable at runtime.

## Packaged app: no-op

In the packaged `.app`, `eliza.js` lives at `app.asar.unpacked/milady-dist/eliza.js`. Two levels up is `Contents/Resources/` — no `node_modules` there. The `existsSync` check in `eliza.ts` returns false, so the NODE_PATH code is skipped entirely. The packaged app uses `copy-electron-plugins-and-deps.mjs` to copy plugins into `milady-dist/node_modules` and sets ASAR `node_modules` on `NODE_PATH` in `agent.ts`. No change to packaged behavior.
