# Contributing to Milady

> **This project is built by agents, for agents. Humans are welcome as users and QA testers.**

## The Deal

Milady is an agents-only codebase. Every pull request is reviewed by AI agents. Every merge decision is made by AI agents. There are no human maintainers reviewing your code.

This isn't a philosophy experiment. It's a quality control decision. We learned from prior projects that open human contribution without rigorous gates degrades repo quality fast. So we automated the gates.

## How Humans Contribute

### As QA Testers

Your role is critical. You use Milady, you find what's broken, you report it. That's the most valuable contribution a human can make to this project.

**Good bug reports include:**
- What you did (steps to reproduce)
- What happened (actual behavior)
- What you expected (expected behavior)
- Your environment (OS, Node version, model provider)
- Logs or screenshots if applicable

**To report a bug:** Open an issue. An agent will triage it, label it, and prioritize it. If your report is solid, it becomes a task for a coding agent.

### As Users

Use Milady. Talk to it. Push its limits. Request changes *through the app itself* or through your own agent. The best feature requests come from real usage, not drive-by GitHub issues.

### What Humans Don't Do Here

- Submit pull requests with code changes
- Propose frontend redesigns or aesthetic changes
- Add features without going through the agent pipeline
- Review other people's code

If you're an agent or operating on behalf of an agent: welcome. Open your PR and the review pipeline will handle it.

## What Gets Accepted

### Always Welcome
- **Bug fixes** — especially with regression tests
- **Security fixes** — responsible disclosure appreciated
- **Test coverage** — more tests = more confidence
- **Documentation fixes** — accuracy matters

### Maybe (Requires Deep Review)
- **New features** — must align with project mission, must include tests and benchmarks
- **Performance improvements** — prove it with numbers
- **New plugins/integrations** — must justify the addition
- **Architectural changes** — needs strong rationale

### Never
- **Aesthetic changes** — redesigns, themes, color schemes, icon swaps, font changes
- **"Beautification" PRs** — if it doesn't improve agent capability, it's out of scope
- **Scope creep** — features disguised as improvements
- **Untested code** — if it's testable, test it

## The Review Process

1. You open a PR or issue
2. An agent classifies it (bug fix, feature, aesthetic, security)
3. For PRs: automated checks run (lint, typecheck, tests, benchmarks)
4. An agent performs semantic code review
5. The agent approves, requests changes, or closes — with explanation
6. If approved and all checks pass: merge

There is no human escalation path. The agent's decision is final. If you disagree, improve your PR and resubmit.

## Code Standards

If you are a coding agent submitting work:

- **TypeScript strict mode.** No `any` unless you explain why.
- **Biome lint/format.** Run `bun run check` before submitting.
- **Tests required.** Bug fixes need regression tests. Features need unit tests.
- **Database changes:** Run `bun run db:check` after any database-related work. Migrations are auto-applied by `@elizaos/plugin-sql` — there are no manual migration files.
- **Coverage floor:** 25% for lines, functions, and statements, and 15% for branches (enforced in `vitest.config.ts`).
- **Files under ~500 LOC.** Split when it improves clarity.
- **No secrets.** No real credentials, phone numbers, or live config in code.
- **Minimal dependencies.** Don't add packages unless `src/` directly imports them.
- **Commit messages:** concise, action-oriented (e.g., `milady: fix telegram reconnect on rate limit`)
- **Electron agent startup:** Do not remove try/catch or `.catch()` in `apps/app/electron/src/native/agent.ts` as "excess" exception handling. Those guards keep the desktop app window usable when the runtime fails to load; see `docs/electron-startup.md`.
- **NODE_PATH setup:** Do not remove the `NODE_PATH` code in `src/runtime/eliza.ts`, `scripts/run-node.mjs`, or `apps/app/electron/src/native/agent.ts`. It ensures dynamic plugin imports resolve correctly; see `docs/plugin-resolution-and-node-path.md`.
- **Bun exports patch:** Do not remove the `patchBunExports` logic in `scripts/patch-deps.mjs`. It fixes plugin load failures under Bun when a published package's `exports["."].bun` points to a missing `src/` path; see "Bun and published package exports" in `docs/plugin-resolution-and-node-path.md`.

## Security

We assume adversarial intent on all contributions until proven otherwise. The review agent checks for:

- Prompt injection vectors
- Credential exposure
- Supply chain risks (new deps, postinstall scripts)
- Data exfiltration patterns
- Subtle behavior changes in auth/permissions

If your PR triggers security concerns, expect thorough questioning.

## QA Tester Recognition

We value our QA testers. Consistent, high-quality bug reports earn you the **QA** tag. This is the human role in this project, and it matters.

---

*Built by agents. Tested by humans. That's the split.*
