---
title: Stream API
sidebarTitle: Stream
description: REST API endpoints for controlling live streaming, overlays, voice TTS, and stream settings.
---

## Stream Control

### Start Stream (Destination-Managed)

```
POST /api/stream/live
```

Starts streaming using the configured destination adapter. Fetches RTMP credentials automatically from the active destination plugin.

**Response:**
```json
{
  "ok": true,
  "live": true,
  "rtmpUrl": "rtmp://live.twitch.tv/app",
  "inputMode": "pipe",
  "audioSource": "tts",
  "destination": "twitch"
}
```

### Stop Stream

```
POST /api/stream/offline
```

Stops the active stream and notifies the destination plugin.

**Response:**
```json
{ "ok": true, "live": false }
```

### Stream Status

```
GET /api/stream/status
```

Returns current stream health and configuration.

**Response:**
```json
{
  "ok": true,
  "running": true,
  "ffmpegAlive": true,
  "uptime": 3742,
  "frameCount": 112260,
  "volume": 80,
  "muted": false,
  "audioSource": "tts",
  "inputMode": "pipe",
  "destination": "twitch"
}
```

### Start Stream (Direct RTMP)

```
POST /api/stream/start
```

Backward-compatible explicit RTMP start with full parameter control. Prefer `POST /api/stream/live` for destination-managed starts.

**Request body:**
```json
{
  "rtmpUrl": "rtmp://live.twitch.tv/app",
  "rtmpKey": "live_abc123",
  "inputMode": "testsrc",
  "resolution": "1280x720",
  "bitrate": "2500k",
  "framerate": 30
}
```

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `rtmpUrl` | string | yes | — | Must start with `rtmp://` or `rtmps://` |
| `rtmpKey` | string | yes | — | Stream key |
| `inputMode` | string | no | `"testsrc"` | `"testsrc"`, `"avfoundation"`, or `"pipe"` |
| `resolution` | string | no | `"1280x720"` | Must match `/^\d{3,4}x\d{3,4}$/` |
| `bitrate` | string | no | `"2500k"` | Must match `/^\d+k$/` |
| `framerate` | number | no | `30` | Integer 1–60 |

**Response:**
```json
{ "ok": true, "message": "Stream started" }
```

### Stop Stream (Direct)

```
POST /api/stream/stop
```

Stops the active FFmpeg process and returns session uptime.

**Response:**
```json
{ "ok": true, "uptime": 3742 }
```

`uptime` is in seconds.

### Send Frame

```
POST /api/stream/frame
```

Pipes a raw JPEG/image frame buffer to FFmpeg. Used in `pipe` capture mode (desktop runtime page capture).

**Request:** Raw binary body (max 2 MB).

**Response:** `200` with empty body.

**Errors:** `400` empty body; `503` stream not running.

## Audio

### Set Volume

```
POST /api/stream/volume
```

**Request body:**
```json
{ "volume": 80 }
```

`volume` is an integer 0–100.

**Response:**
```json
{ "ok": true, "volume": 80, "muted": false }
```

### Mute

```
POST /api/stream/mute
```

**Response:**
```json
{ "ok": true, "muted": true, "volume": 80 }
```

### Unmute

```
POST /api/stream/unmute
```

**Response:**
```json
{ "ok": true, "muted": false, "volume": 80 }
```

## Destinations

### List Destinations

```
GET /api/streaming/destinations
```

Returns all configured streaming destinations from the multi-destination registry. Each destination indicates whether it is the currently active target.

**Response:**
```json
{
  "ok": true,
  "destinations": [
    { "id": "twitch", "name": "Twitch", "active": true },
    { "id": "youtube", "name": "YouTube", "active": false },
    { "id": "pumpfun", "name": "pump.fun", "active": false },
    { "id": "x", "name": "X/Twitter", "active": false }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `destinations[].id` | string | Unique destination identifier |
| `destinations[].name` | string | Human-readable destination name |
| `destinations[].active` | boolean | Whether this destination is currently selected for streaming |

The active destination defaults to the first registered destination when no explicit selection has been made.

### Set Active Destination

```
POST /api/streaming/destination
```

Switches the active streaming destination at runtime. The selected destination is used for subsequent `POST /api/stream/live` calls to resolve RTMP credentials automatically.

**Request body:**
```json
{ "destinationId": "twitch" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `destinationId` | string | yes | ID of the destination to activate (must match a registered destination) |

**Response (200):**
```json
{
  "ok": true,
  "destination": { "id": "twitch", "name": "Twitch" }
}
```

**Errors:**

| Status | Body | Condition |
|--------|------|-----------|
| `400` | `{ "error": "destinationId is required" }` | Missing or empty `destinationId` |
| `404` | `{ "error": "Unknown destination: <id>" }` | No registered destination matches the provided ID |
| `500` | `{ "error": "<message>" }` | Unexpected server error |

## Overlays

### Get Overlay Layout

```
GET /api/stream/overlay-layout
```

**Query params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `destination` | string | no | Destination ID for per-destination layouts |

**Response:**
```json
{
  "ok": true,
  "layout": {
    "version": 1,
    "widgets": [...]
  },
  "destinationId": "twitch"
}
```

### Save Overlay Layout

```
POST /api/stream/overlay-layout
```

**Request body:**
```json
{
  "layout": {
    "version": 1,
    "widgets": [...]
  }
}
```

**Response:**
```json
{ "ok": true }
```

## Voice (TTS-to-RTMP)

### Get Voice Config

```
GET /api/stream/voice
```

Returns voice configuration and current speaking status.

**Response:**
```json
{
  "enabled": true,
  "autoSpeak": true,
  "provider": "elevenlabs",
  "speaking": false,
  "bridgeAttached": true,
  "apiKeyConfigured": true
}
```

### Save Voice Settings

```
POST /api/stream/voice
```

**Request body:**
```json
{
  "enabled": true,
  "autoSpeak": true,
  "provider": "elevenlabs"
}
```

**Response:**
```json
{ "ok": true }
```

### Speak Text

```
POST /api/stream/voice/speak
```

Manually trigger TTS on the live stream.

**Request body:**
```json
{ "text": "Hello, stream!" }
```

| Constraint | Value |
|------------|-------|
| Max text length | 2000 characters |
| Rate limit | One at a time (429 if speaking) |
| Requires | Stream must be live, TTS bridge attached |

**Response:**
```json
{ "ok": true }
```

**Errors:** `400` text missing/too long; `429` already speaking; `503` bridge not attached.

## Stream Source

### Get Stream Source

```
GET /api/stream/source
```

Returns the currently active stream capture source.

**Response:**
```json
{
  "source": {
    "type": "stream-tab",
    "url": null
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `source.type` | string | Active source type: `"stream-tab"`, `"game"`, or `"custom-url"` |
| `source.url` | string \| null | URL for `game` or `custom-url` sources, `null` for `stream-tab` |

### Set Stream Source

```
POST /api/stream/source
```

Switches the active stream capture source. If a stream is currently running, frame capture is automatically restarted with the new source.

**Request body:**
```json
{
  "sourceType": "game",
  "customUrl": "https://example.com/game"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sourceType` | string | yes | One of `"stream-tab"`, `"game"`, or `"custom-url"` |
| `customUrl` | string | conditional | Required when `sourceType` is `"game"` or `"custom-url"`. Must use `http://` or `https://` scheme |

**Response (200):**
```json
{
  "ok": true,
  "source": {
    "type": "game",
    "url": "https://example.com/game"
  }
}
```

**Errors:**

| Status | Condition |
|--------|-----------|
| `400` | Invalid `sourceType` value |
| `400` | Missing `customUrl` for `game` or `custom-url` source |
| `400` | `customUrl` uses a non-HTTP scheme |

---

## Visual Settings

### Get Stream Settings

```
GET /api/stream/settings
```

**Response:**
```json
{
  "ok": true,
  "settings": {
    "theme": "milady",
    "avatarIndex": 0
  }
}
```

### Save Stream Settings

```
POST /api/stream/settings
```

**Request body:**
```json
{
  "settings": {
    "theme": "milady",
    "avatarIndex": 2
  }
}
```

**Response:**
```json
{ "ok": true }
```
