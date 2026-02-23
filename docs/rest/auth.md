---
title: "Auth API"
sidebarTitle: "Auth"
description: "REST API endpoints for API authentication and pairing flow."
---

The Milady API can be secured with a token by setting the `MILADY_API_TOKEN` environment variable. When set, include the token as a `Bearer` token in the `Authorization` header on all requests. The pairing flow allows remote UIs to obtain the token without embedding it directly.

## Authentication Methods

The API supports three authentication headers, checked in priority order:

| Priority | Header | Format | Example |
|----------|--------|--------|---------|
| 1 | `Authorization` | `Bearer <token>` | `Authorization: Bearer sk-milady-...` |
| 2 | `x-milady-token` | Plain token string | `x-milady-token: sk-milady-...` |
| 3 | `x-api-key` | Plain token string | `x-api-key: sk-milady-...` |

When no `MILADY_API_TOKEN` is set, all requests are allowed without authentication.

All token comparisons use `crypto.timingSafeEqual` to prevent timing attacks.

## WebSocket Authentication

WebSocket connections to `/ws` use the same auth headers. Additionally, when `MILADY_ALLOW_WS_QUERY_TOKEN=1` is set, the token can be passed as a query parameter (less secure, useful for clients that cannot set headers):

| Priority | Parameter |
|----------|-----------|
| 1 | `?token=<token>` |
| 2 | `?apiKey=<token>` |
| 3 | `?api_key=<token>` |

Header authentication is always checked first; query parameters are the fallback.

## Pairing Flow

The pairing flow allows remote UIs (like the dashboard) to obtain the API token without embedding it directly. The server displays a pairing code in its logs, and the UI submits it to receive the token.

### How It Works

1. The server generates a pairing code on first request to `GET /api/auth/status`
2. The code is displayed in the server logs: `[milady-api] Pairing code: XXXX-XXXX (valid for 10 minutes)`
3. The user enters the code in the UI, which submits it to `POST /api/auth/pair`
4. On success, the token is returned and the pairing code is cleared

### Pairing Code Format

Codes follow the `XXXX-XXXX` pattern (4 characters, dash, 4 characters). The alphabet excludes visually ambiguous characters:

```
ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```

No `I`, `O`, `0`, or `1` — reducing user input errors.

Code submission normalizes input by stripping non-alphanumeric characters and uppercasing, so the dash is optional when submitting.

### Pairing Code Lifecycle

- Generated lazily on first request to `GET /api/auth/status`
- Valid for **10 minutes** from generation
- Automatically rotated when expired (next request generates a new code)
- Cleared after successful pairing (one-time use)

### Pairing Enabled Condition

Pairing is active when:
- `MILADY_API_TOKEN` is set (non-empty after trimming)
- `MILADY_PAIRING_DISABLED` is not `"1"`

## Rate Limiting

The `POST /api/auth/pair` endpoint is rate-limited per IP address:

| Parameter | Value |
|-----------|-------|
| Max attempts | 5 |
| Window | 10 minutes (sliding) |
| Scope | Per IP address |
| Reset | Window resets after expiry on next attempt |

The IP is resolved from `req.socket.remoteAddress`. When the limit is exceeded, the endpoint returns `429 Too Many Requests`.

## Endpoints

### GET /api/auth/status

Check whether authentication is required and whether the pairing flow is currently enabled. If pairing is enabled, this call ensures a pairing code is generated and ready.

**Response**

```json
{
  "required": true,
  "pairingEnabled": true,
  "expiresAt": 1718003600000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `required` | boolean | `true` when `MILADY_API_TOKEN` is set |
| `pairingEnabled` | boolean | `true` when the pairing flow is active |
| `expiresAt` | number \| null | Unix ms timestamp when the current pairing code expires, or `null` if pairing is disabled |

---

### POST /api/auth/pair

Submit a pairing code to receive the API token. Rate-limited by IP address.

**Request**

```json
{
  "code": "WXYZ-2345"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | Yes | The pairing code from the server logs. Dash is optional |

**Response (success)**

```json
{
  "token": "your-api-token-here"
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| `400` | Pairing not enabled (no `MILADY_API_TOKEN` set) |
| `403` | Pairing disabled or invalid code |
| `410` | Pairing code expired — a new code has been automatically generated |
| `429` | Too many attempts — rate limit exceeded (5 per 10 minutes per IP) |

## CORS

The API server includes these auth-related headers in CORS preflight responses:

```
Access-Control-Allow-Headers: Content-Type, Authorization, X-Milady-Token, X-Api-Key, X-Milady-Export-Token
```

## Related

- [API Reference overview](/api-reference)
- [Environment variables](/cli/environment) — `MILADY_API_TOKEN`, `MILADY_ALLOW_WS_QUERY_TOKEN`, `MILADY_PAIRING_DISABLED`
