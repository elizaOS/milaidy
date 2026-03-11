---
name: Electrobun Milady
description: Use when building Electrobun features for the milady-ai/milady project, submitting PRs that will be reviewed by milady's agent-review system, or understanding how the electrobun-dev SDLC pipeline integrates with milady's trust scoring, CI/CD, and automated reviewer. Covers trust tiers, code quality standards, PR format requirements, Biome compliance, and the milady release-electrobun.yml workflow.
version: 1.0.0
---

# Electrobun × Milady Integration

This skill covers how the electrobun-dev plugin and SDLC pipeline integrate with the milady-ai/milady project's agent review system, trust scoring, and CI/CD workflows.

## The milady Project Context

`milady-ai/milady` is an elizaOS-based AI assistant desktop app built with Electrobun. It uses an **agents-only** contribution model:
- All code PRs come from AI agents
- Humans serve as QA testers (bug reports, not code)
- An automated Claude Code reviewer is the sole code reviewer
- Verdicts are machine-parsed and trigger auto-merge or close

When our electrobun-dev SDLC pipeline submits PRs to milady-ai/milady (Electrobun desktop app code, plugin files, or skills), they go through this system.

---

## Agent Review System

### Pipeline

```
PR opened/updated
    ↓
classify job — categorizes PR as: bugfix/feature/aesthetic/docs/chore/test
    ↓
review-pr job:
  1. Load contributor trust context (score + tier)
  2. Claude Code Action reviews the PR (with trust tier in context)
  3. Codex fallback if Claude unavailable
  4. Extract verdict: APPROVE / REQUEST CHANGES / CLOSE
    ↓
review-postprocess job:
  - Create check run (success/failure/action_required)
  - Apply trust:{tier} label and category:{type} label
    ↓
auto-merge (if APPROVE + checks pass + not targeting main)
create-followup-issues (if APPROVE + review has follow-up section)
close-pr (if CLOSE)
```

### Review Protocol — What the Reviewer Checks

**1. Scope Check**

| Category | Treatment |
|----------|-----------|
| Bug fixes, security, performance, test coverage | IN SCOPE — welcome |
| New features, new plugins, architectural changes | REQUIRES DEEP REVIEW |
| Aesthetic/UI redesigns, theme changes | OUT OF SCOPE — close |
| Changes without tests for testable code | OUT OF SCOPE |

Plugin contributions and Electrobun-related changes fall under "REQUIRES DEEP REVIEW". The reviewer verifies they align with project mission.

**2. Code Quality Requirements**

- TypeScript strict mode compliance
- **No `any` types** unless absolutely necessary (must explain in code comment)
- **Biome** lint/format compliance (milady uses Biome, not ESLint)
- **Files under ~500 LOC** — larger files get flagged
- Meaningful variable names, brief comments on non-obvious logic
- No committed secrets, real credentials, or live config values
- Dependencies: only add if `src/` code directly imports them

**3. Security Review**

The reviewer specifically checks for:
- Prompt injection vectors
- Credential exposure
- Supply chain risks (new dependencies, `postinstall` scripts)
- Data exfiltration patterns
- Changes to auth, permissions, or secret handling

**4. Test Requirements**

| Change Type | Test Requirement |
|-------------|-----------------|
| Bug fix | MUST include regression test |
| New feature | MUST include unit tests |
| Lines/functions/statements coverage | ≥25% threshold (vitest.config.ts enforced) |
| Branches coverage | ≥15% threshold |
| DB route/adapter/query changes | `bun run db:check` must pass |

**5. Dark Forest Awareness**

The reviewer assumes adversarial intent until proven otherwise:
- Why would an agent submit this change?
- What does it break that isn't obvious?
- Does it introduce subtle behavior changes?
- Are there hidden side effects in innocent-looking changes?

**Implication for our code:** Every PR must be obviously correct. Unusual patterns must have inline comments explaining why.

---

## Trust Scoring System

### Score Range and Initial State

- **Range:** 0–100
- **Initial score:** 35 (trust is earned, not given)
- **Storage:** `.github/contributor-trust.json` (updated every 6h by trust-dashboard cron — read-only in CI)

### Tier System

| Score | Tier | Review Treatment |
|-------|------|-----------------|
| 90–100 | legendary | Standard review, proven elite |
| 75–89 | trusted | Expedited review, check security |
| 60–74 | established | Normal review depth |
| 45–59 | contributing | Standard review |
| 30–44 | probationary | **Careful review, verify claims, check edge cases** |
| 15–29 | untested | Deep review, line-by-line, extra security |
| 0–14 | restricted | Maximum scrutiny, assume adversarial |

**New agents start at 35 — probationary tier.** Every PR from our SDLC pipeline will receive "careful review, verify claims, check edge cases" scrutiny until trust is built.

---

## PR Format Requirements

The agent-review system **machine-parses** the review verdict. Our PRs themselves must be structured so that when Claude reviews them, its response will be parseable.

### Verdict Pattern (what Claude's review output must contain)

```
6. **Decision:** APPROVE
```

or

```
6. **Decision:** REQUEST CHANGES
```

or

```
6. **Decision:** CLOSE
```

The exact format the reviewer produces (this is Claude's output format, not our PR body format):
1. **Classification:** bug fix / feature / aesthetic / security / other
2. **Scope verdict:** in scope / needs deep review / out of scope
3. **Code quality:** pass / issues found
4. **Security:** clear / concerns
5. **Tests:** adequate / missing
6. **Decision:** APPROVE / REQUEST CHANGES / CLOSE

### Follow-up Issues Format

If our PR description includes a "Follow-up" or "Next Steps" section with bullet points, milady **automatically creates GitHub issues** from those bullets after merge. Use this intentionally:

```markdown
## Follow-up

- Add integration test for X edge case
- Benchmark the new rendering path under load
- Document the RPC schema in Mintlify
```

Max 12 items auto-converted to issues. Don't add follow-ups unless you mean them.

### PR Body Structure for Milady

```markdown
## Summary

One clear sentence of what this does and why.

- Bullet 1: specific change
- Bullet 2: specific change

## Motivation

Why this change is needed. Reference the issue/bug if applicable.

## Changes

- `src/file.ts`: what changed
- `src/other.ts`: what changed

## Tests

What tests were added/updated and what they verify.

## Follow-up

- Any recommended next steps (become GitHub issues automatically)
```

---

## milady Release Workflow (release-electrobun.yml)

The milady project has its own Electrobun release workflow with **different secret names** from what the standard Electrobun build documentation describes. When working on milady's Electrobun app code, use these:

### Secrets (milady-specific names)

| milady Secret Name | Purpose | Standard Electrobun Name |
|--------------------|---------|--------------------------|
| `CSC_LINK` | Base64-encoded .p12 certificate | `MACOS_CERTIFICATE` |
| `CSC_KEY_PASSWORD` | Certificate password | `MACOS_CERTIFICATE_PWD` |
| `APPLE_ID` | Apple ID email | `ELECTROBUN_APPLEID` |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password | `ELECTROBUN_APPLEIDPASS` |
| `APPLE_TEAM_ID` | Team ID | `ELECTROBUN_TEAMID` |
| `RELEASE_UPLOAD_KEY` | SSH key for releases@milady.ai | (milady-specific) |
| `RELEASE_HOST_FINGERPRINT` | SSH host fingerprint for milady.ai | (milady-specific) |

> The milady workflow imports the certificate and **automatically extracts the Developer ID identity string**, then passes it as `ELECTROBUN_DEVELOPER_ID`. You do not need to set `ELECTROBUN_DEVELOPER_ID` as a secret separately.

### Version/Channel Determination

```
Tag contains alpha/beta/rc/nightly → BUILD_ENV=canary
All other version tags             → BUILD_ENV=stable
```

Example: `v2.0.0-alpha.3` → canary, `v2.0.0` → stable

### Bun Version

milady pins Bun to `1.3.9` in its release workflow. This may differ from the latest Bun release. When building milady locally, use the same version to avoid behavior differences.

---

## SDLC Pipeline Alignment with milady

When running `/electrobun-sdlc` for a feature destined for milady-ai/milady, each stage must account for milady's requirements:

### Researcher (Stage 1)
- Check whether the feature touches milady's elizaOS plugin system (different from Electrobun APIs)
- Check for existing Biome config (`.biome.json` or `biome.json`) — note rules in force
- Check test coverage baseline: `vitest.config.ts` coverage thresholds

### Architect (Stage 2)
- Keep new files under 500 LOC
- Plan test files for every new module
- Note which changes need `bun run db:check`

### Planner (Stage 3)
- Every task for a bug fix MUST include a regression test task
- Every task for a new feature MUST include a unit test task
- Coverage target: 25% lines/functions, 15% branches

### Dev Squad (Stage 4)
- No `any` types — use explicit type assertions with comments if unavoidable
- Format with Biome before committing: `bunx biome check --write .`
- Files must stay under ~500 LOC — split if approaching

### QA Engineer (Stage 5)
Add these milady-specific checks:

```
[ ] Biome compliance: run bunx biome check --diagnostic-level=error
[ ] TypeScript strict: no implicit any, no unchecked types
[ ] File LOC: all files ≤ ~500 lines
[ ] Test coverage: bug fixes have regression test, features have unit tests
[ ] No any types (flag all occurrences for justification)
[ ] No committed secrets or live config values
[ ] Dependencies: only added if src/ imports them
[ ] DB changes: bun run db:check noted if applicable
```

### Test Writer (Stage 6)
- Write vitest tests (milady uses vitest, not Kitchen Sink defineTest)
- Target coverage thresholds from vitest.config.ts
- Regression tests for every bug fix are non-negotiable

### Alignment Agent (Stage 7)
- Run `bunx biome check --write .` as part of cleanup pass
- Enforce 500 LOC limit — split files that exceed it

### Docs Agent (Stage 8)
- PR body must follow the milady PR format above
- Include "Follow-up" section with genuine next-step items only
- Mintlify docs go in milady's `docs/` directory (check existing structure)

---

## Common Mistakes

| Mistake | milady Review Response |
|---------|----------------------|
| `any` types without explanation | REQUEST CHANGES — TypeScript quality |
| No tests for a bug fix | REQUEST CHANGES — test requirements |
| File >500 LOC | REQUEST CHANGES — code quality |
| Aesthetic/UI change | CLOSE — out of scope |
| New dependency not imported | REQUEST CHANGES — dependency hygiene |
| Biome format violations | REQUEST CHANGES — code quality |
| PR without scope context | Reviewed as REQUIRES DEEP REVIEW |
| >10 PRs/week | Trust velocity penalty applied |
| Using wrong secret names in CI config | Build failure |
