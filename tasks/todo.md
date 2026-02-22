# Critical Security Patch Plan

## Objective
Patch a critical RCE hardening gap around `/api/terminal/run`.

## Critical Risk
- `/api/terminal/run` executes arbitrary shell commands (`spawn(..., { shell: true })`).
- Prior behavior required only primary API auth, so API token compromise enabled immediate remote command execution.

## Patch
- Add step-up terminal token enforcement via `MILADY_TERMINAL_RUN_TOKEN`.
- Enforce in `/api/terminal/run` before command execution.
- Keep local no-token compatibility mode only when neither API token nor terminal token is configured.

## Checklist
- [x] Add terminal run step-up rejection helper
- [x] Enforce helper in terminal run route
- [x] Add focused auth regression tests
- [x] Run targeted tests
- [x] Review final diff/diffstat
- [x] Commit and open PR

## Verification
- `bunx vitest run src/api/server.terminal-run-auth.test.ts`

## Review Notes
- Targeted test result: pass (`7` tests).
- Direct push to `origin` is blocked by upstream permissions (HTTP 403).
- Patch branch was pushed to writable `fork` and PR opened to upstream `develop`.
