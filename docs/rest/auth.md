---
title: "Auth API"
sidebarTitle: "Auth"
description: "REST API endpoints for API authentication and pairing flow."
---

The Milaidy API can be secured with a token by setting the `MILAIDY_API_TOKEN` environment variable. When set, include the token as a `Bearer` token in the `Authorization` header on all requests. The pairing flow allows remote UIs to obtain the token without embedding it directly.

## Endpoints

### GET /api/auth/status

Check whether authentication is required and whether the pairing flow is currently enabled. If pairing is enabled, this call also ensures a pairing code is generated and ready.

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
| `required` | boolean | `true` when `MILAIDY_API_TOKEN` is set |
| `pairingEnabled` | boolean | `true` when the pairing flow is active |
| `expiresAt` | number \| null | Unix ms timestamp when the pairing code expires, or `null` if pairing is disabled |

---

### POST /api/auth/pair

Submit a pairing code displayed in the server logs to receive the API token. This endpoint is rate-limited by IP address to prevent brute force attacks. Returns `410 Gone` if the code has expired (a new code will be generated automatically).

**Request**

```json
{
  "code": "ABC123"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | Yes | The pairing code shown in the server logs |

**Response**

```json
{
  "token": "your-api-token-here"
}
```

**Error responses**

| Status | Condition |
|--------|-----------|
| `400` | Pairing not enabled (no `MILAIDY_API_TOKEN` set) |
| `403` | Pairing disabled or invalid code |
| `410` | Pairing code expired — a new code has been issued |
| `429` | Too many attempts — rate limit exceeded |
