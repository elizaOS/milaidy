# Deploy Origin Smoke Runbook

This smoke check prevents cutovers where the app shell is served from an origin
that does not have working `/api/*` routes.

## What It Checks

- `GET /api/status` on each target origin
- Response status is `2xx`
- Response body is valid JSON with a string `state` field
- Per-origin timeout: `10s`

## Local Commands

```bash
bun run smoke:api-status -- https://milady.ai https://app.milady.ai
```

```bash
MILADY_DEPLOY_BASE_URLS=https://milady.ai,https://app.milady.ai bun run smoke:api-status
```

Exit codes:

- `0`: all origins passed
- `1`: at least one origin failed
- `2`: no origins were provided

## GitHub Workflow

Workflow file:

- `.github/workflows/deploy-origin-smoke.yml`

Triggers:

- `workflow_dispatch`
- `repository_dispatch` with event type `pre-cutover-smoke`

### Manual Dispatch

Run **Deploy Origin Smoke** in Actions and override origins if needed.

### Repository Dispatch Example

```bash
gh api repos/milady-ai/milady/dispatches \
  -f event_type=pre-cutover-smoke \
  -f client_payload:='{"marketing_origin":"https://milady.ai","app_origin":"https://app.milady.ai"}'
```

## Expected Failure Output

Examples from `scripts/smoke-api-status.mjs`:

- `[smoke-api-status] FAIL https://milady.ai/api/status returned HTTP 404 Not Found`
- `[smoke-api-status] FAIL https://app.milady.ai timed out after 10000ms`
- `[smoke-api-status] FAIL https://milady.ai/api/status responded without expected status payload.`

## Cutover Rule

Do not cut traffic to an origin unless this smoke check is green for all target
origins.
