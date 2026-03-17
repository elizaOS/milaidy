# Milady roadmap

High-level direction and rationale. Not exhaustive; see [CHANGELOG](../CHANGELOG.md) for shipped changes.

## Done (this cycle)

- **Node.js CI timeouts** — Use `useblacksmith/setup-node@v5` on Blacksmith (test.yml app-startup-e2e, electron-ui-e2e Linux); pin `actions/setup-node@v3` + `check-latest: false` everywhere else; add Bun global cache and `timeout-minutes` to test, release, nightly, benchmark-tests, publish-npm. **Why:** v4 timeouts from nodejs.org and slow post-action; Blacksmith’s colocated cache and v3 fix it. See `docs/build-and-release.md` "Node.js and Bun in CI: WHYs".
- **Release workflow hardening** — Strict shell (`bash -euo pipefail`) for fail-fast steps; retry loops for `bun install` with a final run so the step fails if all retries failed; crash dump uses `@electron/asar`; `find -print0` / `while IFS= read -r -d ''` for safe paths; DMG path via find+stat; node-gyp artifact removal before pack; size report includes milady-dist; single Capacitor build step; packaged DMG E2E uses 240s CDP timeout in CI and dumps stdout/stderr on timeout. **Why:** Reproducible builds, clear failures, and debuggable CI; see `docs/build-and-release.md` "Release workflow: design and WHYs".
- **Plugin resolution (NODE_PATH)** — Set `NODE_PATH` in three places so dynamic `import("@elizaos/plugin-*")` resolves from CLI (`run-node.mjs` child), direct eliza load (`eliza.ts` on load), and Electron (dev: walk up to find `node_modules`; packaged: ASAR `node_modules`). **Why:** Node does not search repo root when the entry is under `dist/` or cwd is a subdir; without this, "Cannot find module" broke coding-agent and others. See `docs/plugin-resolution-and-node-path.md`.
- **Electron startup resilience** — Keep API server up when runtime fails to load so the UI can show an error instead of "Failed to fetch". **Why:** A single missing native module (e.g. onnxruntime on Intel Mac) used to make the whole window dead with no explanation.
- **Intel Mac x64 DMG** — Release workflow runs install and Electron build under `arch -x86_64` for the macos-x64 artifact so native `.node` binaries are x64. **Why:** CI runs on arm64; without Rosetta we shipped arm64 binaries and Intel users got "Cannot find module .../darwin/x64/...".
- **Auto-derived plugin deps** — `copy-electron-plugins-and-deps.mjs` walks each @elizaos package's `package.json` dependencies instead of a curated list. **Why:** Curated lists missed new plugin deps and caused silent failures in packaged app; auto-walk stays correct as plugins change.
- **Regression tests for startup** — E2E tests assert keep-server-alive and eliza.js load-failure behavior. **Why:** A failing test prevents removal of the exception-handling guards better than docs alone.
- **Plugin resolution fix** — `NODE_PATH` set to repo root `node_modules` in `eliza.ts`, `run-node.mjs`, and `agent.ts` (Electron dev). **Why:** Dynamic `import("@elizaos/plugin-*")` from bundled `eliza.js` couldn't resolve packages at root; `NODE_PATH` tells Node where to look. No-op in packaged app (existsSync guard). See `docs/plugin-resolution-and-node-path.md`.
- **Bun exports patch** — Postinstall in `patch-deps.mjs` rewrites `@elizaos/plugin-coding-agent` (and any similar package) so `exports["."]` no longer has `"bun": "./src/index.ts"` when that file doesn't exist. **Why:** The published tarball only ships `dist/`; Bun picks the `"bun"` condition first and fails. Removing the dead condition lets Bun use `"import"` → `./dist/index.js`. See "Bun and published package exports" in `docs/plugin-resolution-and-node-path.md`.
- **Windows release: plugin-bnb-identity tsc** — Build script uses `npx -p typescript tsc` instead of `npx tsc`. **Why:** On Windows CI, `npx tsc` resolved to the joke package `tsc`; the prepare step failed. Explicit package fixes it.
- **Release size-report: SIGPIPE 141** — `du | sort | head` pipelines in the "Report packaged app size" step run in a subshell with `|| r=$?` and allow exit 141; `sort` stderr silenced. **Why:** Under `-euo pipefail`, 141 would exit the step before we could allow it; subshell captures it. See `docs/build-and-release.md`.
- **NFA routes: optional plugin** — `/api/nfa/status` and `/api/nfa/learnings` lazy-load `@miladyai/plugin-bnb-identity` and fall back when missing. **Why:** Core and tests work without the plugin; ambient type declaration keeps typecheck happy.

## Short-term / follow-ups

- **Upstream plugin hygiene** — Some plugins (e.g. `@elizaos/plugin-discord`) list `typescript` in `dependencies` instead of `devDependencies`; we skip it via `DEP_SKIP` to avoid bundle bloat. **Why:** Fixing upstream would reduce our skip list and keep plugin package.json correct.
- **Optional: filter bundled deps** — We intentionally copy all transitive deps (including ones tsdown may have inlined) because plugins can dynamic-require at runtime. **Why:** Excluding "likely bundled" deps would risk "Cannot find module" in packaged app. If we ever get static analysis of plugin dist/ to know what is never required at runtime, we could shrink the copy; not a priority.

## Longer-term

- **Desktop:** Universal/fat macOS binary (single .app with arm64+x64) is possible via `lipo` or electron-builder targets but adds build time and complexity; separate DMGs are acceptable for now.
- **CI:** Consider caching Electron/Node native rebuilds per arch to speed up release matrix.
