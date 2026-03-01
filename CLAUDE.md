# Milady AI Agent

## Project Structure
- `src/` — Core runtime, API server, providers, services, actions
- `apps/app/` — React UI (web/electron)
- `packages/` — Shared packages (mldy, plugins)
- `plugins/` — Custom plugins (retake, streaming, twitch, youtube)
- Runtime: ElizaOS-based (@elizaos/core), Express API, React + AppContext

## Contracts
All shared type contracts live in `src/contracts/`. When adding new system
boundaries, define types here first. Existing: permissions.ts, wallet.ts,
config.ts, onboarding.ts, verification.ts, apps.ts, drop.ts.

## Self-Awareness System (v1)
Architecture: Layered lazy-load + declarative AwarenessContributor.
Full design: docs/plans/2026-03-01-self-awareness-design.md

Key files:
- Contract: src/contracts/awareness.ts (core interface)
- Registry: src/awareness/registry.ts (compose + guardrails)
- Provider: src/providers/self-status.ts (Layer 1, auto-injected ~300 tokens)
- Action: src/actions/get-self-status.ts (Layer 2, on-demand detail)
- Contributors: src/awareness/contributors/*.ts (per-module implementations)

Guardrails (P0):
- Sanitize: never expose secrets/keys/tokens in summary or detail output
- Budget: 300 token global cap (1200 chars), 80 char per-contributor cap
- Isolation: try-catch each contributor, failures → `[{id}: unavailable]`
- Invalidation: event-driven (`invalidateOn`) + TTL-based cache expiry
- Versioning: SELF_STATUS_SCHEMA_VERSION = 1, increment on breaking changes
- Trust: built-in contributors trusted=true, plugin contributors sanitized

Priority order: runtime(10) > permissions(20) > wallet(30) > provider(40) >
  pluginHealth(50) > connectors(60) > cloud(70) > features(80)

New module onboarding:
1. Create src/awareness/contributors/{name}.ts implementing AwarenessContributor
2. Add to builtinContributors array in src/awareness/contributors/index.ts
3. Call awarenessRegistry.invalidate('event') from relevant API routes if needed
4. Done — zero core code changes required

## Provider System
Providers inject context into every LLM turn. Registered in
src/runtime/milady-plugin.ts. Position field controls order (lower = earlier).
Existing: workspaceContext, autonomousState, adminTrust, sessionKey,
channelProfile, uiCatalog, emotes, customActions.

## Sensitive Data Handling
- `isEnvKeyAllowedForForwarding()` in eliza.ts blocks private keys, secrets, tokens
- `BLOCKED_ENV_KEYS` set in server.ts blocks 42 system/auth/wallet keys from API mutation
- `maskValue()` in server.ts: first 4 + last 4 chars for display
- `GETSETTING_ENV_ALLOWLIST` controls process.env fallback access

## Testing
Run tests: `bun test` or `bun run test`
Test files follow pattern: `*.test.ts`, `*.spec.ts`
