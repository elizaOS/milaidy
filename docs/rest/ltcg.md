---
title: LTCG Autonomy API
sidebarTitle: LTCG
description: REST API endpoints for controlling the LTCG (Lunch Table Card Game) autonomy loop.
---

These endpoints control the autonomy loop provided by the `@lunchtable/plugin-ltcg` plugin. All endpoints return `500` if the plugin is not installed.

## Get Status

```
GET /api/ltcg/autonomy/status
```

Returns the current autonomy controller state.

**Response:**
```json
{
  "state": "running",
  "mode": "story",
  "continuous": true
}
```

## Start

```
POST /api/ltcg/autonomy/start
```

Starts the LTCG autonomy loop in the specified mode.

**Request body:**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `mode` | string | no | `"story"` |
| `continuous` | boolean | no | `true` |

Valid modes: `"story"`, `"pvp"`.

**Response:**
```json
{ "ok": true, "mode": "story", "continuous": true }
```

## Pause

```
POST /api/ltcg/autonomy/pause
```

Pauses the running autonomy loop without stopping it.

**Response:**
```json
{ "ok": true, "state": "paused" }
```

## Resume

```
POST /api/ltcg/autonomy/resume
```

Resumes a paused autonomy loop.

**Response:**
```json
{ "ok": true, "state": "running" }
```

## Stop

```
POST /api/ltcg/autonomy/stop
```

Stops the autonomy loop entirely and resets to idle.

**Response:**
```json
{ "ok": true, "state": "idle" }
```
