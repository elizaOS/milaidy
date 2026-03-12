---
name: electrobun-setup
description: Run immediately after electrobun init. Derives the project name from electrobun.config.ts (never assumes a hardcoded name), scans for existing .github infrastructure, then walks through a wizard to create CI/CD, release pipeline, test scaffold, docs, CLAUDE.md, AI code review, trust scoring, and pre-push hooks for a production-ready project.
argument-hint: [template-name]
---

Set up a production-ready Electrobun project scaffold. Works on any project — derives all names and identifiers from the project's own `electrobun.config.ts`.

---

## Step 1: Detect Project Identity

Read `electrobun.config.ts` and extract these values. These are used throughout — **never substitute a hardcoded name**.

```bash
cat electrobun.config.ts
```

Extract:
- `PROJECT_NAME` = `app.name` (e.g. `"Lightspeed"`, `"NoteVault"`, whatever the user named it)
- `PROJECT_IDENTIFIER` = `app.identifier` (e.g. `"com.acme.lightspeed"`)
- `PROJECT_VERSION` = `app.version`

Detect template type from `src/`:
- **gpu**: no `src/<viewname>/` dirs, GPU code present → `wgpu`, `wgpu-mlp`, `wgpu-babylon`, `wgpu-threejs`
- **webview**: one `src/<viewname>/` dir → `hello-world`, `svelte`, `vue`, `vanilla-vite`, etc.
- **multi-window**: multiple `src/<viewname>/` dirs → `multi-window`, `multitab-browser`
- **tray**: tray code, minimal window → `tray-app`
- **sqlite**: SQLite usage → `sqlite-crud`, `notes-app`

Announce:
> Setting up **{PROJECT_NAME}** ({PROJECT_IDENTIFIER}) | Template: **{type}**

---

## Step 2: Scan Existing .github Infrastructure

Before asking any questions, check what's already present. Do not modify anything yet.

```bash
ls .github/ 2>/dev/null
ls .github/workflows/ 2>/dev/null
ls .github/hooks/ 2>/dev/null
```

Check for each file and record as EXISTS or MISSING:

| File | Variable |
|------|----------|
| `.github/workflows/ci.yml` | `HAS_CI` |
| `.github/workflows/release-electrobun.yml` | `HAS_RELEASE` |
| `.github/workflows/agent-review.yml` | `HAS_AGENT_REVIEW` |
| `.github/trust-scoring.cjs` | `HAS_TRUST_SCORING` |
| `.github/contributor-trust.json` | `HAS_TRUST_JSON` |
| `.github/PULL_REQUEST_TEMPLATE.md` | `HAS_PR_TEMPLATE` |
| `.github/labeler.yml` | `HAS_LABELER` |
| `vitest.config.ts` | `HAS_VITEST` |
| `biome.json` or `.biome.json` | `HAS_BIOME` |
| `CLAUDE.md` | `HAS_CLAUDE_MD` |
| `.github/hooks/pre-push` | `HAS_HOOK` |
| `docs/mint.json` | `HAS_DOCS` |

If `HAS_AGENT_REVIEW` = EXISTS, announce:
> ✅ Agent review workflow already configured.

If `HAS_TRUST_SCORING` = EXISTS, announce:
> ✅ Trust scoring already configured.

---

## Step 3: Questionnaire

Ask each question. Skip questions for items that already exist (announce "already set up — skipping"). Record all answers before applying anything.

```
════════════════════════════════════════════════════
 ELECTROBUN SETUP — {PROJECT_NAME}
 Answer Y/N or press Enter for the default shown
════════════════════════════════════════════════════

INFRASTRUCTURE
──────────────
 1. GitHub Actions CI?                [Y/n]
    Runs type check (+ tests if you choose them) on every PR.

 2. Release workflow?                 [Y/n]
    Builds and signs artifacts for macOS/Windows/Linux on version tags.
    If yes:
      a. Include Windows build?       [Y/n]
      b. Include Linux build?         [Y/n]

 3. Update server baseUrl?            [Y/n]
    Sets release.baseUrl in electrobun.config.ts so auto-updates work.
    If yes:
      Where will you host artifacts?
        1) GitHub Releases (free, simple)
        2) Cloudflare R2
        3) AWS S3
        4) SSH / rsync (custom server)
        5) Other (enter URL)
      Enter your GitHub owner/repo or URL: ___

 4. macOS code signing?               [Y/n]
    Requires Apple Developer account. Adds signing + notarization to CI.

QUALITY
───────
 5. Test infrastructure?              [Y/n]
    Creates vitest.config.ts, src/tests/, and example test.

 6. Mintlify documentation?           [Y/n]
    Scaffolds docs/ with mint.json and a starter page.

 7. Biome linting?                    [Y/n]
    Creates .biome.json with strict TypeScript rules (no any, formatting).
    Recommended if contributing to milady-ai or any agent-reviewed repo.

AI CODE REVIEW
──────────────
 8. AI-powered agent code review?     [Y/n]

    ⚠️  This creates .github/workflows/agent-review.yml — an automated
    reviewer that runs Claude Code Action on every PR. PRs are reviewed
    by Claude; review decisions (APPROVE/REQUEST CHANGES/CLOSE) trigger
    auto-merge or close automatically.

    You will need at least one of these in GitHub Secrets:
      • ANTHROPIC_API_KEY    — Claude reviews (primary reviewer)
      • OPENAI_API_KEY       — Codex reviews (fallback if Claude fails)
      • GitHub Copilot       — not needed as a secret (uses billing, not key)

    Claude is the primary reviewer. Codex activates only if Claude fails.
    You can use either or both — having both gives redundancy.

    Do you want Claude review?   [Y/n]  (needs ANTHROPIC_API_KEY secret)
    Do you want Codex fallback?  [Y/n]  (needs OPENAI_API_KEY secret)

 9. Contributor trust scoring?        [Y/n]

    ⚠️  This is independent of agent review — you can have either or both.

    Installs a multi-factor trust scoring system for PR contributors:
      - Score range 0–100, initial score 35 (trust is earned)
      - 7 tiers: restricted → untested → probationary → contributing
                 → established → trusted → legendary
      - Factors: PR size, category labels, approval streaks, recency
                 decay, velocity gates, inactivity penalty
      - No API key required — runs as GitHub Actions script
      - Scores stored in .github/contributor-trust.json
      - Trust tier shown in review context; affects scrutiny level

    Note: Trust scoring works best combined with agent review (Q8) so
    the reviewer can calibrate scrutiny by tier, but it also works
    standalone to track contribution history.

PROJECT SETUP
─────────────
10. CLAUDE.md with project rules?     [Y/n]
    Creates a CLAUDE.md tailored to {PROJECT_NAME}'s structure.

11. Pre-push git hook?                [Y/n]
    Runs type check before every push. Catches errors before CI.

════════════════════════════════════════════════════
```

After all answers, print summary and confirm:
```
Will create:
  [ list only the files that will be created ]
Proceed? [Y/n]
```

---

## Step 3: Apply Setup

Work through each approved section. Skip sections where user answered N or file already exists.

### Section A: Core Directories (always)

Append to `.gitignore` only if patterns not already present:
```
# Electrobun
build/
artifacts/
.electrobun-align-backup/
# Secrets reference (never commit)
.github/SECRETS.md
# Env
.env
.env.*
!.env.example
```

Create directories if missing:
```
src/shared/    — shared RPC types between bun and renderers
src/assets/    — static assets
```

---

### Section B: CI Workflow (Q1 = Y)

Create `.github/workflows/ci.yml` using **{PROJECT_NAME}** in the workflow name:

```yaml
name: CI — {PROJECT_NAME}

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

permissions:
  contents: read

jobs:
  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun tsc --noEmit
      # ADD_TESTS_STEP (replaced below if test infra selected)
```

If test infra (Q5) also selected, replace `# ADD_TESTS_STEP` with:
```yaml
      - run: bun test --coverage
```

---

### Section C: Release Workflow (Q2 = Y)

Create `.github/workflows/release-electrobun.yml`:

```yaml
name: Build & Release — {PROJECT_NAME}

on:
  push:
    tags:
      - "v*"
  workflow_dispatch:
    inputs:
      tag:
        description: "Release tag (e.g. v1.0.0-alpha.1)"
        required: false
        type: string
      draft:
        description: "Create as draft release"
        required: false
        type: boolean
        default: true

concurrency:
  group: release-{PROJECT_NAME}-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: write

env:
  BUN_VERSION: latest

jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.v.outputs.version }}
      env: ${{ steps.v.outputs.env }}
    steps:
      - uses: actions/checkout@v4
      - id: v
        run: |
          TAG="${{ inputs.tag || github.ref_name }}"
          VERSION="${TAG#v}"
          if echo "$VERSION" | grep -qE '(alpha|beta|rc|nightly)'; then
            ENV="canary"
          else
            ENV="stable"
          fi
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"
          echo "env=$ENV" >> "$GITHUB_OUTPUT"

  build:
    needs: prepare
    strategy:
      matrix:
        include:
          - runner: macos-14
            os: macos
            arch: arm64
          - runner: macos-15-intel
            os: macos
            arch: x64
          # WINDOWS_PLACEHOLDER
          # LINUX_PLACEHOLDER
    runs-on: ${{ matrix.runner }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ env.BUN_VERSION }}
      - run: bun install --frozen-lockfile

      - name: Import Apple certificate
        if: matrix.os == 'macos'
        run: |
          echo $MACOS_CERTIFICATE | base64 --decode > certificate.p12
          security create-keychain -p "" build.keychain
          security import certificate.p12 -k build.keychain \
            -P $MACOS_CERTIFICATE_PWD -T /usr/bin/codesign
          security list-keychains -d user -s build.keychain
          security set-keychain-settings -t 3600 -u build.keychain
          security unlock-keychain -p "" build.keychain
        env:
          MACOS_CERTIFICATE: ${{ secrets.MACOS_CERTIFICATE }}
          MACOS_CERTIFICATE_PWD: ${{ secrets.MACOS_CERTIFICATE_PWD }}

      - name: Install Linux dependencies
        if: matrix.os == 'linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y build-essential cmake pkg-config \
            libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
            librsvg2-dev fuse libfuse2

      - name: Build {PROJECT_NAME}
        run: electrobun build --env=${{ needs.prepare.outputs.env }}
        env:
          ELECTROBUN_DEVELOPER_ID: ${{ secrets.ELECTROBUN_DEVELOPER_ID }}
          ELECTROBUN_APPLEID: ${{ secrets.ELECTROBUN_APPLEID }}
          ELECTROBUN_APPLEIDPASS: ${{ secrets.ELECTROBUN_APPLEIDPASS }}
          ELECTROBUN_TEAMID: ${{ secrets.ELECTROBUN_TEAMID }}

      - uses: actions/upload-artifact@v4
        with:
          name: artifacts-${{ matrix.os }}-${{ matrix.arch }}
          path: artifacts/

  release:
    needs: [prepare, build]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          pattern: artifacts-*
          merge-multiple: true
          path: artifacts/
      - uses: softprops/action-gh-release@v1
        with:
          name: "{PROJECT_NAME} ${{ needs.prepare.outputs.version }}"
          draft: ${{ inputs.draft || false }}
          files: artifacts/*
```

Replace `# WINDOWS_PLACEHOLDER` with the following if Q2a = Y:
```yaml
          - runner: windows-2025
            os: win
            arch: x64
```

Replace `# LINUX_PLACEHOLDER` with the following if Q2b = Y:
```yaml
          - runner: ubuntu-24.04
            os: linux
            arch: x64
          - runner: ubuntu-24.04-arm
            os: linux
            arch: arm64
```

---

### Section D: baseUrl in config (Q3 = Y)

Read `electrobun.config.ts` fully first. Then add or update `release` block:

```typescript
release: {
  baseUrl: "{DERIVED_URL}/",
  generatePatch: true,
},
```

Derive URL from user's choice:
- **GitHub Releases**: `https://github.com/{owner}/{repo}/releases/download/`
  → Ask: "Enter your GitHub owner/repo (e.g. acme/lightspeed):"
- **R2**: `https://{accountid}.r2.cloudflarestorage.com/{bucket}/`
  → Ask: "Enter your R2 endpoint URL:"
- **S3**: `https://{bucket}.s3.{region}.amazonaws.com/`
  → Ask: "Enter your S3 URL:"
- **SSH / custom**: Ask: "Enter your full update base URL:"

Always ensure the URL ends with `/`.

---

### Section E: Secrets Reference File

Create `.github/SECRETS.md` — this is a **local reference only** (it's gitignored — never committed):

```markdown
# GitHub Secrets Required for {PROJECT_NAME}

## Build & Release
- MACOS_CERTIFICATE       — base64 .p12 Developer ID certificate
- MACOS_CERTIFICATE_PWD   — certificate password
- ELECTROBUN_DEVELOPER_ID — "Developer ID Application: You (TEAMID)"
- ELECTROBUN_APPLEID       — Apple ID email
- ELECTROBUN_APPLEIDPASS   — app-specific password (appleid.apple.com)
- ELECTROBUN_TEAMID        — 10-char Apple Team ID

## Artifact Upload
### Cloudflare R2
- R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET
### AWS S3
- AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_DEFAULT_REGION / S3_BUCKET

## AI Code Review (if agent-review.yml installed)
- ANTHROPIC_API_KEY  — for Claude Code Action (primary reviewer)
- OPENAI_API_KEY     — for Codex fallback (optional, adds redundancy)
- GH_PAT             — GitHub PAT with 'workflows' scope (for auto-merge of
                       PRs that modify workflow files)

## Notes
- GitHub Copilot does not require a secret — it uses your billing account
- GITHUB_TOKEN is provided automatically by GitHub Actions
```

---

### Section F: Test Infrastructure (Q5 = Y)

**GPU templates**: Skip — use WGSL validation instead of vitest.

**All other templates**: Create:

`vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        lines: 25,
        functions: 25,
        statements: 25,
        branches: 15,
      },
    },
  },
});
```

`src/tests/index.ts`:
```typescript
// {PROJECT_NAME} test suite
// Import test files below as you add them:
// import "./feature-name.test";
```

`src/tests/example.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("{PROJECT_NAME} sanity", () => {
  it("placeholder passes", () => {
    expect(true).toBe(true);
  });
});
```

Add to `package.json` scripts (only missing keys):
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

---

### Section G: Mintlify Docs (Q6 = Y)

`docs/mint.json`:
```json
{
  "name": "{PROJECT_NAME}",
  "description": "Documentation for {PROJECT_NAME}",
  "navigation": [
    {
      "group": "Getting Started",
      "pages": ["index"]
    }
  ],
  "theme": "mint",
  "colors": { "primary": "#0969da" }
}
```

`docs/index.mdx`:
```mdx
---
title: "Getting Started"
description: "Welcome to {PROJECT_NAME}"
---

## Overview

{PROJECT_NAME} is a desktop application built with [Electrobun](https://electrobun.dev).

## Quick Start

```bash
bun install
bun start
```

## Development

```bash
bun run dev    # dev server with hot reload
bun test       # run tests
```
```

---

### Section H: Biome Linting (Q7 = Y)

Create `.biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

Also create `.github/PULL_REQUEST_TEMPLATE.md` and `.github/labeler.yml` (the labeler makes PRs self-classifying, which trust scoring uses):

`.github/PULL_REQUEST_TEMPLATE.md`:
```markdown
## Summary

<!-- What does this PR do and why? -->

## Changes

<!-- Files changed and what changed in each -->

## Tests

<!-- Tests added or updated -->

## Follow-up

<!-- Optional — bullet points here become GitHub issues automatically after merge -->
```

`.github/labeler.yml`:
```yaml
bugfix:
  - head-branch: ["^fix/", "^bugfix/", "^hotfix/"]
feature:
  - head-branch: ["^feat/", "^feature/"]
docs:
  - changed-files:
    - any-glob-to-any-file: ["docs/**", "*.md", "*.mdx"]
test:
  - changed-files:
    - any-glob-to-any-file: ["src/tests/**", "*.test.ts", "*.spec.ts"]
chore:
  - head-branch: ["^chore/", "^deps/", "^bump/"]
core:
  - changed-files:
    - any-glob-to-any-file: ["src/bun/**", "electrobun.config.ts"]
```

---

### Section I: AI Agent Code Review (Q8 = Y)

Announce:
> Creating .github/workflows/agent-review.yml for {PROJECT_NAME}
> Primary reviewer: Claude (ANTHROPIC_API_KEY) {if Claude selected}
> Fallback reviewer: Codex (OPENAI_API_KEY) {if Codex selected}

Create `.github/workflows/agent-review.yml`:

```yaml
name: Agent Review — {PROJECT_NAME}

on:
  pull_request_target:
    types: [opened, synchronize, reopened, ready_for_review]
  issues:
    types: [opened]

permissions:
  contents: write
  pull-requests: write
  issues: write
  checks: write
  statuses: write

jobs:
  classify:
    runs-on: ubuntu-latest
    outputs:
      category: ${{ steps.classify.outputs.category }}
    steps:
      - name: Classify contribution
        id: classify
        uses: actions/github-script@v7
        with:
          script: |
            const title = (context.payload.pull_request?.title || context.payload.issue?.title || '').toLowerCase();
            const body  = (context.payload.pull_request?.body  || context.payload.issue?.body  || '').toLowerCase();
            const text  = `${title}\n${body}`;

            let paths = [];
            if (context.payload.pull_request) {
              const files = await github.paginate(github.rest.pulls.listFiles, {
                owner: context.repo.owner, repo: context.repo.repo,
                pull_number: context.payload.pull_request.number, per_page: 100,
              });
              paths = files.map(f => f.filename.toLowerCase());
            }

            const allMatch = regex => paths.length > 0 && paths.every(p => regex.test(p));
            const anyMatch = patterns => patterns.some(p => text.includes(p));

            let category = 'feature';
            if (allMatch(/^\.github\//))          category = 'chore';
            else if (allMatch(/\.(md|mdx)$/))     category = 'docs';
            else if (allMatch(/\.test\.[tj]sx?$/))category = 'test';
            else if (anyMatch(['fix', 'bug', 'crash', 'regression'])) category = 'bugfix';
            else if (anyMatch(['chore', 'deps', 'bump', 'update']))   category = 'chore';

            core.setOutput('category', category);
            console.log(`Classified: ${category}`);

  review-pr:
    if: github.event_name == 'pull_request_target'
    needs: classify
    runs-on: ubuntu-latest
    outputs:
      verdict: ${{ steps.extract-verdict.outputs.verdict }}
      decision: ${{ steps.extract-verdict.outputs.decision }}
      decision_comment_url: ${{ steps.extract-verdict.outputs.decision_comment_url }}
    steps:
      - name: Checkout base ref
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.base.sha }}
          fetch-depth: 1

      - name: Fetch contributor trust context
        id: trust-context
        uses: actions/github-script@v7
        with:
          script: |
            const author = context.payload.pull_request.user.login;
            let trustInfo = 'New contributor (no review history)';
            try {
              const { data: fileData } = await github.rest.repos.getContent({
                owner: context.repo.owner, repo: context.repo.repo,
                path: '.github/contributor-trust.json',
                ref: context.payload.pull_request.base.ref,
              });
              const allStates = JSON.parse(Buffer.from(fileData.content, 'base64').toString());
              if (allStates[author]) {
                const { computeTrustScore, DEFAULT_CONFIG, expandState } = require('./.github/trust-scoring.cjs');
                const state = expandState(allStates[author]);
                const result = computeTrustScore(state, DEFAULT_CONFIG);
                trustInfo = `Trust score: ${result.score}/100 (${result.tier}) | ${result.tierInfo.description}`;
              }
            } catch (e) { /* trust scoring not installed or no history */ }
            core.setOutput('trust_info', trustInfo);

      # ── Primary reviewer: Claude Code Action ──────────────────────────────
      - name: Claude Code Review
        id: claude-review
        continue-on-error: true
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          show_full_output: true
          claude_args: |
            --allowedTools "Read,Glob,Grep,LS,Bash(gh pr diff:*),Bash(gh pr view:*),Bash(cat:*),Bash(git diff:*),Bash(git log:*),Bash(wc:*)"
          prompt: |
            You are the automated code reviewer for {PROJECT_NAME}.

            ## PR Info
            - **PR #${{ github.event.pull_request.number }}**: ${{ github.event.pull_request.title }}
            - **Author**: ${{ github.event.pull_request.user.login }}
            - **Base**: ${{ github.event.pull_request.base.ref }}
            - **Category**: ${{ needs.classify.outputs.category }}
            - **Contributor trust**: ${{ steps.trust-context.outputs.trust_info }}

            ## Review Protocol

            ### 1. Scope — What belongs in {PROJECT_NAME}
            Review the diff and check whether changes are appropriate for this Electrobun desktop app.
            - Bug fixes, security fixes, performance improvements: **IN SCOPE**
            - New features with tests: **IN SCOPE — verify tests exist**
            - Aesthetic-only changes, unrelated dependencies: **OUT OF SCOPE — CLOSE**

            ### 2. Code Quality
            - TypeScript correctness (no implicit any, proper types)
            - No debug console.log left in production code
            - Electrobun-specific: BrowserView RPC requires sandbox: false; GPU objects require KEEPALIVE
            - View URL scheme must match electrobun.config.ts views key exactly
            - Import paths: bun-side uses electrobun/bun, renderer uses electrobun/view

            ### 3. Security
            - No hardcoded secrets, credentials, or API keys
            - No suspicious postinstall scripts in new dependencies
            - No data exfiltration patterns

            ### 4. Tests
            - Bug fixes should include a regression test
            - New features should include unit tests

            ### 5. Trust-Calibrated Review
            Use the contributor trust tier to calibrate scrutiny depth:
            - legendary/trusted: standard review
            - established/contributing: normal depth
            - probationary: careful — verify claims, check edge cases
            - untested/restricted: deep review, line by line

            ## Output Format
            1. **Classification**: bug fix / feature / aesthetic / security / other
            2. **Scope verdict**: in scope / needs deep review / out of scope
            3. **Code quality**: pass / issues found
            4. **Security**: clear / concerns
            5. **Tests**: adequate / missing
            6. **Decision**: APPROVE / REQUEST CHANGES / CLOSE

            The Decision line is machine-parsed. Use exactly one of those three values.

            Include this marker: <!-- agent-review-run:${{ github.run_id }}:${{ github.run_attempt }}:${{ github.event.pull_request.head.sha }} -->

      # ── Fallback reviewer: Codex (only if Claude failed AND Codex enabled) ─
      # CODEX_FALLBACK_PLACEHOLDER

      - name: Extract review decision
        id: extract-verdict
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const runMarker = `<!-- agent-review-run:${context.runId}:${process.env.GITHUB_RUN_ATTEMPT || '1'}:${context.payload.pull_request.head.sha} -->`;
            const decisionPattern = /\bDecision(?:\*{0,2})?\s*:\s*(?:\*{0,2})\s*(APPROVE|REQUEST CHANGES|CLOSE)\b/i;
            const sleep = ms => new Promise(r => setTimeout(r, ms));

            let latest = null;
            for (let i = 0; i < 5; i++) {
              const [comments, reviews] = await Promise.all([
                github.paginate(github.rest.issues.listComments, {
                  owner: context.repo.owner, repo: context.repo.repo,
                  issue_number: context.payload.pull_request.number, per_page: 100,
                }),
                github.paginate(github.rest.pulls.listReviews, {
                  owner: context.repo.owner, repo: context.repo.repo,
                  pull_number: context.payload.pull_request.number, per_page: 100,
                }),
              ]);
              const all = [...comments, ...reviews.map(r => ({...r, created_at: r.submitted_at}))];
              latest = all.filter(c => c.body?.includes(runMarker) && decisionPattern.test(c.body))
                          .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];
              if (latest) break;
              if (i < 4) await sleep(3000);
            }

            let verdict = 'reject', decision = 'REQUEST CHANGES';
            if (latest) {
              const match = latest.body.match(decisionPattern);
              decision = match?.[1]?.toUpperCase() || decision;
              verdict = decision === 'APPROVE' ? 'approve' : decision === 'CLOSE' ? 'close' : 'reject';
            }
            core.setOutput('verdict', verdict);
            core.setOutput('decision', decision);
            core.setOutput('decision_comment_url', latest?.html_url || '');
        env:
          AGENT_REVIEW_MARKER: '<!-- agent-review-run:${{ github.run_id }}:${{ github.run_attempt }}:${{ github.event.pull_request.head.sha }} -->'

  auto-merge:
    name: Auto-merge approved PRs
    needs: [classify, review-pr]
    if: |
      github.event_name == 'pull_request_target' &&
      needs.review-pr.result == 'success' &&
      needs.review-pr.outputs.verdict == 'approve' &&
      github.event.pull_request.base.ref != 'main'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Merge approved PR
        run: |
          gh pr merge ${{ github.event.pull_request.number }} --squash --delete-branch || \
          gh pr comment ${{ github.event.pull_request.number }} \
            --body "⚠️ Auto-merge failed. PR is APPROVED — please merge manually."
        env:
          GH_TOKEN: ${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}
          GH_REPO: ${{ github.repository }}

  close-pr:
    name: Close out-of-scope PRs
    needs: [review-pr]
    if: |
      github.event_name == 'pull_request_target' &&
      needs.review-pr.outputs.verdict == 'close' &&
      !contains(github.event.pull_request.labels.*.name, 'skip-auto-close')
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - run: gh pr close ${{ github.event.pull_request.number }} --comment "Closed by automated review (out of scope)."
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GH_REPO: ${{ github.repository }}
```

If Codex fallback was selected (Q8 Codex = Y), replace `# CODEX_FALLBACK_PLACEHOLDER` with:

```yaml
      - name: Codex Review (fallback)
        id: codex-review
        if: steps.claude-review.outcome == 'failure'
        continue-on-error: true
        uses: openai/codex-action@v1
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          model: gpt-4.1-codex
          effort: high
          safety-strategy: read-only
          prompt: |
            You are the automated code reviewer for {PROJECT_NAME}.
            Review this PR diff (use `gh pr diff ${{ github.event.pull_request.number }}`).
            Produce the same structured output as the primary reviewer with:
            6. **Decision**: APPROVE / REQUEST CHANGES / CLOSE
```

---

### Section J: Contributor Trust Scoring (Q9 = Y)

Announce:
> Creating trust scoring infrastructure for {PROJECT_NAME}.
> No API keys required — runs as GitHub Actions script.
> Trust data stored in .github/contributor-trust.json (committed to repo).

Create `.github/contributor-trust.json`:
```json
{}
```

Create `.github/TRUST_DESIGN.md` — a reference explaining the scoring system:

```markdown
# Contributor Trust Scoring — {PROJECT_NAME}

Tracks contributor reliability using a multi-factor scoring algorithm.

## Score Range
- 0–100, initial: 35 (trust is earned)
- Updated by the trust-dashboard cron (every 6h) reading closed PR history

## Tiers
| Score | Tier | Review Treatment |
|-------|------|-----------------|
| 90–100 | legendary | Auto-merge eligible |
| 75–89  | trusted | Expedited review |
| 60–74  | established | Normal depth |
| 45–59  | contributing | Standard |
| 30–44  | probationary | Careful scrutiny |
| 15–29  | untested | Deep review |
| 0–14   | restricted | Maximum scrutiny |

## Scoring Factors
- Approval/rejection streaks, PR size complexity, category labels,
  recency weighting (45-day half-life), velocity gates, inactivity decay

## Source
Algorithm from milady-ai/milady .github/trust-scoring.cjs
Copy the latest version from: https://github.com/milady-ai/milady/blob/develop/.github/trust-scoring.cjs
```

Then tell the user:
> ⚠️  Trust scoring requires copying the algorithm from milady-ai/milady:
>
>   1. Download: https://github.com/milady-ai/milady/blob/develop/.github/trust-scoring.cjs
>   2. Save as: .github/trust-scoring.cjs
>   3. Download: https://github.com/milady-ai/milady/blob/develop/.github/trust-scoring.js
>   4. Save as: .github/trust-scoring.js
>
> The algorithm is maintained by the milady project. Copy it once and it works standalone.
> The agent-review workflow (if installed) automatically loads it for trust context.

---

### Section K: CLAUDE.md (Q10 = Y)

Create `CLAUDE.md` — uses `{PROJECT_NAME}` and actual view names detected from `src/`:

```markdown
# CLAUDE.md — {PROJECT_NAME}

Guidance for Claude Code in this Electrobun project.

## Commands

```bash
bun start              # electrobun dev
bun run dev            # dev with file watching (--watch)
bun run build:canary   # build for canary
bun run build:stable   # build for stable
bun test               # vitest run
bun run test:coverage  # with coverage report
```

## Architecture

**Template type:** {template-type}

**Source layout:**
- `src/bun/index.ts`     — main process entry
- `src/{viewname}/`      — renderer view(s): {list of detected views}
- `src/shared/`          — shared RPC types (imported by both bun and renderer)
- `src/assets/`          — static assets
- `src/tests/`           — test files (vitest)
- `electrobun.config.ts` — app identity + build config
- `docs/`                — Mintlify documentation

**Identifier:** {PROJECT_IDENTIFIER}

## Key Patterns

- RPC: `BrowserView.defineRPC<MyRPC>()` (bun) + `new Electroview<MyRPC>()` (renderer)
- View URL must match config key exactly: `views.mainview` → `mainview://index.html`
- `sandbox: false` required on every BrowserView that uses RPC
- `openDevTools()` on BrowserView instance, not `win.webview.openDevTools()`
- GPU objects must be pushed to `KEEPALIVE` array to prevent Bun GC collection
- Bun imports: `electrobun/bun` | Renderer imports: `electrobun/view`

## Plugin

Uses the `electrobun-dev` Claude Code plugin.
- `/electrobun-guide`    — full skills/commands reference
- `/electrobun-workflow` — current pipeline stage
- `/electrobun-align`    — scan and repair drift
- `/electrobun-sdlc`     — full 8-stage feature pipeline
```

---

### Section L: Pre-push Hook (Q11 = Y)

Create `.github/hooks/pre-push`:
```bash
#!/bin/sh
echo "[{PROJECT_NAME}] Running type check..."
bun tsc --noEmit
if [ $? -ne 0 ]; then
  echo "Type check failed — push aborted. Fix errors above."
  exit 1
fi
echo "Type check passed."
```

Create `scripts/install-hooks.sh`:
```bash
#!/bin/sh
cp .github/hooks/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
echo "Git hooks installed for {PROJECT_NAME}."
```

Tell user: `Run bash scripts/install-hooks.sh to activate the pre-push hook.`

---

## Step 4: Summary

```
══════════════════════════════════════════════════════════════
 ✅ ELECTROBUN SETUP COMPLETE — {PROJECT_NAME}
══════════════════════════════════════════════════════════════

App:       {PROJECT_NAME}
ID:        {PROJECT_IDENTIFIER}
Template:  {template-type}

Files created:
  {list every file created, one per line}

Next steps:
  1. bun install && bun start          — verify template runs
  2. bash scripts/install-hooks.sh     — activate pre-push hook (if installed)
  3. Add GitHub Secrets                — see .github/SECRETS.md (gitignored)
     {IF agent-review installed}
     → ANTHROPIC_API_KEY  (Claude reviewer)
     → OPENAI_API_KEY     (Codex fallback, optional)
     → GH_PAT             (for auto-merge of workflow-file PRs)
     {IF trust scoring installed}
     → Copy trust-scoring.cjs from milady-ai/milady (see .github/TRUST_DESIGN.md)
  4. /electrobun-workflow               — check your current pipeline stage

Plugin reference: /electrobun-guide
══════════════════════════════════════════════════════════════
```
