---
title: "Runtime and Lifecycle"
sidebarTitle: "Runtime & Lifecycle"
description: "Boot sequence, initialization steps, plugin loading order, service startup, and restart behavior for the Milady agent runtime."
---

This page documents how Milady initializes and manages the ElizaOS `AgentRuntime`, from process startup through graceful shutdown.

## Entry Points

Milady has two primary runtime entry points:

| Function | File | Use |
|---|---|---|
| `startEliza(opts)` | `src/runtime/eliza.ts` | Full startup including onboarding and optional interactive loop |
| `bootElizaRuntime(opts)` | `src/runtime/eliza.ts` | Headless startup for API server use (wraps `startEliza`) |

```typescript
// CLI mode — interactive chat after boot
await startEliza();

// Server mode — returns runtime, starts API
const runtime = await bootElizaRuntime({ requireConfig: true });

// Headless mode — returns runtime without entering readline loop
const runtime = await startEliza({ headless: true });
```

## Boot Sequence

`startEliza()` executes the following steps in order:

### Step 1: Log Capture

Early log buffering begins so startup messages appear in the UI log viewer even before the runtime is ready:

```typescript
captureEarlyLogs();
addLogListener(logToChatListener);
```

### Step 2: Load Config

`milady.json` is loaded from the state directory (`~/.milady/milady.json`). If the file does not exist, an empty config is used with defaults:

```typescript
config = loadMiladyConfig();
// Falls back to {} if ENOENT
```

### Step 3: First-Run Onboarding (CLI only)

If no agent name is configured and stdin is a TTY, the interactive onboarding wizard runs. It prompts for:

1. Agent name (4 random suggestions + custom input)
2. Writing style preset (from `STYLE_PRESETS`)
3. AI provider selection + API key
4. Wallet setup (EVM and Solana keypairs)
5. Skills registry URL

The wizard writes the agent name and chosen style template back to `milady.json` before continuing. In headless mode, onboarding is skipped — the GUI handles it.

### Step 4: Environment Variable Population

Several helper functions push config values into `process.env` so that ElizaOS plugins can read them:

| Function | Purpose |
|---|---|
| `applyConnectorSecretsToEnv()` | Channel credentials (Discord token, Telegram bot token, etc.) |
| `autoResolveDiscordAppId()` | Fetches Discord Application ID from the API if not set |
| `applyCloudConfigToEnv()` | ElizaCloud API key, base URL, model selections |
| `applyX402ConfigToEnv()` | x402 HTTP payment protocol settings |
| `applyDatabaseConfigToEnv()` | `POSTGRES_URL` or `PGLITE_DATA_DIR` for `@elizaos/plugin-sql` |

### Step 5: Build Character

`buildCharacterFromConfig()` assembles the ElizaOS `Character` from `milady.json`, resolving the agent name, personality fields, and secrets from environment variables.

### Step 6: Ensure Workspace

The agent workspace directory is created if needed:

```typescript
await ensureAgentWorkspace({ dir: workspaceDir, ensureBootstrapFiles: true });
```

Bootstrap files (e.g., `BOOTSTRAP.md`) are created on first run.

### Step 7: Create Milady Plugin

`createMiladyPlugin()` is called to produce the core bridge plugin that provides workspace context, session keys, emotes, custom actions, and lifecycle actions (restart, send-message):

```typescript
const miladyPlugin = createMiladyPlugin({
  workspaceDir,
  bootstrapMaxChars: config.agents?.defaults?.bootstrapMaxChars,
  agentId,
});
```

### Step 8: Resolve Plugins

`resolvePlugins()` collects and dynamically imports all plugins in parallel. This resolves three categories:

1. **Core plugins** — always loaded (see [Services](/runtime/services))
2. **Connector plugins** — loaded when channel config is present (Discord, Telegram, etc.)
3. **Provider plugins** — loaded when the corresponding API key env var is set
4. **Custom/drop-in plugins** — scanned from `~/.milady/plugins/custom/`
5. **Ejected plugins** — local overrides from `~/.milady/plugins/ejected/`

Each plugin is wrapped with an error boundary so a crash in one plugin cannot halt startup.

### Step 9: Create AgentRuntime

```typescript
let runtime = new AgentRuntime({
  character,
  actionPlanning: true,
  plugins: [miladyPlugin, ...otherPlugins.map((p) => p.plugin)],
  logLevel: runtimeLogLevel,
  settings: {
    VALIDATION_LEVEL: "fast",
    MODEL_PROVIDER: primaryModel,
    BUNDLED_SKILLS_DIRS: bundledSkillsDir,
    WORKSPACE_SKILLS_DIR: workspaceSkillsDir,
    // ...
  },
});
```

### Step 10: Pre-register Critical Plugins

Two plugins are pre-registered before `runtime.initialize()` to prevent race conditions:

1. **`@elizaos/plugin-sql`** — Database adapter must be ready before any plugin `init()` runs. On PGLite corruption, the data directory is reset and startup is retried once.

2. **`@elizaos/plugin-local-embedding`** — Must register its `TEXT_EMBEDDING` handler (priority 10) before services start. Without pre-registration, the cloud plugin's handler (priority 0) wins and incurs API costs for local embeddings.

### Step 11: Runtime Initialization

`runtime.initialize()` runs all remaining plugin `init()` functions in parallel, starts services, and prepares the agent for message processing.

### Step 12: Post-Init Setup

After initialization:

- Trajectory logger is located and enabled
- Action aliases are installed (e.g., `CODE_TASK` → `CREATE_TASK`)
- Skills service is warmed up asynchronously
- Sandbox manager is started if configured
- Hooks are loaded
- API server starts (in server/headless mode)

## Plugin Loading Order

```
1. @elizaos/plugin-sql           (pre-registered — database adapter)
2. @elizaos/plugin-local-embedding (pre-registered — TEXT_EMBEDDING handler)
3. milady (built-in bridge plugin)
4. All other plugins (parallel initialization via runtime.initialize())
```

## Restart Behavior

Milady supports pluggable restart handlers via `src/runtime/restart.ts`:

```typescript
export const RESTART_EXIT_CODE = 75;

// Default: exit so the CLI runner can relaunch
let _handler: RestartHandler = () => {
  process.exit(RESTART_EXIT_CODE);
};

export function setRestartHandler(handler: RestartHandler): void {
  _handler = handler;
}

export function requestRestart(reason?: string): void | Promise<void> {
  return _handler(reason);
}
```

| Environment | Restart strategy |
|---|---|
| CLI | Exits with code 75; `scripts/run-node.mjs` catches this, rebuilds if needed, relaunches |
| Dev server | Host calls `setRestartHandler()` to hot-swap the runtime in-process |
| API endpoint | `POST /api/agent/restart` calls `requestRestart()` |

The `restartAction` available to the LLM calls `requestRestart()` with an optional reason string.

## Lifecycle States

| State | Description |
|---|---|
| Starting | Config loaded, plugins resolving, database initializing |
| Running | `runtime.initialize()` complete, API server accepting requests |
| Restarting | `requestRestart()` called, handler in progress |
| Stopped | Process exited or runtime disposed |

## Sandbox Modes

The runtime can operate in one of four sandbox modes, configured in `agents.defaults.sandbox.mode`:

| Mode | Description |
|---|---|
| `"off"` | No sandboxing (default) |
| `"light"` | Audit log only; no container isolation |
| `"standard"` | Docker container isolation for tool execution |
| `"max"` | Maximum isolation including network restrictions |

## Related Pages

- [Core Runtime](/runtime/core) — AgentRuntime class reference
- [Services](/runtime/services) — service lifecycle and built-in service list
- [Plugins](/guides/plugin-development) — plugin development guide
