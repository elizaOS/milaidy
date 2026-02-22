---
description: Run a focused secure-by-default review for touched code paths.
argument-hint: [path or diff range]
---

Perform security-focused review for milady-ai repository standards.

1. Determine review scope from argument or current diff.
2. Prioritize findings in this order:
- Secret leakage
- Unsafe shell execution
- SSRF/DNS validation gaps
- Unbounded network/body/time operations
- Missing defensive boundaries around IO

3. For each finding include:
- Severity
- File and line reference
- Concrete fix recommendation

4. If no findings, explicitly state that and list residual risks/testing gaps.
