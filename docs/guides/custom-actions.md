---
title: Custom Actions
sidebarTitle: Custom Actions
description: Define user-created agent capabilities with HTTP, shell, and code handlers that extend what the agent can do.
---

# Custom Actions

Custom actions are user-defined capabilities that extend what the Milaidy agent can do at runtime. They allow you to wire up external APIs, run shell commands, or execute inline JavaScript -- all surfaced as first-class actions the agent can invoke during conversations.

## Overview

Custom actions are defined in the `customActions` array in your `milaidy.json` configuration file. At startup, the runtime loads all enabled custom action definitions, converts them into ElizaOS `Action` objects, and registers them with the agent. The agent can then invoke these actions based on conversation context, just like any built-in action.

## Handler Types

Each custom action has a `handler` that specifies how it executes. There are three handler types:

### `http` -- API Call

Makes an HTTP request to an external URL. Parameters are interpolated into the URL (URI-encoded) and body template (raw).

```json
{
  "type": "http",
  "method": "POST",
  "url": "https://api.example.com/data/{{query}}",
  "headers": {
    "Authorization": "Bearer sk-xxx",
    "Content-Type": "application/json"
  },
  "bodyTemplate": "{\"search\": \"{{query}}\"}"
}
```

Handler fields:
- `method` -- HTTP method (GET, POST, PUT, DELETE, etc.)
- `url` -- Target URL with `{{paramName}}` placeholders
- `headers` -- Optional request headers
- `bodyTemplate` -- Optional body with `{{paramName}}` placeholders

Security: HTTP handlers include SSRF protection that blocks requests to private/internal network addresses (localhost, link-local, RFC-1918 ranges). DNS resolution is checked to prevent alias bypasses. Redirects are blocked entirely.

### `shell` -- Command Execution

Runs a shell command via the local terminal API. Parameters are shell-escaped to prevent injection.

```json
{
  "type": "shell",
  "command": "curl -s https://api.example.com/status?q={{query}}"
}
```

Handler fields:
- `command` -- Shell command with `{{paramName}}` placeholders (values are automatically shell-escaped)

Shell commands execute through the `POST /api/terminal/run` endpoint on the local API server.

### `code` -- Inline JavaScript

Executes inline JavaScript in a sandboxed Node.js VM context. The sandbox only exposes `params` (the action parameters) and `fetch` (for HTTP requests). No `require`, `import`, `process`, or `global` access is available.

```json
{
  "type": "code",
  "code": "const res = await fetch('https://api.example.com/data/' + params.id); return await res.text();"
}
```

Handler fields:
- `code` -- JavaScript code to execute (wrapped in an async IIFE, 30-second timeout)

## CustomActionDef Schema

Each custom action definition has the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the action |
| `name` | `string` | Yes | Action name (used by the agent to invoke it) |
| `description` | `string` | Yes | Human-readable description of what the action does |
| `similes` | `string[]` | No | Alternative names/triggers for the action |
| `parameters` | `Array<{name, description, required}>` | Yes | Parameter definitions |
| `handler` | `CustomActionHandler` | Yes | One of `http`, `shell`, or `code` handler objects |
| `enabled` | `boolean` | Yes | Whether the action is active |
| `createdAt` | `string` | Yes | ISO timestamp of creation |
| `updatedAt` | `string` | Yes | ISO timestamp of last update |

Each parameter in the `parameters` array has:
- `name` -- parameter name (used in `{{paramName}}` placeholders)
- `description` -- description shown to the agent
- `required` -- if `true`, the action fails when this parameter is missing

## Defining Custom Actions in milaidy.json

Add custom actions to the `customActions` array in your `milaidy.json`:

```json
{
  "customActions": [
    {
      "id": "weather-check",
      "name": "CHECK_WEATHER",
      "description": "Check the current weather for a given city",
      "similes": ["WEATHER", "GET_WEATHER", "FORECAST"],
      "parameters": [
        {
          "name": "city",
          "description": "The city name to check weather for",
          "required": true
        }
      ],
      "handler": {
        "type": "http",
        "method": "GET",
        "url": "https://wttr.in/{{city}}?format=3"
      },
      "enabled": true,
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

## Runtime Registration

### Startup Loading

At plugin initialization, `loadCustomActions()` reads the `milaidy.json` config, filters to only `enabled` definitions, and converts each into an ElizaOS `Action` object via `defToAction()`. These are then registered with the runtime.

The conversion process:
1. Reads `customActions` from the loaded config
2. Filters out disabled actions (`enabled: false`)
3. For each action, builds an async handler function based on the handler type
4. Maps parameters to ElizaOS parameter format (all as `string` type)
5. Returns the action with `validate: async () => true` (always valid)

### Live Registration

You can register new custom actions at runtime without restarting using `registerCustomActionLive(def)`. This function:

1. Accepts a `CustomActionDef` object
2. Converts it to an ElizaOS `Action` using the same `defToAction()` pipeline
3. Calls `runtime.registerAction()` to make it immediately available
4. Returns the created `Action` object, or `null` if no runtime is available

The runtime reference is stored when `setCustomActionsRuntime()` is called during plugin initialization.

### Testing Actions

The `buildTestHandler(def)` function creates a temporary handler for testing a custom action definition without registering it. It returns a function that accepts parameters and returns `{ ok: boolean; output: string }`.

## Built-in Actions Reference

Milaidy ships with the following built-in actions in `src/actions/`:

| Action | Description |
|--------|-------------|
| `PLAY_EMOTE` | Play an emote animation on the avatar. Emotes are visual gestures or animations that express emotion or action (e.g., wave, dance, cheer). |
| `SEND_MESSAGE` | Send a message to a user or room on a specific platform/service using explicit parameters. |
| `RESTART_AGENT` | Restart the agent process. Stops the runtime, rebuilds if source files changed, and relaunches -- picking up new code, config, or plugins. |
| `INSTALL_PLUGIN` | Install a plugin that is not yet installed. Posts to the local API to install it, then the agent restarts to load the new plugin. |
| `RUN_IN_TERMINAL` | Run a shell command on the server. Posts to the local API to execute it, with output broadcast via WebSocket for real-time display. |
| `GENERATE_IMAGE` | Generate an image from a text prompt using AI image generation. Supports various styles, sizes, and quality settings. |
| `GENERATE_VIDEO` | Generate a video from a text prompt using AI video generation. Can optionally use an input image for image-to-video generation. |
| `GENERATE_AUDIO` | Generate audio or music from a text prompt using AI audio generation. Can create songs, sound effects, or instrumental music. |
| `ANALYZE_IMAGE` | Analyze an image using AI vision to describe its contents, identify objects, read text, or answer questions about the image. |
| `LOG_LEVEL` | Set the log level for the current session (trace, debug, info, warn, error). |
| `EJECT_PLUGIN` | Clone a plugin's source code locally so edits override the npm version at runtime. Use before modifying upstream plugin code. |
| `SYNC_PLUGIN` | Sync an ejected plugin with upstream by fetching and merging new commits. |
| `REINJECT_PLUGIN` | Remove an ejected plugin copy so runtime falls back to the npm package. |
| `EJECT_CORE` | Clone ElizaOS core source locally so edits override npm @elizaos/core. |
| `SYNC_CORE` | Sync an ejected @elizaos/core checkout with upstream and rebuild it. |
| `REINJECT_CORE` | Remove ejected core source so runtime falls back to npm @elizaos/core. |
| `CORE_STATUS` | Show whether @elizaos/core is running from npm or ejected source. |
