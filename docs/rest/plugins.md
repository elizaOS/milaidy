---
title: "Plugin Registry API"
sidebarTitle: "Plugins"
description: "REST API endpoints for browsing and searching the ElizaOS plugin registry."
---

The plugin registry API provides access to the ElizaOS plugin registry — a catalog of all available community and first-party plugins. Registry data is cached locally and can be refreshed on demand. Each plugin entry includes installation and load status relative to the current agent.

## Endpoints

### GET /api/registry/plugins

List all plugins from the ElizaOS registry with installation and load status.

**Response**

```json
{
  "count": 87,
  "plugins": [
    {
      "name": "@elizaos/plugin-twitter",
      "displayName": "Twitter",
      "description": "Twitter/X integration for posting and monitoring",
      "npm": {
        "package": "@elizaos/plugin-twitter",
        "version": "1.2.0"
      },
      "installed": false,
      "installedVersion": null,
      "loaded": false,
      "bundled": false
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Full npm package name |
| `installed` | boolean | Whether this plugin is currently installed |
| `installedVersion` | string \| null | Installed version, or `null` if not installed |
| `loaded` | boolean | Whether this plugin is loaded in the running agent runtime |
| `bundled` | boolean | Whether this plugin is bundled into the Milaidy binary |

---

### GET /api/registry/plugins/:name

Get details for a specific registry plugin. The `name` parameter should be URL-encoded if it contains slashes (e.g., `%40elizaos%2Fplugin-twitter`).

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Full npm package name (URL-encoded) |

**Response**

```json
{
  "plugin": {
    "name": "@elizaos/plugin-twitter",
    "displayName": "Twitter",
    "description": "Twitter/X integration for posting and monitoring",
    "npm": {
      "package": "@elizaos/plugin-twitter",
      "version": "1.2.0"
    },
    "author": "ElizaOS Team",
    "repository": "https://github.com/elizaos/eliza",
    "tags": ["social", "twitter"],
    "installed": false,
    "loaded": false,
    "bundled": false
  }
}
```

---

### GET /api/registry/search

Search the plugin registry by keyword.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Search query |
| `limit` | integer | No | Maximum results to return (default: 15, max: 50) |

**Response**

```json
{
  "query": "twitter",
  "count": 2,
  "results": [
    {
      "name": "@elizaos/plugin-twitter",
      "displayName": "Twitter",
      "description": "Twitter/X integration",
      "npmPackage": "@elizaos/plugin-twitter",
      "version": "1.2.0"
    }
  ]
}
```

---

### POST /api/registry/refresh

Force refresh the local registry cache from the upstream ElizaOS registry.

**Response**

```json
{
  "ok": true,
  "count": 87
}
```
