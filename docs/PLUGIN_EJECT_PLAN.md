# Plugin Eject System — Implementation Plan

> **Goal:** Allow the milaidy agent to clone plugin source code locally, edit it, and have the runtime load the local version instead of the npm package — without modifying the milaidy repo's `package.json` or workspace config.

## Architecture Overview

```
~/.milaidy/
├── plugins/
│   ├── installed/     # npm-installed plugins (existing, managed by plugin-installer.ts)
│   ├── custom/        # drop-in custom plugins (existing scan dir)
│   └── ejected/       # NEW — git-cloned editable plugin source
│       ├── plugin-discord/
│       │   ├── .upstream.json      # tracks source repo + commit
│       │   ├── package.json
│       │   ├── node_modules/
│       │   └── src/
│       └── plugin-trust/
│           ├── .upstream.json
│           ├── package.json
│           └── src/
```

### Why `ejected/` instead of reusing `custom/`?

- `custom/` is for user-authored plugins that don't come from upstream
- `ejected/` is for forked copies of upstream plugins with tracking metadata
- Different semantics: ejected plugins **override** their npm counterpart; custom plugins **add** new functionality
- Keeps the mental model clean for the agent

## Current State Analysis

### Three Existing Plugin Load Paths

1. **Core/npm plugins** — `import(pluginName)` from `node_modules/`
2. **Installed plugins** — `~/.milaidy/plugins/installed/<name>/` via config `plugins.installs` records
3. **Custom/drop-in plugins** — `~/.milaidy/plugins/custom/` auto-scanned via `scanDropInPlugins()`

### Two Blockers for Using `custom/` as-is

**Blocker 1: Core plugin collision guard**

In `src/runtime/eliza.ts`, `mergeDropInPlugins()`:
```typescript
if (corePluginNames.has(name)) {
  skipped.push(`[milaidy] Custom plugin "${name}" collides with core plugin — skipping`);
  continue;
}
```
Core plugins (sql, shell, knowledge, etc.) cannot be overridden by drop-ins. This is intentional for `custom/` but wrong for `ejected/`.

**Blocker 2: Official plugin import priority**

When a plugin has an `installRecord.installPath`, the loader checks:
```typescript
const isOfficialElizaPlugin = pluginName.startsWith("@elizaos/plugin-");
if (isOfficialElizaPlugin) {
  // TRY npm node_modules FIRST, only fall back to installPath
  mod = (await import(pluginName)) as PluginModuleShape;
}
```
Official `@elizaos/plugin-*` packages **always prefer node_modules** over the install path. An ejected plugin would be ignored in favor of the npm version.

## Implementation Plan

### Phase 1: Runtime Changes (src/runtime/)

#### 1.1 Add ejected plugin scan directory

**File:** `src/runtime/eliza.ts`

In `resolvePlugins()`, add a new scan pass for `~/.milaidy/plugins/ejected/` that runs **before** the main plugin import loop. Ejected plugins should:
- Be scanned via the existing `scanDropInPlugins()` function (it already reads `package.json` from subdirs)
- Be stored in a separate `ejectedRecords` map (not mixed with `dropInRecords`)
- **NOT** be filtered by the core collision guard (unlike custom plugins)

```typescript
// NEW: Scan ejected plugins — these override even core plugins
const ejectedDir = path.join(resolveStateDir(), "plugins/ejected");
const ejectedRecords = await scanDropInPlugins(ejectedDir);
```

#### 1.2 Override import resolution for ejected plugins

In the plugin import loop, check if a plugin has an ejected record **before** the normal resolution:

```typescript
for (const pluginName of pluginsToLoad) {
  try {
    let mod: PluginModuleShape;

    // NEW: Ejected plugins always load from disk, bypassing npm
    const ejectedRecord = ejectedRecords[pluginName];
    if (ejectedRecord?.installPath) {
      logger.info(`[milaidy] Loading ejected plugin: ${pluginName} from ${ejectedRecord.installPath}`);
      mod = await importFromPath(ejectedRecord.installPath, pluginName);
    } else if (installRecord?.installPath) {
      // ... existing logic
    }
```

This ensures ejected plugins **always win** over npm, installed, and core versions.

#### 1.3 Add ejected plugin metadata to status API

**File:** `src/api/server.ts`

Add `GET /api/plugins/ejected` endpoint that returns:
- List of ejected plugins
- Their `.upstream.json` metadata
- Whether they're ahead/behind upstream (if git info available)

### Phase 2: Eject/Sync/Reinject Scripts (src/services/)

#### 2.1 Plugin Eject Service

**New file:** `src/services/plugin-eject.ts`

```typescript
export interface EjectResult {
  success: boolean;
  pluginName: string;
  ejectedPath: string;
  upstreamCommit: string;
  error?: string;
}

export async function ejectPlugin(pluginId: string): Promise<EjectResult> {
  // 1. Look up plugin in registry (via existing getPluginInfo())
  // 2. Resolve git URL and branch (reuse resolveGitBranch() from plugin-installer.ts)
  // 3. Clone into ~/.milaidy/plugins/ejected/<plugin-name>/
  //    - git clone --depth 1 --branch <branch> <gitUrl> <targetDir>
  // 4. Install dependencies: bun install / npm install in the cloned dir
  // 5. Build if needed: check for tsconfig, run build
  // 6. Write .upstream.json:
  //    {
  //      "source": "github:elizaos-plugins/plugin-discord",
  //      "gitUrl": "https://github.com/elizaos-plugins/plugin-discord.git",
  //      "branch": "next",
  //      "commitHash": "<HEAD commit>",
  //      "ejectedAt": "<ISO timestamp>",
  //      "npmVersion": "<version from registry>"
  //    }
  // 7. Return result (caller decides whether to restart)
}
```

**Key design decisions:**
- Use shallow clone (`--depth 1`) initially for speed, but unshallow on first sync
- Clone the branch that matches the currently installed npm version (prefer v2Branch → next → main)
- Run `bun install` in the ejected dir so it has its own `node_modules/`
- Do NOT modify the milaidy repo's `package.json` — the runtime override handles resolution

#### 2.2 Plugin Sync Service

**New file or addition to `plugin-eject.ts`**

```typescript
export interface SyncResult {
  success: boolean;
  pluginName: string;
  upstreamCommits: number; // commits ahead upstream
  localChanges: boolean;   // has uncommitted local edits
  conflicts: string[];     // files with merge conflicts
  error?: string;
}

export async function syncPlugin(pluginId: string): Promise<SyncResult> {
  // 1. Read .upstream.json from ejected dir
  // 2. If shallow clone, unshallow first: git fetch --unshallow
  // 3. git fetch origin
  // 4. Compare: git log HEAD..origin/<branch> --oneline
  // 5. If local changes: git stash, pull, stash pop (or report conflicts)
  // 6. If no local changes: git pull --ff-only
  // 7. Update .upstream.json with new commit hash
  // 8. Rebuild if needed
  // 9. Return sync result
}
```

#### 2.3 Plugin Reinject Service

```typescript
export async function reinjectPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  // 1. Verify the ejected dir exists
  // 2. Optionally: check for unpushed local changes and warn
  // 3. Remove the ejected directory: rm -rf ~/.milaidy/plugins/ejected/<name>/
  // 4. Runtime will fall back to npm version on next restart
  // 5. Trigger restart
}
```

### Phase 3: Agent Actions (src/actions/)

#### 3.1 EJECT_PLUGIN Action

**New file:** `src/actions/eject-plugin.ts`

```typescript
export const ejectPluginAction: Action = {
  name: "EJECT_PLUGIN",
  similes: ["EJECT", "FORK_PLUGIN", "CLONE_PLUGIN", "EDIT_PLUGIN_SOURCE"],
  description:
    "Clone a plugin's source code locally so it can be edited. " +
    "The agent can then modify the plugin source and the runtime " +
    "will load the local version instead of the npm package.",
  // handler: calls ejectPlugin() + requestRestart()
};
```

#### 3.2 SYNC_PLUGIN Action

```typescript
export const syncPluginAction: Action = {
  name: "SYNC_PLUGIN",
  similes: ["UPDATE_PLUGIN", "PULL_PLUGIN_UPSTREAM"],
  description:
    "Pull upstream changes for an ejected plugin and merge with local edits.",
  // handler: calls syncPlugin()
};
```

#### 3.3 REINJECT_PLUGIN Action

```typescript
export const reinjectPluginAction: Action = {
  name: "REINJECT_PLUGIN",
  similes: ["UNEJECT_PLUGIN", "RESTORE_PLUGIN", "REMOVE_LOCAL_PLUGIN"],
  description:
    "Remove the local plugin source and fall back to the npm version.",
  // handler: calls reinjectPlugin() + requestRestart()
};
```

#### 3.4 LIST_EJECTED_PLUGINS Action

```typescript
export const listEjectedAction: Action = {
  name: "LIST_EJECTED_PLUGINS",
  similes: ["SHOW_EJECTED", "EJECTED_PLUGINS"],
  description: "List all ejected plugins and their upstream status.",
  // handler: scans ejected dir, reads .upstream.json files
};
```

### Phase 4: Wire into milaidy-plugin.ts

**File:** `src/runtime/milaidy-plugin.ts`

Register the new actions in the milaidy plugin's action list:

```typescript
import { ejectPluginAction } from "../actions/eject-plugin.js";
import { syncPluginAction } from "../actions/sync-plugin.js";
import { reinjectPluginAction } from "../actions/reinject-plugin.js";
import { listEjectedAction } from "../actions/list-ejected.js";

// In the plugin definition:
actions: [
  // ...existing actions
  ejectPluginAction,
  syncPluginAction,
  reinjectPluginAction,
  listEjectedAction,
],
```

### Phase 5: CLI Commands (optional, nice-to-have)

**File:** `src/cli/plugins-cli.ts`

Add subcommands to the existing plugins CLI:

```
milaidy plugins eject <plugin-id>     # clone plugin source for editing
milaidy plugins sync <plugin-id>      # pull upstream changes
milaidy plugins reinject <plugin-id>  # remove local source, revert to npm
milaidy plugins ejected               # list all ejected plugins
```

## .upstream.json Schema

```json
{
  "$schema": "milaidy-upstream-v1",
  "source": "github:elizaos-plugins/plugin-discord",
  "gitUrl": "https://github.com/elizaos-plugins/plugin-discord.git",
  "branch": "next",
  "commitHash": "abc123def456...",
  "ejectedAt": "2026-02-16T08:00:00Z",
  "npmPackage": "@elizaos/plugin-discord",
  "npmVersion": "2.0.0-alpha.11",
  "lastSyncAt": null,
  "localCommits": 0
}
```

## Security Considerations

- **Path traversal:** Reuse existing `isWithinPluginsDir()` pattern from `plugin-installer.ts` but for the ejected dir
- **Input validation:** Reuse existing `VALID_PACKAGE_NAME`, `VALID_GIT_URL`, `VALID_BRANCH` from `plugin-installer.ts`
- **Git operations:** Always set `GIT_TERMINAL_PROMPT=0` to prevent interactive prompts
- **No arbitrary git URLs:** Only clone from registry-resolved URLs (elizaos-plugins org or registered repos)

## Testing Plan

1. **Unit tests for eject service:**
   - Eject a plugin, verify `.upstream.json` created
   - Eject same plugin twice = idempotent (or error)
   - Reinject removes dir cleanly

2. **Integration test for runtime override:**
   - Place a mock plugin in `ejected/` dir
   - Verify runtime loads it instead of npm version
   - Verify core plugins CAN be overridden via eject (not blocked by collision guard)

3. **Sync test:**
   - Eject, make local change, sync with upstream, verify merge

## File Summary

| File | Action |
|------|--------|
| `src/runtime/eliza.ts` | Add ejected plugin scan + import override |
| `src/runtime/core-plugins.ts` | No changes needed |
| `src/services/plugin-eject.ts` | **NEW** — eject/sync/reinject logic |
| `src/actions/eject-plugin.ts` | **NEW** — EJECT_PLUGIN action |
| `src/actions/sync-plugin.ts` | **NEW** — SYNC_PLUGIN action |
| `src/actions/reinject-plugin.ts` | **NEW** — REINJECT_PLUGIN action |
| `src/actions/list-ejected.ts` | **NEW** — LIST_EJECTED_PLUGINS action |
| `src/runtime/milaidy-plugin.ts` | Register new actions |
| `src/api/server.ts` | Add `/api/plugins/ejected` endpoint |
| `src/cli/plugins-cli.ts` | Add CLI subcommands (optional) |

## Implementation Order

1. **Phase 1** (runtime changes) — must be first, everything depends on it
2. **Phase 2** (eject service) — core logic
3. **Phase 3** (actions) — agent-facing interface
4. **Phase 4** (wire up) — connect to runtime
5. **Phase 5** (CLI) — nice-to-have, can be deferred

Estimated scope: ~400-600 lines of new code, ~30 lines of changes to existing files.
