# Milady roadmap

High-level direction and rationale. Not exhaustive; see [CHANGELOG](../CHANGELOG.md) for shipped changes.

## Done (this cycle)

- **Plugin resolution (NODE_PATH)** — Set `NODE_PATH` in three places so dynamic `import("@elizaos/plugin-*")` resolves from CLI (`run-node.mjs` child), direct eliza load (`eliza.ts` on load), and Electron (dev: walk up to find `node_modules`; packaged: ASAR `node_modules`). **Why:** Node does not search repo root when the entry is under `dist/` or cwd is a subdir; without this, "Cannot find module" broke coding-agent and others. See `docs/plugin-resolution-and-node-path.md`.
- **Electron startup resilience** — Keep API server up when runtime fails to load so the UI can show an error instead of "Failed to fetch". **Why:** A single missing native module (e.g. onnxruntime on Intel Mac) used to make the whole window dead with no explanation.
- **Intel Mac x64 DMG** — Release workflow runs install and Electron build under `arch -x86_64` for the macos-x64 artifact so native `.node` binaries are x64. **Why:** CI runs on arm64; without Rosetta we shipped arm64 binaries and Intel users got "Cannot find module .../darwin/x64/...".
- **Auto-derived plugin deps** — `copy-electron-plugins-and-deps.mjs` walks each @elizaos package's `package.json` dependencies instead of a curated list. **Why:** Curated lists missed new plugin deps and caused silent failures in packaged app; auto-walk stays correct as plugins change.
- **Regression tests for startup** — E2E tests assert keep-server-alive and eliza.js load-failure behavior. **Why:** A failing test prevents removal of the exception-handling guards better than docs alone.
- **Plugin resolution fix** — `NODE_PATH` set to repo root `node_modules` in `eliza.ts`, `run-node.mjs`, and `agent.ts` (Electron dev). **Why:** Dynamic `import("@elizaos/plugin-*")` from bundled `eliza.js` couldn't resolve packages at root; `NODE_PATH` tells Node where to look. No-op in packaged app (existsSync guard). See `docs/plugin-resolution-and-node-path.md`.
- **Bun exports patch** — Postinstall in `patch-deps.mjs` rewrites `@elizaos/plugin-coding-agent` (and any similar package) so `exports["."]` no longer has `"bun": "./src/index.ts"` when that file doesn't exist. **Why:** The published tarball only ships `dist/`; Bun picks the `"bun"` condition first and fails. Removing the dead condition lets Bun use `"import"` → `./dist/index.js`. See "Bun and published package exports" in `docs/plugin-resolution-and-node-path.md`.

## Short-term / follow-ups

- **Upstream plugin hygiene** — Some plugins (e.g. `@elizaos/plugin-discord`) list `typescript` in `dependencies` instead of `devDependencies`; we skip it via `DEP_SKIP` to avoid bundle bloat. **Why:** Fixing upstream would reduce our skip list and keep plugin package.json correct.
- **Optional: filter bundled deps** — We intentionally copy all transitive deps (including ones tsdown may have inlined) because plugins can dynamic-require at runtime. **Why:** Excluding "likely bundled" deps would risk "Cannot find module" in packaged app. If we ever get static analysis of plugin dist/ to know what is never required at runtime, we could shrink the copy; not a priority.

## Longer-term

- **Desktop:** Universal/fat macOS binary (single .app with arm64+x64) is possible via `lipo` or electron-builder targets but adds build time and complexity; separate DMGs are acceptable for now.
- **CI:** Consider caching Electron/Node native rebuilds per arch to speed up release matrix.
