---
title: "Services"
sidebarTitle: "Services"
description: "Service interface, service registry, built-in services list, service lifecycle, and dependency patterns."
---

Services are long-running background components registered with `AgentRuntime`. Unlike providers (which run on each turn) or actions (which run on demand), services start when their plugin initializes and run for the lifetime of the agent.

## Service Interface

From `@elizaos/core`:

```typescript
export interface Service {
  serviceType: string;
  initialize(runtime: IAgentRuntime): Promise<void>;
  stop?(): Promise<void>;
}
```

| Field | Type | Description |
|---|---|---|
| `serviceType` | string | Unique identifier for this service type (e.g., `"AGENT_SKILLS_SERVICE"`) |
| `initialize()` | function | Called once when the plugin that owns this service is initialized |
| `stop()` | function (optional) | Called during graceful shutdown |

## Service Registry

Services are accessible via the runtime:

```typescript
// Get a service by type string
const service = runtime.getService("AGENT_SKILLS_SERVICE");

// Get all services of a type (returns array for multi-instance services)
const services = runtime.getServicesByType("trajectory_logger");

// Wait for a service to finish loading
const svcPromise = runtime.getServiceLoadPromise("AGENT_SKILLS_SERVICE");

// Check registration status
const status = runtime.getServiceRegistrationStatus("trajectory_logger");
// Returns: "pending" | "registering" | "registered" | "failed" | "unknown"
```

## Core Plugins and Their Services

Core plugins are always loaded and each provides one or more services:

| Plugin | Service Type | Description |
|---|---|---|
| `@elizaos/plugin-sql` | Database adapter | PGLite or PostgreSQL persistence; provides `runtime.adapter` |
| `@elizaos/plugin-local-embedding` | `TEXT_EMBEDDING` handler | Local GGUF embedding model via node-llama-cpp |
| `@elizaos/plugin-secrets-manager` | Secrets service | Encrypted credential storage and retrieval |
| `@elizaos/plugin-knowledge` | Knowledge service | RAG knowledge indexing and retrieval |
| `@elizaos/plugin-rolodex` | Rolodex service | Contact graph, relationship memory, social tracking |
| `@elizaos/plugin-trajectory-logger` | `trajectory_logger` | Debug and RL training trajectory capture |
| `@elizaos/plugin-agent-orchestrator` | Orchestrator service | Multi-agent task coordination and spawning |
| `@elizaos/plugin-cron` | Cron service | Scheduled job execution |
| `@elizaos/plugin-shell` | Shell service | Shell command execution with security controls |
| `@elizaos/plugin-plugin-manager` | Plugin manager service | Dynamic plugin install/uninstall at runtime |
| `@elizaos/plugin-agent-skills` | `AGENT_SKILLS_SERVICE` | Skill catalog loading and execution |
| `@elizaos/plugin-pdf` | PDF service | PDF document processing |
| `@elizaos/plugin-form` | Form service | Structured form packaging |

## Optional Core Services

These services are available but not loaded by default:

| Plugin | Description |
|---|---|
| `@elizaos/plugin-code` | Code writing and file operations |
| `@elizaos/plugin-browser` | Browser automation (requires stagehand-server binary) |
| `@elizaos/plugin-vision` | Visual understanding (requires @tensorflow/tfjs-node) |
| `@elizaos/plugin-computeruse` | Computer use automation (requires platform binaries) |
| `@elizaos/plugin-x402` | x402 HTTP micropayment protocol |

## Trajectory Logger Service

The trajectory logger is treated specially during startup. Milady waits for it to become available with a 3-second timeout before enabling it:

```typescript
await waitForTrajectoryLoggerService(runtime, "post-init", 3000);
ensureTrajectoryLoggerEnabled(runtime, "post-init");
```

The service supports `isEnabled()` and `setEnabled(enabled: boolean)` methods. Milady enables it by default after initialization.

## Skills Service

`@elizaos/plugin-agent-skills` loads and manages the skill catalog. Milady asynchronously warms up this service after startup:

```typescript
const svc = runtime.getService("AGENT_SKILLS_SERVICE") as {
  getCatalogStats?: () => { loaded: number; total: number; storageType: string };
};
const stats = svc?.getCatalogStats?.();
logger.info(`[milady] Skills: ${stats.loaded}/${stats.total} loaded`);
```

Skills are discovered from multiple directories in precedence order:

```
1. Workspace skills:  <workspaceDir>/skills/
2. Bundled skills:    from @elizaos/skills package
3. Extra dirs:        skills.load.extraDirs
```

Skills are filtered by `skills.allowBundled` and `skills.denyBundled` lists. Forwarded as runtime settings:

```
BUNDLED_SKILLS_DIRS = <path from @elizaos/skills>
WORKSPACE_SKILLS_DIR = <workspaceDir>/skills
EXTRA_SKILLS_DIRS = <comma-separated extra dirs>
SKILLS_ALLOWLIST = <comma-separated allowed skill names>
SKILLS_DENYLIST = <comma-separated denied skill names>
```

## Sandbox Manager

`SandboxManager` from `src/services/sandbox-manager.ts` provides Docker-based code execution isolation when `agents.defaults.sandbox.mode` is `"standard"` or `"max"`:

```typescript
const sandboxManager = new SandboxManager({
  mode: "standard",
  image: dockerSettings?.image ?? undefined,  // no default image — must be configured
  browser: dockerSettings?.browser ?? undefined,
  containerPrefix: "milady-sandbox-",
  network: "bridge",
  memory: "512m",
  cpus: 0.5,
  workspaceRoot: workspaceDir,
});

await sandboxManager.start();
```

In `"light"` mode, only an audit log is created — no container isolation.

## Service Lifecycle

```
Plugin registered
    ↓
service.initialize(runtime) called during plugin.init()
    ↓
Service running (available via runtime.getService())
    ↓
Graceful shutdown: service.stop() called
```

## Writing a Service

To create a service in a plugin:

```typescript
import type { IAgentRuntime, Service } from "@elizaos/core";

class MyService implements Service {
  serviceType = "MY_SERVICE";
  private runtime!: IAgentRuntime;

  async initialize(runtime: IAgentRuntime): Promise<void> {
    this.runtime = runtime;
    // Start background work
    this.startPolling();
  }

  async stop(): Promise<void> {
    // Clean up resources
    this.stopPolling();
  }
}

// In the plugin:
export default {
  name: "my-plugin",
  description: "...",
  services: [new MyService()],
};
```

## Accessing a Service from Another Plugin

Services are accessed by type string. Always check for null if the service might not be loaded:

```typescript
const myService = runtime.getService("MY_SERVICE") as MyService | null;
if (myService) {
  await myService.doSomething();
}
```

## Related Pages

- [Core Runtime](/runtime/core) — plugin loading and registration
- [Runtime and Lifecycle](/agents/runtime-and-lifecycle) — service startup timing
- [Types](/runtime/types) — Service interface type definitions
