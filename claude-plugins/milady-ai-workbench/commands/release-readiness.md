---
description: Run release-readiness gates for Milady (check, tests, pre-review, build-local-plugins).
argument-hint: [quick|full]
---

Execute release-readiness flow.

`quick` mode:
- `bun run check`
- `bun run pre-review:local`

`full` mode (default):
- `bun run check`
- `bun run test:once`
- `bun run pre-review:local`
- `bun run build:local-plugins`

Return:
- Gate-by-gate status
- First failing gate if any
- Minimal unblock sequence
