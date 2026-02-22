# Cloud Onboarding Fixes - Feb 22, 2026

## Issues Fixed ✅

### 1. Discord OAuth Callback - `localhost:2187/health` Polling
**Problem:** After Discord OAuth redirect, app was stuck on "verifying discord connection" and polling `http://127.0.0.1:2187/health` which doesn't exist.

**Root Cause:** 
- No route handler for `/discord-callback` OAuth redirect
- Frontend trying to connect directly to localhost instead of cloud container's Headscale IP

**Fix:**
- Created `DiscordCallback.tsx` component to handle OAuth callback
- Added `/api/cloud/discord/connect` backend route to proxy Discord OAuth to container
- Updated `App.tsx` to route `/discord-callback` path to handler component
- Whitelisted `/api/cloud/discord/*` in auth bypass check (`server.ts` line 4057)

**Files Changed:**
- `apps/app/src/components/DiscordCallback.tsx` (new)
- `apps/app/src/App.tsx`
- `src/api/cloud-routes.ts`
- `src/api/server.ts`

### 2. CORS Issues - Direct Elizacloud API Calls
**Problem:** `CloudLanding.tsx` was calling `https://www.elizacloud.ai/api/v1/agents` directly from frontend, causing CORS errors.

**Root Cause:** 
- Frontend making cross-origin requests without proper CORS headers
- Elizacloud API doesn't allow CORS from arbitrary origins

**Fix:**
- Added `/api/cloud/elizacloud/agents` (POST) backend proxy for agent creation
- Added `/api/cloud/elizacloud/agents/:id` (GET) backend proxy for status polling
- Updated `CloudLanding.tsx` to use proxied routes with `X-Eliza-Auth` header
- All elizacloud API calls now go through backend proxy

**Files Changed:**
- `src/api/cloud-routes.ts`
- `apps/app/src/components/CloudLanding.tsx`

### 3. Missing Environment Variables
**Problem:** No `.env.example` documenting required Discord OAuth configuration.

**Fix:**
- Created `.env.example` with Discord OAuth vars:
  - `VITE_DISCORD_CLIENT_ID`
  - `VITE_DISCORD_REDIRECT_URI`
- Documented other common config options

**Files Changed:**
- `.env.example` (new)

## Deployment

```bash
# Committed and pushed to fix/cloud-landing-popup branch
git push origin fix/cloud-landing-popup

# Restarted services
./start-services.sh restart
```

**Service Status:**
- API: http://localhost:31337 ✅
- UI: http://localhost:2138 ✅
- PID: 642495
- Logs: /tmp/milaidy-dev.log

## Remaining Setup Required

### Discord Application Setup
To complete the cloud onboarding flow, configure Discord OAuth:

1. Create Discord application at https://discord.com/developers/applications
2. Add OAuth2 redirect URI: `https://yourdomain.com/discord-callback`
3. Create `.env` file in project root:
   ```bash
   VITE_DISCORD_CLIENT_ID=your_discord_app_client_id
   VITE_DISCORD_REDIRECT_URI=https://yourdomain.com/discord-callback
   ```
4. Restart services: `./start-services.sh restart`

**Note:** If testing locally via SSH tunnel, redirect URI should be `http://localhost:2138/discord-callback`

### Public URL Requirement
Cloud onboarding requires a publicly accessible URL for:
- Discord OAuth redirect
- Elizacloud webhook callbacks (future)

**Options:**
- SSH tunnel with ngrok/cloudflare tunnel (dev)
- Deploy to VPS with proper domain (production)
- Use current VPS with reverse proxy (nginx/caddy)

## Testing Checklist

Before testing the full flow:
- [ ] Discord client ID configured in .env
- [ ] Discord redirect URI matches deployment URL
- [ ] Can access UI at configured URL
- [ ] `/api/cloud/elizacloud/device-auth` returns 200 OK
- [ ] `/api/cloud/elizacloud/agents` creates container
- [ ] `/discord-callback` route loads DiscordCallback component
- [ ] `/api/cloud/discord/connect` proxies to container successfully

## Known Issues & Gotchas

### 1. Discord Fallback Values
`CloudLanding.tsx` has fallback values for Discord env vars:
```typescript
const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || "YOUR_DISCORD_CLIENT_ID";
```

These fallbacks will obviously fail. Should either:
- Remove fallbacks and show error UI if missing
- Add runtime validation and friendly error message

### 2. Container Port Assumption
Discord connect proxy assumes container API runs on port `2187`:
```typescript
const containerUrl = `http://${body.containerIp}:2187/api/discord/connect`;
```

If elizacloud containers use different ports, this will fail. May need to:
- Query container metadata for actual port
- Make port configurable
- Use standard elizacloud API to trigger Discord setup

### 3. Headscale IP Wait Time
CloudLanding polls for Headscale IP every 3 seconds, max 10 retries (30s total).
If container network setup takes longer, will timeout with unhelpful error.

**Improvement:** Show progress UI with actual container status from elizacloud API.

### 4. No Error Recovery
If Discord OAuth fails or times out, user is stuck. Should add:
- Retry button
- Back to cloud landing button
- Clear localStorage option

## Architecture Notes

### Cloud Onboarding Flow (Current)

```
1. User clicks "deploy" on CloudLanding
   ↓
2. Device fingerprint generated (browser)
   ↓
3. POST /api/cloud/elizacloud/device-auth (proxied)
   → Returns { userId, apiKey, orgId, credits }
   ↓
4. Store credentials in localStorage
   ↓
5. POST /api/cloud/elizacloud/agents (proxied)
   → Creates elizacloud container
   → Returns { agentId, agentName, ... }
   ↓
6. Poll GET /api/cloud/elizacloud/agents/:id until headscaleIp available
   ↓
7. Store containerIp and agentId in localStorage
   ↓
8. Show Discord setup button
   ↓
9. User clicks → redirects to Discord OAuth
   ↓
10. Discord redirects to /discord-callback?code=xxx
    ↓
11. DiscordCallback component:
    - Extracts code from URL
    - Gets containerIp from localStorage
    - POST /api/cloud/discord/connect
      → Backend proxies to http://{containerIp}:2187/api/discord/connect
    ↓
12. Success → Store discord_connected=true in localStorage
    ↓
13. Redirect to main app (/)
```

### Auth Bypass Paths

The following paths bypass authentication in `server.ts`:
- `/api/auth/*` - Authentication endpoints
- `/api/cloud/elizacloud/*` - Elizacloud proxy routes
- `/api/cloud/discord/*` - Discord setup routes

This allows public access to cloud onboarding flow before agent is configured.

## Next Steps

1. **Test full flow** with proper Discord OAuth config
2. **Add error recovery** UI for failed states
3. **Validate env vars** at startup, show friendly errors if missing
4. **Document deployment** with nginx/caddy reverse proxy
5. **Consider alternative** to direct container API calls (use elizacloud API instead)

## Related Files

### Frontend
- `apps/app/src/components/CloudLanding.tsx` - Main cloud onboarding UI
- `apps/app/src/components/DiscordCallback.tsx` - OAuth callback handler
- `apps/app/src/utils/device-fingerprint.ts` - Device ID generation
- `apps/app/src/App.tsx` - Root routing

### Backend
- `src/api/cloud-routes.ts` - Cloud API proxy routes
- `src/api/server.ts` - Main server with auth bypass logic

### Config
- `.env.example` - Environment variable template
- `DEPLOYMENT.md` - General deployment guide

## Git Info

**Branch:** `fix/cloud-landing-popup`  
**Commits:**
- `437e2a85` - Discord OAuth callback + container proxy
- `d2e52e89` - Proxy elizacloud API calls through backend
- `791d88d4` - Add .env.example with Discord OAuth config

**Status:** Deployed and running (PID 642495)
