# Eliza Core Eject System — Design Plan

## Problem

`@elizaos/core` is consumed as an npm package (`"next"` tag, currently `2.0.0-alpha.10`). The package ships dist-only (110K line bundle, no source). This means:

1. **milaidy cannot patch core bugs** without waiting for upstream releases
2. **milaidy cannot experiment** with runtime/memory/service changes
3. **The agent cannot modify its own framework** — a key goal for self-improving agents

## Solution: Core Source Eject

Similar to the plugin eject system (PR #300), add the ability to "eject" `@elizaos/core` (and potentially other `@elizaos/*` packages) from npm into a local source checkout that milaidy builds and loads instead.

## Architecture

### Directory Structure

```
~/.milady/
  core/                          # Ejected core lives here
    eliza/                       # Git clone of elizaos/eliza monorepo
      packages/
        core/                    # The actual @elizaos/core source
          src/
          dist/                  # Built output
          package.json
        ...                      # Other packages in the monorepo
      .git/
    .upstream.json               # Tracking metadata (same schema as plugin eject)
```

### Why Clone the Full Monorepo?

The `@elizaos/core` package lives in `packages/core/` within the `elizaos/eliza` monorepo. It has internal workspace dependencies (e.g., `@elizaos/plugin-bootstrap`, `@elizaos/service-interfaces`). Cloning just `packages/core/` would break the build. The full monorepo clone ensures:

- Build toolchain works (pnpm workspace, turbo)
- Internal deps resolve correctly
- We can eject other `@elizaos/*` packages later without re-cloning

### Loading Priority (Updated)

Current plugin loading priority in `resolvePlugins()`:
1. Ejected plugins (`~/.milady/plugins/ejected/`)
2. Official npm (with repair logic)
3. User-installed (`~/.milady/plugins/installed/`)
4. `@milaidy/plugin-*` local
5. npm fallback

For core, we need a **separate mechanism** — core isn't a "plugin", it's a dependency imported everywhere via `import { ... } from "@elizaos/core"`. Options:

#### Option A: TypeScript Path Mapping (Recommended)
Add a `paths` entry in `tsconfig.json` at build time:
```json
{
  "compilerOptions": {
    "paths": {
      "@elizaos/core": ["~/.milady/core/eliza/packages/core/dist"]
    }
  }
}
```
Plus configure the bundler (`tsdown`) to resolve this alias. At runtime, the built milaidy bundle would import from the ejected core's dist instead of `node_modules`.

#### Option B: npm/bun Link
Run `bun link` or `npm link` to symlink the ejected core's built output into `node_modules/@elizaos/core`. Simpler but fragile (survives `bun install` poorly).

#### Option C: Package.json Overrides
Use bun's `overrides` or npm's `overrides` field:
```json
{
  "overrides": {
    "@elizaos/core": "file:../../.milady/core/eliza/packages/core"
  }
}
```
This is clean but modifies `package.json` in the repo.

**Recommendation: Option A** for build-time resolution (clean, no repo file changes needed beyond a generated tsconfig extends). **Option B as fallback** if the bundler doesn't cooperate.

### Implementation Plan

#### 1. `src/services/core-eject.ts` — Core eject service

Functions:
- **`ejectCore()`** — Clone `elizaos/eliza` monorepo, checkout correct branch/tag, install deps, build `packages/core`, create `.upstream.json`, configure path override
- **`syncCore()`** — `git fetch` + `git merge` on the ejected monorepo, rebuild, report conflicts
- **`reinjectCore()`** — Remove ejected core, restore npm resolution
- **`getCoreStatus()`** — Return current state (ejected vs npm, version, commit, pending changes)

Serialization: Same promise-chain pattern as `plugin-eject.ts`.

`.upstream.json` schema (reuse `milaidy-upstream-v1`):
```json
{
  "$schema": "milaidy-upstream-v1",
  "source": "github:elizaos/eliza",
  "gitUrl": "https://github.com/elizaos/eliza.git",
  "branch": "develop",
  "commitHash": "<sha>",
  "ejectedAt": "<iso>",
  "npmPackage": "@elizaos/core",
  "npmVersion": "2.0.0-alpha.10",
  "lastSyncAt": null,
  "localCommits": 0
}
```

#### 2. Build Integration

When ejected core exists:
- `scripts/run-node.mjs` (the build orchestrator) checks for `~/.milady/core/eliza/packages/core/dist/`
- If present, generates a `tsconfig.eject-overrides.json` that extends the main `tsconfig.json` with path mappings
- `tsdown` config reads from this override
- The built milaidy bundle imports from ejected core instead of npm

When not ejected:
- No override file exists, normal npm resolution

#### 3. Agent Actions

Add to `src/runtime/milaidy-plugin.ts`:
- `EJECT_CORE` — Triggers `ejectCore()` 
- `SYNC_CORE` — Triggers `syncCore()`
- `REINJECT_CORE` — Triggers `reinjectCore()`
- `CORE_STATUS` — Returns `getCoreStatus()`

#### 4. Runtime Detection

In `src/runtime/eliza.ts`, on startup:
- Check if ejected core exists at `~/.milady/core/eliza/packages/core/dist/`
- Log whether running from ejected source or npm
- Validate version compatibility (ejected core version vs expected)

#### 5. API Endpoint

`GET /api/core/status` — Returns ejection status, version info, local changes count.

### Build Considerations

The eliza monorepo uses:
- **pnpm** as package manager
- **turbo** for build orchestration  
- **tsup** for core package bundling

`ejectCore()` needs to:
1. `git clone --depth 50 --branch develop https://github.com/elizaos/eliza.git`
2. `cd eliza && pnpm install`
3. `cd packages/core && pnpm build` (or `turbo build --filter=@elizaos/core`)
4. Verify `packages/core/dist/` exists with valid exports

### Edge Cases

- **Version drift**: Ejected core is on `develop` (bleeding edge) while milaidy expects `2.0.0-alpha.10`. Type mismatches possible. Mitigation: `syncCore()` warns about breaking changes, user can pin to a tag.
- **Monorepo size**: Full clone is ~200MB+. Use `--depth 50` for shallow clone. `syncCore()` may need to unshallow.
- **Build failures**: Same pattern as plugin eject — `ejectCore()` cleans up on build failure, `syncCore()` returns structured error.
- **Multiple @elizaos packages**: If milaidy also imports `@elizaos/plugin-bootstrap` etc., those resolve from the monorepo too. Path mappings should cover all used `@elizaos/*` packages.

### Scope for v1

1. `ejectCore()` / `syncCore()` / `reinjectCore()` / `getCoreStatus()`
2. 4 agent actions
3. Build-time path override (tsconfig + tsdown config)
4. Startup detection + logging
5. API endpoint
6. Unit tests (same coverage target as plugin-eject: ~85%+)

### Out of Scope (v2)

- Ejecting other `@elizaos/*` packages individually (e.g., `@elizaos/plugin-bootstrap`)
- Auto-sync on upstream release
- Visual diff of local changes vs upstream
- PR generation from ejected changes

## Files to Create/Modify

**Create:**
- `src/services/core-eject.ts` — Main service (~400-600 lines)
- `src/services/core-eject.test.ts` — Unit tests (~400-500 lines)
- `src/actions/eject-core.ts` — Action wrapper
- `src/actions/sync-core.ts` — Action wrapper
- `src/actions/reinject-core.ts` — Action wrapper
- `src/actions/core-status.ts` — Action wrapper
- `docs/CORE_EJECT.md` — Dev docs (brief, not a stale plan)

**Modify:**
- `src/runtime/milaidy-plugin.ts` — Register 4 new actions
- `src/runtime/eliza.ts` — Startup detection of ejected core
- `src/api/server.ts` — `GET /api/core/status` endpoint
- `tsdown.config.ts` — Conditional path alias when ejected core detected
- `scripts/run-node.mjs` — Check for ejected core, generate override tsconfig if needed

## Implementation Notes for Codex

- Follow the same patterns as `src/services/plugin-eject.ts` (serialized ops, `.upstream.json`, error handling)
- Use `isWithinEjectedDir()` equivalent for path traversal protection
- The eliza monorepo remote is `https://github.com/elizaos/eliza.git`, branch `develop`
- `@elizaos/core` source is at `packages/core/` in the monorepo
- Build command for core: `pnpm --filter @elizaos/core build` (or `cd packages/core && pnpm build`)
- Install command: `pnpm install` (must be pnpm, not npm/bun — the monorepo uses pnpm workspaces)
- All commits need `Co-authored-by: Sol <sol@shad0w.xyz>` trailer
- Branch: `feat/core-eject-system` off `develop`
- Run `bunx tsc --noEmit` and `bunx biome check .` before finishing
