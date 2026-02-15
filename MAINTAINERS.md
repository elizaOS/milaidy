# Maintainers Guide

> This repo is maintained by agents. This guide documents the infrastructure setup.

## Repository Secrets Required

| Secret | Purpose | Status |
|--------|---------|--------|
| `ANTHROPIC_API_KEY` | Agent review pipeline (agent-review.yml, claude.yml) | **Required** |
| `ELIZAOS_CLOUD_API_KEY` | Cloud live E2E tests | Optional |
| `ELIZAOS_CLOUD_BASE_URL` | Cloud live E2E tests | Optional |

## Recommended Branch Protection (main)

Enable these rules on the `main` branch:

- **Require pull request before merging** — no direct pushes
- **Required status checks:**
  - `lint` (from ci.yml)
  - `typecheck` (from ci.yml)  
  - `test` (from ci.yml)
  - `build` (from ci.yml)
  - `review-pr` (from agent-review.yml)
- **Require branches to be up to date before merging**
- **Do not allow bypassing the above settings** (even for admins)

## CI Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `agent-review.yml` | PRs + Issues | Semantic agent review, scope check, security, dark forest |
| `ci.yml` | PRs + Push to main/develop | Lint, typecheck, unit tests, build |
| `test.yml` | PRs + Push to main/develop | Full test suite (unit, e2e, electron, cloud, validation) |
| `auto-label.yml` | PRs + Issues | Auto-label based on file paths and content |
| `claude.yml` | Comment mentions | @claude mentions in PR/issue comments |

## Agent Review Behavior

The agent reviewer (agent-review.yml) uses these reference docs:
- `SCOPE.md` — what's in scope vs out of scope
- `AGENTS.md` — coding standards and review priorities  
- `CONTRIBUTING.md` — contributor agreement and roles

### Review Decisions
- **APPROVE** — in scope, code quality good, tests adequate, security clear
- **REQUEST CHANGES** — fixable issues found
- **CLOSE** — out of scope (aesthetic changes, scope creep)

### Issue Triage
- Valid bugs → labeled and kept open
- QA reports → labeled and prioritized
- Aesthetic/feature requests → closed with explanation
- Vague reports → asked for more info

## Human Roles

| Role | Can Do | Cannot Do |
|------|--------|-----------|
| QA Tester | File bug reports, QA reports | Submit code, review PRs |
| Admin (Shaw/Shadow) | Merge PRs, configure repo | Override agent review decisions* |

*The goal is to reach a state where even admins don't need to intervene. Agent decisions should be trusted.

## Future Additions
- [ ] Trust scoring for contributors (plugin-trust integration)
- [ ] Auto-merge for agent-approved + all-checks-passing PRs
- [ ] Benchmark gates for performance-sensitive changes
- [ ] Coding agent spawning for issue resolution
- [ ] Reviewer agent separate from coding agent

---
