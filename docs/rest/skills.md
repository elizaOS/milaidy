---
title: "Skills API"
sidebarTitle: "Skills"
description: "REST API endpoints for managing local skills, the skills catalog, and the skills marketplace."
---

The skills API covers three areas: **local skills** (agent-specific TypeScript action files), the **skills catalog** (curated registry of community skills), and the **skills marketplace** (npm-based skill packages). Skills extend the agent with new actions, providers, or evaluators.

## Endpoints

### Local Skills

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/skills` | List all local skills with metadata |
| POST | `/api/skills/refresh` | Re-scan the skills directory |
| GET | `/api/skills/:id/scan` | Scan a skill file and return parsed metadata |
| POST | `/api/skills/create` | Create a new skill file from a template |
| POST | `/api/skills/:id/open` | Open a skill file in the default editor |
| GET | `/api/skills/:id/source` | Read the source code of a skill |
| PUT | `/api/skills/:id/source` | Write updated source code for a skill |
| PUT | `/api/skills/:id` | Update skill preferences (enabled, priority, etc.) |

### Skills Catalog

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/skills/catalog` | List the skills catalog with pagination |
| GET | `/api/skills/catalog/search` | Search the catalog by query |
| GET | `/api/skills/catalog/:id` | Get details for a single catalog entry |
| POST | `/api/skills/catalog/refresh` | Refresh the catalog from the remote registry |
| POST | `/api/skills/catalog/install` | Install a catalog skill |
| POST | `/api/skills/catalog/uninstall` | Uninstall a catalog skill |

### Skills Marketplace

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/skills/marketplace/search` | Search the npm marketplace for skills |
| GET | `/api/skills/marketplace/installed` | List installed marketplace skills |
| POST | `/api/skills/marketplace/install` | Install a skill from npm |
| POST | `/api/skills/marketplace/uninstall` | Uninstall a marketplace skill |
| GET | `/api/skills/marketplace/config` | Get marketplace configuration |
| PUT | `/api/skills/marketplace/config` | Update marketplace configuration |

---

## Local Skills

### GET /api/skills

List all local skills found in the agent's skills directory. Each entry includes the file path, parsed action metadata, and enabled/priority preferences.

**Response**

```json
{
  "skills": [
    {
      "id": "my-custom-action",
      "name": "MY_CUSTOM_ACTION",
      "description": "Does something useful",
      "filePath": "/path/to/skills/my-custom-action.ts",
      "enabled": true,
      "priority": 0,
      "valid": true
    }
  ]
}
```

---

### POST /api/skills/refresh

Re-scan the skills directory and reload all skill metadata. Useful after manually adding or editing skill files.

**Response**

```json
{
  "ok": true,
  "count": 5
}
```

---

### GET /api/skills/:id/scan

Scan a single skill file and return its parsed AST metadata — exported actions, providers, and evaluators.

**Response**

```json
{
  "id": "my-skill",
  "actions": [
    {
      "name": "MY_ACTION",
      "description": "Action description",
      "similes": ["DO_THING"],
      "parameters": []
    }
  ],
  "providers": [],
  "evaluators": []
}
```

---

### POST /api/skills/create

Create a new skill file from a built-in template.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Skill file name (e.g. `my-action`) |
| `template` | string | No | Template to use — defaults to a basic action template |

**Response**

```json
{
  "ok": true,
  "skill": {
    "id": "my-action",
    "filePath": "/path/to/skills/my-action.ts"
  }
}
```

---

### POST /api/skills/:id/open

Open the skill file in the system's default code editor.

**Response**

```json
{
  "ok": true
}
```

---

## Skills Catalog and Marketplace Runbook

### Setup Checklist

1. Confirm skills directory is readable and writable by the runtime.
2. Confirm marketplace registry/network access is available.
3. Confirm plugin installer prerequisites (`npm`/`pnpm`/`bun`) are present in runtime PATH.

### Failure Modes

- Search returns empty unexpectedly:
  Check query input, upstream registry availability, and rate limiting.
- Install fails:
  Check package name/version validity, installer permissions, and network.
- Uninstall leaves stale state:
  Refresh skills list and verify the package is removed from install records.

### Verification Commands

```bash
bunx vitest run src/services/plugin-installer.test.ts src/services/skill-marketplace.test.ts
bunx vitest run --config vitest.e2e.config.ts test/api-server.e2e.test.ts
bun run typecheck
```

---

### GET /api/skills/:id/source

Read the raw TypeScript source code of a skill file.

**Response**

```json
{
  "id": "my-skill",
  "source": "import { Action } from '@elizaos/core';\n\nexport const myAction: Action = { ... };"
}
```

---

### PUT /api/skills/:id/source

Write updated source code to a skill file. The server validates basic syntax before saving.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source` | string | Yes | The new TypeScript source code |

**Response**

```json
{
  "ok": true
}
```

---

### PUT /api/skills/:id

Update runtime preferences for a skill (enabled state, priority, custom config).

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | No | Whether the skill is active |
| `priority` | number | No | Sort priority (lower runs first) |
| `config` | object | No | Arbitrary skill-specific configuration |

**Response**

```json
{
  "ok": true,
  "skill": {
    "id": "my-skill",
    "enabled": true,
    "priority": 10
  }
}
```

---

## Skills Catalog

### GET /api/skills/catalog

Browse the curated skills catalog with pagination and sorting.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `perPage` | number | 50 | Items per page (max 100) |
| `sort` | string | `downloads` | Sort field |

**Response**

```json
{
  "skills": [
    {
      "id": "greeting-skill",
      "name": "Greeting Skill",
      "description": "Custom greeting actions",
      "author": "community",
      "downloads": 1234,
      "installed": false
    }
  ],
  "total": 42,
  "page": 1,
  "perPage": 50
}
```

---

### GET /api/skills/catalog/search

Search the catalog by text query.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (required) |
| `limit` | number | Max results (default 30, max 100) |

**Response**

```json
{
  "skills": [ ... ],
  "total": 5
}
```

---

### GET /api/skills/catalog/:id

Get full details for a single catalog skill entry.

**Response**

```json
{
  "skill": {
    "id": "greeting-skill",
    "name": "Greeting Skill",
    "description": "Full description...",
    "author": "community",
    "version": "1.0.0",
    "installed": false,
    "readme": "# Greeting Skill\n..."
  }
}
```

---

### POST /api/skills/catalog/refresh

Force-refresh the catalog from the remote registry.

**Response**

```json
{
  "ok": true
}
```

---

### POST /api/skills/catalog/install

Install a skill from the catalog.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Catalog skill ID |

**Response**

```json
{
  "ok": true,
  "skill": { "id": "greeting-skill", "installed": true }
}
```

---

### POST /api/skills/catalog/uninstall

Uninstall a previously installed catalog skill.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Catalog skill ID |

**Response**

```json
{
  "ok": true
}
```

---

## Skills Marketplace

### GET /api/skills/marketplace/search

Search the npm-based skills marketplace.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query |
| `limit` | number | Max results (default 30, max 100) |

**Response**

```json
{
  "results": [
    {
      "name": "@community/skill-weather",
      "description": "Weather lookup skill",
      "version": "2.1.0"
    }
  ]
}
```

---

### GET /api/skills/marketplace/installed

List all marketplace skills currently installed.

**Response**

```json
{
  "skills": [
    {
      "name": "@community/skill-weather",
      "version": "2.1.0",
      "installedAt": "2025-06-01T12:00:00Z"
    }
  ]
}
```

---

### POST /api/skills/marketplace/install

Install a skill package from the npm marketplace.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | npm package name |
| `version` | string | No | Specific version (defaults to latest) |

**Response**

```json
{
  "ok": true
}
```

---

### POST /api/skills/marketplace/uninstall

Uninstall a marketplace skill package.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | npm package name |

**Response**

```json
{
  "ok": true
}
```

---

### GET /api/skills/marketplace/config

Get the current marketplace configuration.

**Response**

```json
{
  "config": { ... }
}
```

---

### PUT /api/skills/marketplace/config

Update the marketplace configuration.

**Request Body**

Arbitrary configuration object — varies by marketplace backend.

**Response**

```json
{
  "ok": true
}
```
