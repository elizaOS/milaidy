---
title: "Plugins & Registry API"
sidebarTitle: "Plugins"
description: "REST API endpoints for plugin management, the ElizaOS plugin registry, and core plugin operations."
---

The plugins API manages the agent's plugin system. It covers three areas: **plugin management** (listing, configuring, enabling/disabling installed plugins), **plugin installation** (install, uninstall, eject, sync from npm), and the **plugin registry** (browsing the ElizaOS community catalog).

## Endpoints

### Plugin Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plugins` | List all plugins with status and config |
| PUT | `/api/plugins/:id` | Update a plugin (enable/disable, configure) |
| POST | `/api/plugins/:id/test` | Test a plugin's connectivity |
| GET | `/api/plugins/installed` | List installed plugin packages |
| GET | `/api/plugins/ejected` | List ejected (local copy) plugins |

### Plugin Installation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/plugins/install` | Install a plugin from npm |
| POST | `/api/plugins/uninstall` | Uninstall a plugin |
| POST | `/api/plugins/:id/eject` | Eject a plugin to a local copy |
| POST | `/api/plugins/:id/sync` | Sync an ejected plugin back to npm |

### Core Plugin Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/core/status` | Core manager status |
| GET | `/api/plugins/core` | List core plugins with status |
| POST | `/api/plugins/core/toggle` | Toggle a core plugin |

### Plugin Registry

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/registry/plugins` | List all registry plugins |
| GET | `/api/registry/plugins/:name` | Get details for a registry plugin |
| GET | `/api/registry/search` | Search the registry |
| POST | `/api/registry/refresh` | Refresh the registry cache |
| GET | `/api/registry/status` | Registry connection status |
| POST | `/api/registry/register` | Register the agent with the registry |
| POST | `/api/registry/update-uri` | Update the agent's registry URI |
| POST | `/api/registry/sync` | Sync agent state with the registry |
| GET | `/api/registry/config` | Get registry configuration |

---

## Plugin Management

### GET /api/plugins

List all known plugins — bundled, installed, and discovered from config. Each entry includes enabled/active state, configuration parameters with current values (sensitive values masked), and validation results.

**Response**

```json
{
  "plugins": [
    {
      "id": "twitter",
      "name": "Twitter",
      "description": "Twitter/X integration",
      "category": "social",
      "enabled": true,
      "isActive": true,
      "configured": true,
      "loadError": null,
      "parameters": [
        {
          "key": "TWITTER_API_KEY",
          "required": true,
          "sensitive": true,
          "isSet": true,
          "currentValue": "sk-****...xxxx"
        }
      ],
      "validationErrors": [],
      "validationWarnings": []
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Plugin identifier |
| `enabled` | boolean | Whether user wants it active (config-driven) |
| `isActive` | boolean | Whether it is actually loaded in the runtime |
| `configured` | boolean | Whether all required parameters are set |
| `loadError` | string\|null | Error message if installed but failed to load |

---

### PUT /api/plugins/:id

Update a plugin's enabled state and/or configuration. Enabling/disabling a plugin schedules a runtime restart.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | No | Enable or disable the plugin |
| `config` | object | No | Map of parameter keys to new values |

```json
{
  "enabled": true,
  "config": {
    "TWITTER_API_KEY": "sk-new-key"
  }
}
```

**Response**

```json
{
  "ok": true,
  "plugin": { "id": "twitter", "enabled": true, "..." : "..." }
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| 404 | Plugin not found |
| 422 | Config validation failed |

---

### POST /api/plugins/:id/test

Test a plugin's connectivity or configuration. The test behavior is plugin-specific (e.g. verifying API key validity, checking endpoint reachability).

**Response**

```json
{
  "ok": true,
  "result": { "..." : "..." }
}
```

---

### GET /api/plugins/installed

List all installed plugin packages with version information.

**Response**

```json
{
  "plugins": [
    {
      "name": "@elizaos/plugin-twitter",
      "version": "1.2.0",
      "installedAt": "2025-06-01T12:00:00.000Z"
    }
  ]
}
```

---

### GET /api/plugins/ejected

List all ejected plugins (plugins that have been copied to a local directory for development).

**Response**

```json
{
  "plugins": [
    {
      "name": "@elizaos/plugin-twitter",
      "localPath": "/path/to/local/plugin-twitter"
    }
  ]
}
```

---

## Plugin Installation

### POST /api/plugins/install

Install a plugin package from npm.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | npm package name |
| `version` | string | No | Version (defaults to latest) |

**Response**

```json
{
  "ok": true,
  "requiresRestart": true
}
```

---

### POST /api/plugins/uninstall

Uninstall a plugin package.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | npm package name |

**Response**

```json
{
  "ok": true,
  "requiresRestart": true
}
```

---

### POST /api/plugins/:id/eject

Eject a plugin to a local directory for development. Creates a local copy of the plugin source that can be modified independently.

**Response**

```json
{
  "ok": true,
  "localPath": "/path/to/local/plugin-copy"
}
```

---

### POST /api/plugins/:id/sync

Sync an ejected plugin back — re-build from the local copy.

**Response**

```json
{
  "ok": true
}
```

---

## Core Plugin Management

### GET /api/core/status

Get the core manager status and available core plugins.

**Response**

```json
{
  "available": true,
  "corePlugins": ["bootstrap", "knowledge", "sql"],
  "optionalCorePlugins": ["secrets-manager"]
}
```

---

### GET /api/plugins/core

List core and optional-core plugins with their enabled/loaded status.

**Response**

```json
{
  "core": [
    { "name": "bootstrap", "loaded": true, "required": true }
  ],
  "optionalCore": [
    { "name": "secrets-manager", "loaded": true, "required": false, "enabled": true }
  ]
}
```

---

### POST /api/plugins/core/toggle

Toggle an optional core plugin on or off.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Core plugin name |
| `enabled` | boolean | Yes | Desired state |

**Response**

```json
{
  "ok": true,
  "requiresRestart": true
}
```

---

## Plugin Registry

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
| `installedVersion` | string\|null | Installed version, or `null` if not installed |
| `loaded` | boolean | Whether this plugin is loaded in the running agent runtime |
| `bundled` | boolean | Whether this plugin is bundled into the Milady binary |

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

---

### GET /api/registry/status

Get the agent's registry connection status.

**Response**

```json
{
  "registered": true,
  "agentId": "uuid",
  "registryUrl": "https://registry.elizaos.com"
}
```

---

### POST /api/registry/register

Register the agent with the ElizaOS registry.

**Response**

```json
{
  "ok": true
}
```

---

### POST /api/registry/update-uri

Update the agent's public URI in the registry.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uri` | string | Yes | New public URI |

**Response**

```json
{
  "ok": true
}
```

---

### POST /api/registry/sync

Sync the agent's state with the registry (heartbeat, status update).

**Response**

```json
{
  "ok": true
}
```

---

### GET /api/registry/config

Get the current registry configuration.

**Response**

```json
{
  "registryUrl": "https://registry.elizaos.com",
  "autoRegister": true,
  "syncInterval": 300000
}
```
