---
description: Verify docs quality and source parity with Milady conventions.
argument-hint: [optional docs path]
---

Perform docs verification.

1. Run docs validation:
- `bun run docs:build`

2. If a path is provided, prioritize cross-checking that page/section against current source.

3. Validate naming and runtime conventions:
- Use `Milady` in product/docs headings.
- Use `milady` for CLI/package/config keys.

4. Return:
- Broken links / build issues
- Accuracy drift risks
- Exact file fixes needed
