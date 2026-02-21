---
title: "Plugin Architecture"
sidebarTitle: "Architecture"
description: "Deep dive into Milady's plugin system — registration lifecycle, hook points, auto-enable mechanism, and dependency resolution."
---

The Milady plugin system is built on ElizaOS core. Every capability beyond the base runtime — model providers, platform connectors, DeFi integrations, scheduling, and custom features — is delivered as a plugin.

## System Design

Plugins are isolated modules that register capabilities with the `AgentRuntime`. The runtime orchestrates plugin loading, dependency resolution, initialization, and shutdown.

```
AgentRuntime
├── Core Plugins     (always loaded)
├── Auto-enabled     (triggered by env vars / config)
├── Character        (specified in character file)
└── Local            (from plugins/ directory)
```

The source of truth for which plugins are always loaded lives in `src/runtime/core-plugins.ts`:

```typescript
export const CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-sql",               // database adapter — required
  "@elizaos/plugin-local-embedding",   // local embeddings — required for memory
  "@elizaos/plugin-secrets-manager",   // secrets — load early, others depend on it
  "@elizaos/plugin-form",              // form handling
  "@elizaos/plugin-knowledge",         // RAG knowledge management
  "@elizaos/plugin-rolodex",           // contact graph and relationship memory
  "@elizaos/plugin-trajectory-logger", // trajectory logging for debugging/RL
  "@elizaos/plugin-agent-orchestrator",// multi-agent orchestration
  "@elizaos/plugin-cron",              // scheduled jobs
  "@elizaos/plugin-shell",             // shell command execution
  "@elizaos/plugin-plugin-manager",    // dynamic plugin management
  "@elizaos/plugin-agent-skills",      // skill execution and marketplace runtime
  "@elizaos/plugin-pdf",               // PDF processing
];
```

### Optional Core Plugins

A separate list of optional core plugins can be enabled from the admin panel. These are not loaded by default due to packaging or specification constraints. The list lives in `src/runtime/core-plugins.ts`:

```typescript
export const OPTIONAL_CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-code",  // code writing and file operations
];
```

Other plugins such as `@elizaos/plugin-directives`, `@elizaos/plugin-commands`, `@elizaos/plugin-mcp`, `@elizaos/plugin-computeruse`, and `@elizaos/plugin-personality` are commented out in the source and may be activated in future releases.

## Plugin Hook Points

A plugin can register any combination of the following hook points:

| Hook | Type | Purpose |
|------|------|---------|
| `actions` | `Action[]` | Things the agent can do; the LLM selects actions from this list |
| `providers` | `Provider[]` | Context injected into the prompt before each LLM call |
| `evaluators` | `Evaluator[]` | Post-response assessment; can trigger follow-up actions |
| `services` | `ServiceClass[]` | Long-running background processes |
| `routes` | `Route[]` | HTTP endpoints exposed by the agent API server |
| `events` | `Record<EventName, Handler[]>` | Callbacks for runtime events |
| `models` | `Record<ModelType, Handler>` | Custom model inference handlers |

## Registration Lifecycle

```
1. Resolve      — Plugin package is located (npm, local, workspace)
2. Import       — Module is dynamically imported and shape is validated
3. Sort         — Plugins are ordered by dependencies and priority field
4. Init         — plugin.init(config, runtime) is called
5. Register     — actions, providers, services, routes, events are registered
6. Active       — Plugin responds to messages and events
7. Shutdown     — plugin.cleanup() / service.stop() called on exit
```

### Plugin Interface

```typescript
interface Plugin {
  name: string;
  description: string;

  // Lifecycle
  init?: (config: Record<string, unknown>, runtime: IAgentRuntime) => Promise<void>;

  // Hook points
  actions?: Action[];
  providers?: Provider[];
  evaluators?: Evaluator[];
  services?: ServiceClass[];
  routes?: Route[];
  events?: Record<string, Handler[]>;
  models?: Record<string, ModelHandler>;
  componentTypes?: ComponentType[];

  // Load order
  priority?: number;          // Higher = loaded later
  dependencies?: string[];    // Other plugin names this depends on
  tests?: TestSuite[];
}
```

## Auto-Enable Mechanism

Plugins are automatically enabled when their required configuration is detected. This logic lives in `src/config/plugin-auto-enable.ts` and runs before runtime initialization.

### Trigger Sources

**Environment variable API keys** — The `AUTH_PROVIDER_PLUGINS` map connects env vars to plugin package names:

```typescript
const AUTH_PROVIDER_PLUGINS = {
  ANTHROPIC_API_KEY:              "@elizaos/plugin-anthropic",
  CLAUDE_API_KEY:                 "@elizaos/plugin-anthropic",
  OPENAI_API_KEY:                 "@elizaos/plugin-openai",
  AI_GATEWAY_API_KEY:             "@elizaos/plugin-vercel-ai-gateway",
  AIGATEWAY_API_KEY:              "@elizaos/plugin-vercel-ai-gateway",
  GOOGLE_API_KEY:                 "@elizaos/plugin-google-gemini",
  GOOGLE_GENERATIVE_AI_API_KEY:   "@elizaos/plugin-google-gemini",
  GOOGLE_CLOUD_API_KEY:           "@elizaos/plugin-google-antigravity",
  GROQ_API_KEY:                   "@elizaos/plugin-groq",
  XAI_API_KEY:                    "@elizaos/plugin-xai",
  GROK_API_KEY:                   "@elizaos/plugin-xai",
  OPENROUTER_API_KEY:             "@elizaos/plugin-openrouter",
  OLLAMA_BASE_URL:                "@elizaos/plugin-ollama",
  ZAI_API_KEY:                    "@homunculuslabs/plugin-zai",
  DEEPSEEK_API_KEY:               "@elizaos/plugin-deepseek",
  TOGETHER_API_KEY:               "@elizaos/plugin-together",
  MISTRAL_API_KEY:                "@elizaos/plugin-mistral",
  COHERE_API_KEY:                 "@elizaos/plugin-cohere",
  PERPLEXITY_API_KEY:             "@elizaos/plugin-perplexity",
  ELIZAOS_CLOUD_API_KEY:          "@elizaos/plugin-elizacloud",
  ELIZAOS_CLOUD_ENABLED:          "@elizaos/plugin-elizacloud",
};
```

**Connector configuration** — Connector blocks with a `botToken`, `token`, or `apiKey` field auto-enable the corresponding connector plugin:

```typescript
const CONNECTOR_PLUGINS = {
  telegram:    "@elizaos/plugin-telegram",
  discord:     "@elizaos/plugin-discord",
  slack:       "@elizaos/plugin-slack",
  twitter:     "@elizaos/plugin-twitter",
  whatsapp:    "@elizaos/plugin-whatsapp",
  signal:      "@elizaos/plugin-signal",
  bluebubbles: "@elizaos/plugin-bluebubbles",
  imessage:    "@elizaos/plugin-imessage",
  farcaster:   "@elizaos/plugin-farcaster",
  lens:        "@elizaos/plugin-lens",
  msteams:     "@elizaos/plugin-msteams",
  mattermost:  "@elizaos/plugin-mattermost",
  googlechat:  "@elizaos/plugin-google-chat",
  feishu:      "@elizaos/plugin-feishu",
  matrix:      "@elizaos/plugin-matrix",
  nostr:       "@elizaos/plugin-nostr",
};
```

**Feature flags** — The `features` section of `milady.json` auto-enables feature plugins. A feature can be enabled with `features.<name>: true` or `features.<name>.enabled: true`:

```json
{
  "features": {
    "browser": true,
    "imageGen": true,
    "tts": { "enabled": true }
  }
}
```

The complete `FEATURE_PLUGINS` map:

```typescript
const FEATURE_PLUGINS = {
  browser:          "@elizaos/plugin-browser",
  cron:             "@elizaos/plugin-cron",
  shell:            "@elizaos/plugin-shell",
  imageGen:         "@elizaos/plugin-image-generation",
  tts:              "@elizaos/plugin-tts",
  stt:              "@elizaos/plugin-stt",
  agentSkills:      "@elizaos/plugin-agent-skills",
  directives:       "@elizaos/plugin-directives",
  commands:         "@elizaos/plugin-commands",
  diagnosticsOtel:  "@elizaos/plugin-diagnostics-otel",
  webhooks:         "@elizaos/plugin-webhooks",
  gmailWatch:       "@elizaos/plugin-gmail-watch",
  personality:      "@elizaos/plugin-personality",
  experience:       "@elizaos/plugin-experience",
  form:             "@elizaos/plugin-form",
  x402:             "@elizaos/plugin-x402",
  fal:              "@elizaos/plugin-fal",
  suno:             "@elizaos/plugin-suno",
  vision:           "@elizaos/plugin-vision",
  computeruse:      "@elizaos/plugin-computeruse",
};
```

**Auth profiles** — Auth profiles specifying a provider name trigger loading of the matching provider plugin.

### Opting Out

Individual plugins can be disabled even when their env vars are present:

```json
{
  "plugins": {
    "entries": {
      "anthropic": { "enabled": false }
    }
  }
}
```

Setting `plugins.enabled: false` in config disables auto-enable for all optional plugins.

## Dependency Resolution

Plugins are sorted topologically before initialization. If plugin B lists plugin A in its `dependencies` array, A will always initialize before B.

The `priority` field provides coarse ordering independent of dependency edges. Lower priority values initialize earlier (default: `0`).

## Plugin Isolation

Each plugin receives:

- A reference to the shared `AgentRuntime` (read-only access to other plugins' registered capabilities)
- Its own configuration namespace
- Secrets injected by the secrets manager at init time

Plugins do not share mutable state directly — they communicate through the runtime's service registry and event system.

## Module Shape

When a plugin package is dynamically imported, the runtime checks for a plugin export in this order:

1. `module.default`
2. `module.plugin`
3. Any key whose value matches the Plugin interface shape

```typescript
interface PluginModuleShape {
  default?: Plugin;
  plugin?: Plugin;
  [key: string]: Plugin | undefined;
}
```

## Related

- [Create a Plugin](/plugins/create-a-plugin) — Build a plugin from scratch
- [Plugin Patterns](/plugins/patterns) — Common implementation patterns
- [Plugin Schemas](/plugins/schemas) — Full schema reference
- [Plugin Registry](/plugin-registry/bootstrap) — Core plugin documentation
