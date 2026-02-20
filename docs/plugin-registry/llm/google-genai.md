---
title: "Google Gemini Plugin"
sidebarTitle: "Google Gemini"
description: "Google Gemini model provider for Milaidy — Gemini 2.5 Pro, Flash, and multimodal capabilities."
---

The Google Gemini plugin connects Milaidy agents to Google's Gemini API, providing access to the Gemini 2.5 and 2.0 model families with multimodal input support.

**Package:** `@elizaos/plugin-google-gemini`

## Installation

```bash
milaidy plugins install google-gemini
```

## Auto-Enable

The plugin auto-enables when either env var is present:

```bash
export GOOGLE_API_KEY=AIza...
# or
export GOOGLE_GENERATIVE_AI_API_KEY=AIza...
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `GOOGLE_API_KEY` | Yes* | Google AI Studio API key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes* | Alias for `GOOGLE_API_KEY` |

*Either form is accepted.

Get your API key from [aistudio.google.com](https://aistudio.google.com).

### milaidy.json Example

```json
{
  "auth": {
    "profiles": {
      "default": {
        "provider": "google-gemini",
        "model": "gemini-2.5-pro"
      }
    }
  }
}
```

## Supported Models

### Gemini 2.5 Family

| Model | Context | Best For |
|-------|---------|---------|
| `gemini-2.5-pro` | 1M tokens | Complex reasoning, long context |
| `gemini-2.5-flash` | 1M tokens | Fast, cost-efficient tasks |
| `gemini-2.5-flash-lite` | 1M tokens | Highest throughput |

### Gemini 2.0 Family

| Model | Context | Best For |
|-------|---------|---------|
| `gemini-2.0-flash` | 1M tokens | Balanced performance |
| `gemini-2.0-flash-lite` | 1M tokens | Efficient tasks |

### Gemini 1.5 Family (Legacy)

| Model | Context | Best For |
|-------|---------|---------|
| `gemini-1.5-pro` | 2M tokens | Maximum context window |
| `gemini-1.5-flash` | 1M tokens | Cost-efficient |

## Model Type Mapping

| ElizaOS Model Type | Gemini Model |
|-------------------|-------------|
| `TEXT_SMALL` | `gemini-2.5-flash` |
| `TEXT_LARGE` | `gemini-2.5-pro` |
| `TEXT_EMBEDDING` | `text-embedding-004` |
| `IMAGE_DESCRIPTION` | `gemini-2.5-flash` (vision) |

## Features

- Streaming responses
- Function calling / tool use
- Vision (images, video, audio input)
- 1M+ token context windows (Gemini 2.5)
- Code execution capability
- Structured JSON output
- Grounding with Google Search (Gemini 2.0+)

## Multimodal Input

Gemini models natively accept images, audio, video, and documents as input:

```typescript
const response = await runtime.useModel("IMAGE_DESCRIPTION", {
  imageUrl: "https://example.com/chart.png",
  prompt: "Describe what this chart shows.",
});
```

## Rate Limits and Pricing

Free tier: Available via Google AI Studio (rate-limited).
Paid tier: Via Google Cloud Vertex AI or Google AI Studio billing.

See [ai.google.dev/pricing](https://ai.google.dev/pricing) for current rates.

## Related

- [OpenAI Plugin](/plugin-registry/llm/openai) — GPT-4o family
- [Groq Plugin](/plugin-registry/llm/groq) — Fast inference for smaller models
- [Model Providers Guide](/model-providers) — Compare all providers
