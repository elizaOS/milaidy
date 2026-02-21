---
title: Plugins Overview
sidebarTitle: Overview
description: Milady's plugin system provides modular capabilities — model providers, platform connectors, DeFi integrations, and custom features.
---

Plugins are the primary extension mechanism for Milady. Every capability beyond the core runtime — from LLM providers to blockchain interactions — is delivered as a plugin.

## What is a Plugin?

A plugin is a self-contained module that registers one or more of:

- **Actions** — Things the agent can do (e.g., send a tweet, swap tokens)
- **Providers** — Context injected into the agent's prompt (e.g., wallet balance, time)
- **Evaluators** — Post-processing logic that runs after each response
- **Services** — Long-running background processes (e.g., cron jobs, event listeners)

## Plugin Categories

<CardGroup cols={2}>

<Card title="Core Plugins" icon="cube" href="/plugin-registry/bootstrap">
  Essential plugins that ship with every Milady installation — message processing, knowledge, database, and secrets.
</Card>

<Card title="Model Providers" icon="brain" href="/plugin-registry/llm/openai">
  LLM integrations for OpenAI, Anthropic, Google, Groq, Ollama, OpenRouter, and DeepSeek.
</Card>

<Card title="Platform Connectors" icon="plug" href="/plugin-registry/platform/discord">
  Bridges to messaging platforms — Discord, Telegram, Twitter, Slack, WhatsApp, and Farcaster.
</Card>

<Card title="DeFi & Blockchain" icon="wallet" href="/plugin-registry/defi/evm">
  On-chain interactions for EVM chains and Solana — token transfers, swaps, and DeFi protocols.
</Card>

<Card title="Feature Plugins" icon="wand-magic-sparkles" href="/plugin-registry/browser">
  Extended capabilities — browser control, image generation, text-to-speech, computer use, and cron scheduling.
</Card>

</CardGroup>

## How Plugins Load

Plugins are loaded during runtime initialization in this order:

1. **Core plugins** — Always loaded (`bootstrap`, `knowledge`, `sql`)
2. **Auto-enabled plugins** — Enabled based on environment variables (e.g., `OPENAI_API_KEY` enables the OpenAI plugin)
3. **Character plugins** — Specified in the character file
4. **Local plugins** — Loaded from the `plugins/` directory

```typescript
// Character file plugin configuration
{
  "plugins": ["@elizaos/plugin-openai", "@elizaos/plugin-discord"],
  "settings": {
    "secrets": {
      "OPENAI_API_KEY": "sk-..."
    }
  }
}
```

## Plugin Lifecycle

```
Install → Register → Initialize → Active → Shutdown
```

1. **Install** — Plugin package is resolved (npm or local)
2. **Register** — Actions, providers, evaluators, and services are registered with the runtime
3. **Initialize** — `init()` is called with runtime context
4. **Active** — Plugin processes events and provides capabilities
5. **Shutdown** — `cleanup()` is called on runtime stop

## Managing Plugins

### Install from Registry

```bash
milady plugins install @elizaos/plugin-openai
```

### List Installed Plugins

```bash
milady plugins list
```

### Enable/Disable

```bash
milady plugins enable plugin-name
milady plugins disable plugin-name
```

### Eject (Copy to Local)

```bash
milady plugins eject plugin-name
```

See [Plugin Eject](/plugins/plugin-eject) for details on customizing ejected plugins.

## Related

- [Plugin Architecture](/plugins/architecture) — Deep dive into the plugin system
- [Create a Plugin](/plugins/create-a-plugin) — Step-by-step tutorial
- [Plugin Development](/plugins/development) — Development guide and API
- [Plugin Registry](/plugins/registry) — Browse available plugins
