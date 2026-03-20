# Cloud Agent Onboarding Bypass

## Problem

When users access cloud-provisioned agents via `https://<uuid>.milady.ai/?token=xxx`, they were being asked to:
1. Enter a pairing code (auth)
2. Complete onboarding setup

This is unnecessary because:
- The platform (nginx) injects the API token automatically
- The agent container is pre-configured by the cloud platform

## Solution

Added cloud-provisioning detection in `src/api/server.ts` that bypasses auth and onboarding for cloud containers:

### Environment Variable

Set `MILADY_CLOUD_PROVISIONED=1` (or `ELIZA_CLOUD_PROVISIONED=1`) on cloud-provisioned containers.

### Behavior When Cloud Provisioned

1. **`GET /api/auth/status`** returns:
   ```json
   { "required": false, "pairingEnabled": false, "expiresAt": null }
   ```
   - Frontend skips pairing screen entirely

2. **`GET /api/onboarding/status`** returns:
   ```json
   { "complete": true }
   ```
   - Frontend skips onboarding and goes directly to chat

## Complete Flow

1. Cloud platform provisions container with:
   - `MILADY_CLOUD_PROVISIONED=1`
   - `MILADY_API_TOKEN=<secret>`
   - Any other required config

2. User opens `https://<uuid>.milady.ai/?token=<secret>`

3. Nginx reverse proxy injects inline JS that sets:
   - `window.__MILADY_API_TOKEN__ = "<secret>"`
   - `sessionStorage.setItem("milady_api_token", "<secret>")`

4. Frontend loads and constructs API client with injected token

5. Frontend calls `/api/auth/status`:
   - Server detects `MILADY_CLOUD_PROVISIONED=1`
   - Returns `{ required: false, pairingEnabled: false }`
   - Frontend doesn't ask for pairing

6. Frontend calls `/api/onboarding/status`:
   - Server detects `MILADY_CLOUD_PROVISIONED=1`
   - Returns `{ complete: true }`
   - Frontend skips onboarding

7. Frontend shows chat interface immediately

## Token Auth Flow

The injected token is used for API authorization:
- Frontend includes `Authorization: Bearer <token>` in API requests
- Server validates against `MILADY_API_TOKEN` env var
- All API calls are authenticated without user interaction

## Files Changed

- `src/api/server.ts`: Added `isCloudProvisioned()` helper and route handlers

## Testing

```bash
# Simulate cloud container environment
MILADY_CLOUD_PROVISIONED=1 MILADY_API_TOKEN=test bun run start

# Test auth status
curl -s http://localhost:2138/api/auth/status
# Should return: {"required":false,"pairingEnabled":false,"expiresAt":null}

# Test onboarding status
curl -s http://localhost:2138/api/onboarding/status
# Should return: {"complete":true}
```
