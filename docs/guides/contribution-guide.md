---
title: Contribution Guide
sidebarTitle: Contribution Guide
summary: Practical contribution standards for shipping safe, tested changes in Milady.
description: Scope, workflow, testing, and review expectations for Milady contributors.
---

This guide describes how to contribute changes that pass review quickly.

## 1) Scope expectations

In-scope contribution types:

- bug fixes,
- security fixes,
- test coverage improvements,
- documentation accuracy,
- performance improvements with evidence.

Out-of-scope contribution types:

- purely aesthetic redesigns,
- theme-only changes,
- visual polish without capability impact.

## 2) Local setup

```bash
git clone https://github.com/milady-ai/milady.git
cd milady
bun install
```

## 3) Required quality checks

Run before opening a PR:

```bash
bun run check
bun run test
```

Use targeted checks as needed:

```bash
bun run test:e2e
bun run test:coverage
bun run db:check
```

## 4) Contribution workflow

1. Keep scope narrow.
2. Reproduce issue or define behavior target.
3. Add/update tests.
4. Implement minimal change.
5. Run checks.
6. Self-review for scope creep/security.
7. Commit with concise action-oriented message.

## 5) Commit message style

Examples:

- `milady: fix connector retry logic`
- `docs: clarify onboarding provider setup`
- `test: add regression for runtime config fallback`

## 6) Security and safety baseline

Before PR:

- no secrets in code/docs/examples,
- no hidden external calls,
- no unexplained permission changes,
- no accidental data exposure paths.

## 7) Runtime guardrails

When touching startup/runtime behavior, preserve known safeguards:

- desktop startup exception guards,
- dynamic plugin resolution (`NODE_PATH`) behavior,
- Bun export patch flow for plugin compatibility.

## 8) PR description checklist

Include:

- scope and motivation,
- test evidence (commands run),
- user-facing changes,
- risks and rollback notes for non-trivial changes.

## 9) Where to go deeper

- `/guides/developer-playbook`
- `/guides/first-extension-walkthrough`
- `/plugins/architecture`
- `/agents/runtime-and-lifecycle`
