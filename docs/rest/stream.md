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

Pipes a raw JPEG/image frame buffer to FFmpeg. Used in `pipe` capture mode (Electron `capturePage()`).

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

Returns all available streaming destinations from installed plugins.

**Response:**
```json
{
  "ok": true,
  "destinations": [
    { "id": "twitch", "name": "Twitch" },
    { "id": "youtube", "name": "YouTube" }
  ]
}
```

### Set Active Destination

```
POST /api/streaming/destination
```

**Request body:**
```json
{ "destinationId": "twitch" }
```

**Response:**
```json
{ "ok": true }
```

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
