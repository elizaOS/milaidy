---
title: Memory & Context API
sidebarTitle: Memory
description: REST API endpoints for storing, searching, and retrieving agent memory and context.
---

## Remember

```
POST /api/memory/remember
```

Saves a free-text note into the agent's persistent hash-memory room.

**Request body:**
```json
{ "text": "The user prefers dark mode themes." }
```

| Field | Type | Required |
|-------|------|----------|
| `text` | string | yes |

**Response:**
```json
{
  "ok": true,
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "text": "The user prefers dark mode themes.",
  "createdAt": 1700000000000
}
```

**Errors:** `400` if `text` is missing or empty; `503` if agent runtime is unavailable.

## Search Memory

```
GET /api/memory/search
```

Full-text keyword search over saved memory notes. Scans up to 500 most recent entries and returns top matches by term-overlap score.

**Query params:**

| Param | Type | Required | Default | Max |
|-------|------|----------|---------|-----|
| `q` | string | yes | — | — |
| `limit` | integer | no | `10` | `50` |

**Response:**
```json
{
  "query": "dark mode",
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "text": "The user prefers dark mode themes.",
      "createdAt": 1700000000000,
      "score": 1.5
    }
  ],
  "count": 1,
  "limit": 10
}
```

**Errors:** `400` if `q` is absent.

## Quick Context

```
GET /api/context/quick
```

Searches both memory notes and the knowledge base simultaneously, then synthesizes a concise answer (max 120 words) via the agent's text model.

**Query params:**

| Param | Type | Required | Default | Max |
|-------|------|----------|---------|-----|
| `q` | string | yes | — | — |
| `limit` | integer | no | `8` | `20` |

**Response:**
```json
{
  "query": "What theme does the user prefer?",
  "answer": "The user prefers dark mode themes.",
  "memories": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "text": "The user prefers dark mode themes.",
      "createdAt": 1700000000000,
      "score": 1.5
    }
  ],
  "knowledge": [
    {
      "id": "uuid",
      "text": "Theme configuration documentation...",
      "similarity": 0.87,
      "documentId": "uuid",
      "documentTitle": "themes.pdf",
      "position": 3
    }
  ]
}
```

Knowledge results are filtered to `similarity >= 0.2`. The `documentId`, `documentTitle`, and `position` fields are present only when available in the fragment metadata.
