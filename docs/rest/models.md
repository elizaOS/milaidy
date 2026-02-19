---
title: "Models API"
sidebarTitle: "Models"
description: "REST API endpoint for listing available AI models by provider."
---

The models endpoint lists available AI models from configured providers. Results are cached on disk; use `?refresh=true` to bust the cache and fetch fresh model lists from each provider's API.

## Endpoints

### GET /api/models

List available AI models. Optionally filter by a specific provider or refresh the cache.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `provider` | string | No | Filter to a specific provider (e.g., `openai`, `anthropic`, `ollama`). Returns all providers if omitted |
| `refresh` | string | No | Set to `"true"` to bust the cache and fetch fresh model lists |

**Response (all providers)**

```json
{
  "providers": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "contextLength": 128000
      },
      {
        "id": "gpt-4o-mini",
        "name": "GPT-4o Mini",
        "contextLength": 128000
      }
    ],
    "anthropic": [
      {
        "id": "claude-opus-4-5",
        "name": "Claude Opus 4.5",
        "contextLength": 200000
      }
    ]
  }
}
```

**Response (single provider)**

```json
{
  "provider": "openai",
  "models": [
    {
      "id": "gpt-4o",
      "name": "GPT-4o",
      "contextLength": 128000
    }
  ]
}
```
