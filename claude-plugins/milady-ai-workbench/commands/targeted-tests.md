---
description: Map changed files to targeted tests, run fast checks first, then full fallback only if needed.
argument-hint: [path or module]
---

Perform Milady-style targeted testing.

1. Determine scope:
- If argument provided, use it as target path/module.
- Else derive changed files from `git diff --name-only` and `git diff --name-only --cached`.

2. Run fastest relevant tests first:
- Unit test files closest to touched source
- Focused vitest runs before full suites

3. Escalate only if necessary:
- Run broader suite when focused tests are insufficient or failing patterns suggest integration risk.

4. Return:
- Commands executed
- Pass/fail summary
- Remaining untested risk areas
