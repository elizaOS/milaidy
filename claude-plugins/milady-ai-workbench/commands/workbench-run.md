---
description: Execute a named workflow via @milaidy/plugin-claude-code-workbench API route when available.
argument-hint: <workflow-id>
---

Run the requested workflow through the runtime workbench API if available.

1. Require a workflow id argument.
2. Try API path first:
- `curl -sS -X POST http://localhost:3000/claude-code-workbench/run -H 'content-type: application/json' -d '{"workflow":"<workflow-id>"}'`
3. If API unavailable, fall back to equivalent local command when known.
4. Return structured result:
- Execution path (API vs fallback)
- Exit status
- Key output summary
