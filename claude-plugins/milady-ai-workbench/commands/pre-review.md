---
description: Run Milady local pre-review parity and summarize actionable findings.
argument-hint: [optional follow-up focus]
---

Run local review parity checks and return a deterministic outcome.

1. Execute:
- `bun run pre-review:local`

2. If review fails, extract:
- Exact failing gate(s)
- File-level root causes
- Minimal fix plan ordered by severity

3. If review passes, report:
- Decision (`APPROVE`)
- Any residual risk or testing gaps

4. If an argument is present, emphasize that area in remediation.
