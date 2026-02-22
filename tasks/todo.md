# Critical UI Fix Plan (Next)

## Goal
Fix a critical keyboard interaction bug in the Secrets picker dialog.

## Critical Issue
- File: `apps/app/src/components/SecretsView.tsx`
- Current behavior: dialog-level key handler closes picker on `Escape`, `Enter`, and space.
- Impact: Enter/space during search or keyboard interaction can unintentionally close the picker and interrupt secret management flow.

## Proposed Fix
- Change picker dialog key handling to close only on `Escape`.
- Keep click-outside close behavior unchanged.
- Add a focused test proving Enter/space do not close and Escape still closes.

## Checklist
- [x] Implement key handling fix in `SecretsView.tsx`
- [x] Add test coverage in app tests
- [x] Run targeted tests
- [x] Review diff and diffstat
- [ ] Commit on fresh branch
- [ ] Push branch and open PR to `develop`

## Verification Commands
- `bun run --cwd apps/app test -- test/app/secrets-view.test.tsx`
- `git diff -- apps/app/src/components/SecretsView.tsx`
- `git diff --stat`

## Review
- Test run:
  - `bun run --cwd apps/app test -- test/app/secrets-view.test.tsx`
  - Result: 1 test file passed, 1 test passed.
- Diff review:
  - Scoped to a single key-handling condition in `SecretPicker` and one focused regression test.
