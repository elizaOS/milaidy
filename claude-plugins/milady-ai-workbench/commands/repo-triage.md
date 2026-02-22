---
description: Run a fast repository triage for milady-ai style development work.
argument-hint: [optional focus area]
---

You are performing a Milady triage pass.

1. Collect fast context first:
- `git status --short --branch`
- `git log --oneline -n 15`
- `rg --files src packages test | wc -l`

2. If an argument is provided, prioritize that area (for example: `runtime`, `plugin`, `docs`, `tests`).

3. Report:
- Current branch and cleanliness
- Highest-risk touched areas
- Recommended next two commands

4. Keep output concise and execution-focused.
