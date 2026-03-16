# Test Suite for `@milady/autonomous` Package

**Date:** 2026-03-17
**Branch:** `upstream/shaw/autonomous-package-foundation` (PR #983)
**Goal:** Add comprehensive test coverage to the extracted `@milady/autonomous` package before it merges to develop.

## Context

PR #983 extracts the Milady backend monolith into `packages/autonomous` — a publishable `@milady/autonomous` npm package with 131 source files covering API routes, auth, security, services, contracts, runtime, hooks, and diagnostics.

The package currently has **5 test files** (4 hook tests + 1 lifecycle e2e). The entire API layer (28 route files), security module, auth module, services, contracts, and diagnostics have zero dedicated tests.

Shaw's existing test infrastructure provides:
- `createRouteInvoker()` — wraps route handlers for unit testing without HTTP servers
- `createMockIncomingMessage()` / `createMockHttpResponse()` — mock HTTP primitives
- `createMockJsonRequest()` — convenience for JSON body requests
- `RouteInvocationResult` — typed test assertion target

## Architecture

All route handlers use dependency injection via typed context interfaces (e.g., `AuthRouteContext`, `WalletRouteDependencies`). Tests mock the context, invoke the handler through `createRouteInvoker()`, and assert on `{ handled, status, payload }`.

No real servers, databases, or external services needed.

## Test File Structure

```
packages/autonomous/
├── test/
│   ├── api/
│   │   ├── lifecycle.test.ts              (exists)
│   │   ├── auth-routes.test.ts
│   │   ├── agent-lifecycle-routes.test.ts
│   │   ├── agent-admin-routes.test.ts
│   │   ├── agent-transfer-routes.test.ts
│   │   ├── wallet-routes.test.ts
│   │   ├── knowledge-routes.test.ts
│   │   ├── character-routes.test.ts
│   │   ├── permissions-routes.test.ts
│   │   ├── cloud-routes.test.ts
│   │   ├── cloud-status-routes.test.ts
│   │   ├── cloud-billing-routes.test.ts
│   │   ├── diagnostics-routes.test.ts
│   │   ├── models-routes.test.ts
│   │   ├── stream-routes.test.ts
│   │   ├── registry-routes.test.ts
│   │   ├── subscription-routes.test.ts
│   │   ├── trigger-routes.test.ts
│   │   ├── sandbox-routes.test.ts
│   │   ├── signal-routes.test.ts
│   │   ├── bug-report-routes.test.ts
│   │   ├── trajectory-routes.test.ts
│   │   ├── nfa-routes.test.ts
│   │   └── training-routes.test.ts
│   ├── security/
│   │   ├── network-policy.test.ts
│   │   └── audit-log.test.ts
│   ├── auth/
│   │   └── credentials.test.ts
│   ├── services/
│   │   └── version-compat.test.ts
│   ├── contracts/
│   │   └── permissions.test.ts
│   └── diagnostics/
│       └── integration-observability.test.ts
```

## Priority Tiers

### Tier 1 — High-risk, security-critical (implement first)

| File | What to test | Est. cases |
|------|-------------|------------|
| `auth-routes.test.ts` | GET /api/auth/status shape, POST /api/auth/pair success/fail, rate limiting (>N requests blocked), invalid/missing code, pairing disabled state | 8-10 |
| `agent-lifecycle-routes.test.ts` | State machine: not_started→starting→running→paused→stopped, invalid transitions rejected, concurrent start rejected, startedAt/model tracking | 10-12 |
| `wallet-routes.test.ts` | Address listing, EVM/Solana balance fetch delegation, NFT fetch, private key validation rejection, wallet generation, import with invalid key | 10-12 |
| `permissions-routes.test.ts` | GET /api/permissions response shape, platform field, shellEnabled, permission state updates, restart scheduling on change | 6-8 |
| `knowledge-routes.test.ts` | Upload within 32MB limit, reject over limit, bulk upload ≤100 docs, reject >100, URL import ≤10MB, fragment batching at 500 | 8-10 |
| `network-policy.test.ts` | IPv4 normalization, IPv6 normalization, IPv6-mapped IPv4, blocked private ranges (10.x, 172.16-31.x, 192.168.x), link-local blocked, loopback blocked, public IP allowed | 12-15 |
| `audit-log.test.ts` | Append event, query by type/severity/time range, subscribe/unsubscribe, max entries rotation (5000), all 13 event types accepted | 10-12 |

**Tier 1 total: ~65-80 test cases**

### Tier 2 — Core functionality

| File | What to test | Est. cases |
|------|-------------|------------|
| `agent-admin-routes.test.ts` | Restart flow, reject restart while already restarting, pending restart reasons | 5-6 |
| `agent-transfer-routes.test.ts` | Export with password, import with password, reject >512MB export | 4-5 |
| `character-routes.test.ts` | Character CRUD, validation (missing fields), generate fields (bio/system/style), append vs replace mode, random name picking | 8-10 |
| `cloud-routes.test.ts` | Cloud manager null check, agent operations delegation, config save callback | 5-6 |
| `cloud-status-routes.test.ts` | Credit balance fetch, cloud URL validation | 3-4 |
| `cloud-billing-routes.test.ts` | Proxy timeout (15s), body size limit (1MB), max redirects (4) | 4-5 |
| `diagnostics-routes.test.ts` | Log buffer query, event buffer query, SSE init, relay reachability check, extension path resolution, audit feed integration | 8-10 |
| `subscription-routes.test.ts` | GET /api/subscription/status shape, OAuth flow initiation, provider loading | 5-6 |
| `registry-routes.test.ts` | GET /api/registry/plugins with install status, bundled vs loaded distinction | 4-5 |
| `version-compat.test.ts` | Compatible versions pass, incompatible fail, missing exports detected, advisory message generation, critical exports map accuracy | 6-8 |
| `integration-observability.test.ts` | Span creation, success/failure recording, duration measurement, error kind inference (timeout detection), custom sink | 6-8 |

**Tier 2 total: ~58-73 test cases**

### Tier 3 — Lower risk / simpler routes

| File | What to test | Est. cases |
|------|-------------|------------|
| `models-routes.test.ts` | GET /api/models with provider param, refresh flag, all providers fetch | 3-4 |
| `trigger-routes.test.ts` | List triggers, execute trigger, health snapshot, trigger limit enforcement | 4-5 |
| `stream-routes.test.ts` | MJPEG subscriber management, frame posting, screen endpoint | 3-4 |
| `sandbox-routes.test.ts` | GET /api/sandbox/platform (no manager needed), status check, Docker start, input length limits (4096), audio format validation | 6-8 |
| `signal-routes.test.ts` | POST /api/signal/pair, max 10 concurrent sessions, session cleanup | 3-4 |
| `bug-report-routes.test.ts` | Submission success, rate limit (5 per 10min per IP), GitHub URL construction | 3-4 |
| `trajectory-routes.test.ts` | List with filters (status/date/search), export JSON/CSV/ZIP, delete | 5-6 |
| `nfa-routes.test.ts` | GET /api/nfa/status reads ~/.milady/ | 2-3 |
| `training-routes.test.ts` | Status check, list trajectories, build dataset, start/cancel job, loopback host validation | 5-6 |
| `credentials.test.ts` | Save/load credentials, file permissions (0o600), token refresh timing (5min buffer), provider resolution | 5-6 |
| `permissions.test.ts` | Permission state tracking, platform-specific availability, cache timeout | 4-5 |

**Tier 3 total: ~43-55 test cases**

## Test Pattern

Every test file follows this structure:

```typescript
import { describe, test, expect, vi } from "vitest";
import { createRouteInvoker } from "../../src/test-support/route-test-helpers";
import { handleAuthRoutes } from "../../src/api/auth-routes";
import type { AuthRouteContext } from "../../src/api/auth-routes";

function buildContext(overrides?: Partial<AuthRouteContext>): AuthRouteContext {
  return {
    pairingEnabled: () => true,
    ensurePairingCode: () => "ABC123",
    normalizePairingCode: (code: string) => code.toUpperCase().trim(),
    rateLimitPairing: () => false,
    getPairingExpiresAt: () => Date.now() + 60_000,
    clearPairing: vi.fn(),
    ...overrides,
  };
}

describe("auth-routes", () => {
  test("GET /api/auth/status returns pairing state", async () => {
    const invoke = createRouteInvoker(handleAuthRoutes, {
      defaultContext: buildContext(),
    });
    const { status, payload } = await invoke({
      method: "GET",
      pathname: "/api/auth/status",
    });
    expect(status).toBe(200);
    expect(payload).toHaveProperty("pairingRequired");
    expect(payload).toHaveProperty("enabled", true);
  });

  test("POST /api/auth/pair rejects when rate limited", async () => {
    const invoke = createRouteInvoker(handleAuthRoutes, {
      defaultContext: buildContext({ rateLimitPairing: () => true }),
    });
    const { status } = await invoke({
      method: "POST",
      pathname: "/api/auth/pair",
      body: { code: "ABC123" },
    });
    expect(status).toBe(429);
  });
});
```

For non-route modules (security, services, contracts), tests import the functions directly and assert on return values.

## What we are NOT testing

- The monolithic `server.ts` (17,592 lines) — that's integration-level, not our scope
- Real HTTP connections, databases, or external APIs
- LLM responses or runtime plugin discovery
- Existing hook tests (already covered by Shaw)
- `apps/home` or `packages/app-core` (separate effort)

## Success criteria

- All new test files pass via `bunx vitest run` from the package root
- Tests follow Shaw's existing patterns (route-test-helpers, mock HTTP)
- No flaky tests — all deterministic with mocked dependencies
- Each route file has at least one happy-path and one error-path test

## Estimated scope

~27 new test files, **166-208 test cases** total across all tiers.
