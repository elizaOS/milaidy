# App Hardening Rules

Last updated: 2026-03-18 17:05:42 EDT

## Scope

Use these rules when changing:

- desktop startup and Electrobun bridge code
- onboarding and resume flows
- agent lifecycle and restart paths
- companion/desktop UI chrome and overlay interactions
- release, CI, and pre-review guardrails

## Startup rules

1. `/api/health` must expose an explicit readiness contract.
2. Desktop boot must wait on readiness semantics, not HTTP 200 alone.
3. Startup diagnostics must always include a phase and last known error.
4. Backend-reachable and agent-ready are separate states; do not collapse them.
5. Fresh-install onboarding must remain reachable even when the agent runtime is not yet running.

## Onboarding rules

1. Resume state must prefer committed server state over local inference.
2. Partial onboarding state must never silently advance to a later step.
3. Startup resume must tolerate one stale read and converge on the stable snapshot.
4. API-key placeholders and redacted values must not be treated as valid saved credentials.
5. Onboarding failures must surface phase-specific errors, not generic startup failure.

## Agent lifecycle rules

1. Restart must broadcast `restarting` before process termination.
2. Restart endpoints must be idempotent under duplicate requests.
3. Long-running startup phases must write diagnostics that survive app relaunch.
4. Agent error states must preserve the last startup diagnostics for the UI.
5. Desktop runtime isolation is a feature; do not re-couple renderer liveness to child-process liveness.

## UI interaction rules

1. Do not attach global pointer capture to the whole shell when only the scene needs drag input.
2. Interactive chrome must live on `pointer-events-auto` layers; inert decoration must live on `pointer-events-none` layers.
3. Mark controls and control containers with `data-no-camera-drag="true"` when scene drag logic is active nearby.
4. Always-available controls must meet a 44x44 minimum target.
5. Overlay z-index and hit-testing must be validated together; visual correctness is not enough.

## Release and green rules

1. Pre-review must stay green before opening or updating a PR.
2. Release-critical file changes must trigger release guardrails, not only unit tests.
3. Workflow drift checks should validate structure and required jobs, not brittle string snippets.
4. CI, test, and release environments should share one pinned setup contract wherever possible.
5. Any change that touches startup, onboarding, or release must ship with targeted regression coverage.

## Minimum validation set

```bash
bun run lint
bunx vitest run test/health-endpoint.e2e.test.ts
bunx vitest run packages/app-core/test/app/theme-toggle.test.tsx packages/app-core/test/app/companion-scene-host.test.tsx
```
