# Jeju plugin — updating after pulling latest `develop`

Your fork’s **`origin/develop` is ~200+ commits ahead** of the commit you’re on. The layout changed: most of what we edited locally now lives **under packages**, not under `apps/app/src` / monolithic `src/api/server.ts`.

## What moved upstream (vs your uncommitted work)

| Your local changes (old layout) | Where it lives on latest `develop` |
|---------------------------------|-------------------------------------|
| `src/api/server.ts` (Jeju API, plugin catalog, test) | **`packages/autonomous/src/api/server.ts`** (`src/api/server.ts` is only `export * from "@miladyai/autonomous/api/server"`) |
| `src/runtime/eliza.ts` (OPTIONAL_PLUGIN_MAP `jeju`, disable override) | **`packages/autonomous/src/runtime/eliza.ts`** (`src/runtime/eliza.ts` re-exports autonomous) |
| `src/runtime/eliza.test.ts` (Jeju collectPluginNames tests) | **`packages/autonomous/src/runtime/eliza.test.ts`** (or equivalent test file in that package) |
| `apps/app/src/components/PluginsView.tsx` | **`packages/app-core/src/components/PluginsView.tsx`** (file removed from `apps/app`) |
| `apps/app/src/components/JejuPluginPanel.tsx` | Add as **`packages/app-core/src/components/JejuPluginPanel.tsx`** and import from `PluginsView` there |
| `src/plugins/jeju/*` | **Keep at repo root** `src/plugins/jeju/` — still built via root `tsdown.config.ts` |
| `tsdown.config.ts` (Jeju entry) | Same file at repo root — add Jeju entry next to WhatsApp |

Upstream does **not** include Jeju yet (only your fork will have it until merged).

## Git workflow (you have uncommitted changes)

`git fetch` is safe with a dirty tree. **Merge/pull needs a clean tree.**

1. **Save your work on a branch (recommended)**

   ```bash
   git checkout -b jeju-wip
   git add -A
   git status   # sanity check
   git commit -m "wip: Jeju/Bazaar plugin (pre-upstream merge)"
   ```

2. **Update `develop` and merge**

   ```bash
   git checkout develop
   git fetch origin develop
   git merge origin/develop
   ```

   Expect conflicts in any file both sides touched (`bun.lock`, etc.). Resolve those first.

3. **Bring Jeju commits onto updated `develop`**

   ```bash
   git merge jeju-wip
   ```

   You will get conflicts because upstream **deleted** `apps/app/src/components/PluginsView.tsx` and **replaced** huge `server.ts` / `eliza.ts` stubs. **Do not try to keep the old monolithic files** — resolve by taking upstream versions, then re-apply Jeju in the **autonomous** + **app-core** files below.

4. **Re-apply Jeju by file (after conflicts resolved)**

   - Copy or re-merge logic from your `jeju-wip` commit into:
     - `packages/autonomous/src/api/server.ts` — `buildBundledJejuPluginEntry`, Jeju in `discoverPluginsFromManifest`, `GET /api/jeju/status`, `POST .../jeju/test` (console.log lines), `MILADY_BUNDLED_PLUGIN_PACKAGE` for PUT.
     - `packages/autonomous/src/runtime/eliza.ts` — `jeju` in `OPTIONAL_PLUGIN_MAP`, `isPluginExplicitlyDisabled` cleanup for `@milady/plugin-jeju`.
     - `packages/autonomous/src/runtime/eliza.test.ts` — Jeju `collectPluginNames` tests.
     - `packages/app-core/src/components/PluginsView.tsx` — Landmark icon, `jeju` subgroup, `handleTestConnection` + toasts, Test button for `jeju` when enabled, game-modal test UI, `<JejuPluginPanel />` for `p.id === "jeju"`.
     - `packages/app-core/src/components/JejuPluginPanel.tsx` — new file (same as your panel; fix imports to `@miladyai/ui` / app-core `client` / `useApp` paths).
   - Root `tsdown.config.ts` — second plugin block for `src/plugins/jeju/index.ts` → `dist/plugins/jeju`.
   - Ensure `src/plugins/jeju/**` is committed.

5. **Verify**

   - `bun run build` (when you choose to build).
   - Enable Jeju in dashboard, Test connection → terminal should log full wallet.
   - Chat: `JEJU_STATUS` / `JEJU_SWAP`.

## Quick reference: Jeju integration points

- **Plugin load:** `@milady/plugin-jeju` → `dist/plugins/jeju/index.js` (same as WhatsApp pattern).
- **Dashboard listing:** `buildBundledJejuPluginEntry()` in autonomous `server.ts` (no `npmName` → no bogus Install).
- **RPC test:** autonomous `server.ts` `POST /api/plugins/jeju/test` + `console.log` for terminal.

If you want this repo to stay identical to upstream except Jeju, keep Jeju changes minimal and isolated to the files above.
