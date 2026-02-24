---
title: "Permissions API"
sidebarTitle: "Permissions"
description: "REST API endpoints for reading and managing system permission states, including shell access control."
---

The permissions API manages OS-level permissions (microphone, camera, screen recording, etc.) and the shell access toggle. Permission states are tracked in server memory and updated via Electron IPC in desktop deployments. Shell access controls whether the agent can execute terminal commands.

## Telemetry events

For QA/debugging, permission mutation endpoints emit a `permissions_telemetry` event for:

- `POST /api/permissions/:id/request`
- `POST /api/permissions/:id/open-settings`
- `PUT /api/permissions/shell`

The event is returned in the endpoint response as `telemetry` and also broadcast over `/ws` with the same payload.

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Always `permissions_telemetry` |
| `source` | string | Always `api` |
| `action` | string | `request`, `open-settings`, or `shell-toggle` |
| `permissionId` | string | Permission identifier (`microphone`, `camera`, `shell`, etc.) |
| `method` | string | HTTP method that triggered the event |
| `path` | string | Request path that triggered the event |
| `ts` | number | Event timestamp (epoch milliseconds) |
| `enabled` | boolean | Present for shell toggles; resulting shell state |
| `previousEnabled` | boolean | Present for shell toggles; prior shell state |
| `restartScheduled` | boolean | Present for shell toggles; whether runtime restart was queued |

## Endpoints

### GET /api/permissions

Get all system permission states.

**Response**

```json
{
  "permissions": {
    "microphone": {
      "id": "microphone",
      "status": "granted",
      "lastChecked": 1718000000000,
      "canRequest": false
    },
    "camera": {
      "id": "camera",
      "status": "denied",
      "lastChecked": 1718000000000,
      "canRequest": true
    }
  },
  "platform": "darwin",
  "shellEnabled": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `permissions` | object | Map of permission ID to permission state |
| `platform` | string | Operating system platform (`darwin`, `win32`, `linux`) |
| `shellEnabled` | boolean | Whether shell command execution is currently enabled |

---

### GET /api/permissions/definitions

Get canonical permission metadata from the runtime registry, including whether each permission applies on the current platform.

**Response**

```json
{
  "platform": "darwin",
  "permissions": [
    {
      "id": "microphone",
      "name": "Microphone",
      "description": "Voice input for talk mode and speech recognition",
      "icon": "mic",
      "platforms": ["darwin", "win32", "linux"],
      "requiredForFeatures": ["talkmode", "voice"],
      "applicable": true
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `platform` | string | Current OS platform |
| `permissions` | array | Permission definitions from registry |
| `permissions[].applicable` | boolean | Whether that permission applies on the current platform |

---

### GET /api/permissions/:id

Get the state of a single permission. Returns `"not-applicable"` status if the permission ID is not tracked.

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Permission identifier (e.g., `microphone`, `camera`, `screen-recording`) |

**Response**

```json
{
  "id": "microphone",
  "status": "granted",
  "lastChecked": 1718000000000,
  "canRequest": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"granted"`, `"denied"`, `"not-determined"`, or `"not-applicable"` |
| `canRequest` | boolean | Whether the app can request this permission via system prompt |

---

### GET /api/permissions/shell

Get the shell access toggle status.

**Response**

```json
{
  "enabled": true,
  "id": "shell",
  "status": "granted",
  "lastChecked": 1718000000000,
  "canRequest": false,
  "permission": {
    "id": "shell",
    "status": "granted",
    "lastChecked": 1718000000000,
    "canRequest": false
  }
}
```

---

### PUT /api/permissions/shell

Toggle shell access on or off. When changed while the agent is running, schedules a runtime restart so plugin loading respects the new setting.

**Request**

```json
{
  "enabled": false
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `enabled` | boolean | Yes | `true` to allow shell command execution, `false` to block it |

**Response**

```json
{
  "shellEnabled": false,
  "permission": {
    "id": "shell",
    "status": "denied",
    "lastChecked": 1718000000000,
    "canRequest": false
  },
  "telemetry": {
    "type": "permissions_telemetry",
    "source": "api",
    "action": "shell-toggle",
    "permissionId": "shell",
    "method": "PUT",
    "path": "/api/permissions/shell",
    "enabled": false,
    "previousEnabled": true,
    "restartScheduled": true,
    "ts": 1718000000000
  }
}
```

---

### PUT /api/permissions/state

Update permission states in bulk. Used by the Electron renderer after receiving updated permission states via IPC.
Malformed entries are ignored and valid entries are normalized into a stable shape.

**Request**

```json
{
  "permissions": {
    "microphone": {
      "id": "microphone",
      "status": "granted",
      "lastChecked": 1718000000000,
      "canRequest": false
    }
  }
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `permissions` | object | Yes | Map of permission ID to permission state object |

**Response**

```json
{
  "updated": true,
  "permissions": { "microphone": { "id": "microphone", "status": "granted" } }
}
```

---

### POST /api/permissions/refresh

Force refresh all permission states. In Electron deployments, this signals the renderer to re-check permissions via IPC.

**Response**

```json
{
  "message": "Permission refresh requested",
  "action": "ipc:permissions:refresh"
}
```

---

### POST /api/permissions/:id/request

Request a specific system permission. In Electron deployments, this triggers a native system permission prompt.
The `id` must be a known permission from the registry.

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Permission identifier |

**Response**

```json
{
  "message": "Permission request for microphone",
  "action": "ipc:permissions:request:microphone",
  "telemetry": {
    "type": "permissions_telemetry",
    "source": "api",
    "action": "request",
    "permissionId": "microphone",
    "method": "POST",
    "path": "/api/permissions/microphone/request",
    "ts": 1718000000000
  }
}
```

---

### POST /api/permissions/:id/open-settings

Open system settings for a specific permission (e.g., macOS Privacy & Security settings).
The `id` must be a known permission from the registry.

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Permission identifier |

**Response**

```json
{
  "message": "Opening settings for microphone",
  "action": "ipc:permissions:openSettings:microphone",
  "telemetry": {
    "type": "permissions_telemetry",
    "source": "api",
    "action": "open-settings",
    "permissionId": "microphone",
    "method": "POST",
    "path": "/api/permissions/microphone/open-settings",
    "ts": 1718000000000
  }
}
```
