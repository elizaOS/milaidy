---
title: "Anthropic Plugin"
sidebarTitle: "Anthropic"
description: "Anthropic Claude model provider for Milady — Claude Opus 4, Sonnet 4.5, Haiku, and the extended thinking models."
---

The Anthropic plugin connects Milady agents to Anthropic's Claude API, providing access to the Claude 4 and Claude 3 model families including Opus, Sonnet, and Haiku variants.

**Package:** `@elizaos/plugin-anthropic`

## Installation

```bash
milady plugins install anthropic
```

## Auto-Enable

The plugin auto-enables when `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` is present:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | Anthropic API key from [console.anthropic.com](https://console.anthropic.com) |
| `CLAUDE_API_KEY` | Yes* | Alias for `ANTHROPIC_API_KEY` |
| `ANTHROPIC_API_URL` | No | Custom base URL |

*Either `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` is required.

### milady.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-20250514"
      }
    }
  }
}
```

## Supported Models

### Claude 4 Family

| Model | Context | Best For |
|-------|---------|---------|
| `claude-opus-4-20250514` | 200k | Most capable, complex reasoning |
| `claude-sonnet-4-20250514` | 200k | Balanced performance and cost |
| `claude-sonnet-4.5` | 200k | Latest Sonnet, improved coding |
| `claude-3-5-haiku-20241022` | 200k | Fast, lightweight tasks |

### Claude 3.7 Family

| Model | Context | Best For |
|-------|---------|---------|
| `claude-3-7-sonnet-20250219` | 200k | Extended thinking, agentic tasks |

### Claude 3.5 Family

| Model | Context | Best For |
|-------|---------|---------|
| `claude-3-5-sonnet-20241022` | 200k | Code generation, analysis |
| `claude-3-5-haiku-20241022` | 200k | Fast responses |

### Claude 3 Family

| Model | Context | Best For |
|-------|---------|---------|
| `claude-3-opus-20240229` | 200k | Deep analysis |
| `claude-3-sonnet-20240229` | 200k | Balanced |
| `claude-3-haiku-20240307` | 200k | Cost-efficient |

## Model Type Mapping

| ElizaOS Model Type | Anthropic Model |
|-------------------|----------------|
| `TEXT_SMALL` | `claude-3-5-haiku-20241022` |
| `TEXT_LARGE` | `claude-sonnet-4-20250514` |
| `OBJECT_SMALL` | `claude-3-5-haiku-20241022` |
| `OBJECT_LARGE` | `claude-sonnet-4-20250514` |

## Features

- Streaming responses
- Tool use (function calling)
- Vision (image input on all models)
- Extended thinking (claude-3-7-sonnet, claude-opus-4-20250514)
- Structured JSON output via tool use
- 200k token context window on all models
- Prompt caching for cost reduction on repeated context

## Extended Thinking

Claude 3.7 Sonnet and Claude Opus 4 (`claude-opus-4-20250514`) support extended thinking — a mode where the model reasons step-by-step before answering. This is particularly effective for complex reasoning, math, and multi-step planning.

```typescript
const response = await runtime.useModel("TEXT_REASONING_LARGE", {
  prompt: "Design a database schema for a multi-tenant SaaS application.",
  thinking: { type: "enabled", budgetTokens: 10000 },
});
```

## Rate Limits and Pricing

Rate limits depend on your Anthropic usage tier. See [docs.anthropic.com/en/api/rate-limits](https://docs.anthropic.com/en/api/rate-limits) for current limits.

Pricing: [anthropic.com/pricing](https://www.anthropic.com/pricing)

## Related

- [OpenAI Plugin](/plugin-registry/llm/openai) — GPT-4o and reasoning models
- [OpenRouter Plugin](/plugin-registry/llm/openrouter) — Route between providers including Anthropic
- [Model Providers Guide](/model-providers) — Compare all providers
