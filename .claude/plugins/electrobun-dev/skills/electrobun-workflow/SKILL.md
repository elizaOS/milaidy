---
name: Electrobun Workflow
description: The master Electrobun development lifecycle guide. Use for any Electrobun project to understand where you are in the pipeline and what comes next. Links all stages together.
version: 1.0.0
---

# Electrobun Development Workflow

## The Pipeline

```
┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌───────────┐
│   INIT   │ →  │   DEV    │ →  │    BUILD     │ →  │  RELEASE  │
│          │    │          │    │              │    │           │
│ template │    │ dev+watch│    │ canary/stable│    │  upload   │
│ scaffold │    │ hot reload│   │ sign+notarize│    │ auto-update│
└──────────┘    └──────────┘    └──────────────┘    └───────────┘
  Skill:          Skill:          Skill:               Skill:
  electrobun-init electrobun-dev  electrobun-build     electrobun-release
  Command:        (always-on)     Command:             Command:
  /electrobun-init                /electrobun-build    /electrobun-release
```

---

## Stage 1: INIT

**When:** Starting a new project from scratch.

**Command:**
```bash
electrobun init <project-name> --template=<template>
cd <project-name> && bun install
```

**Success:** `bun start` launches the template app.

**→ Ready for Stage 2 when:** Template runs, you've updated `app.name` and `app.identifier`.

**Deep knowledge:** See `electrobun-init` skill.

---

## Stage 2: DEV

**When:** Building features — the majority of development time.

**Commands:**
```bash
bun run dev          # → electrobun dev --watch
```

**Success:** App reloads automatically on save. Console output appears in terminal.

**Key tools while in dev:**
- CEF devtools at `http://localhost:9222` (if using CEF renderer)
- `view.openDevTools()` for native WKWebView (macOS)
- Inline source maps → stack traces point to `.ts` lines

**→ Ready for Stage 3 when:** Feature is complete, tested manually, and you're ready for a distributable build.

**Deep knowledge:** See `electrobun-dev` skill.

---

## Stage 3: BUILD

**When:** Creating a distributable build for testing (canary) or release (stable).

**Commands:**
```bash
# First time: set signing env vars
export ELECTROBUN_DEVELOPER_ID="Developer ID Application: ..."
export ELECTROBUN_APPLEID="you@example.com"
export ELECTROBUN_APPLEIDPASS="xxxx-xxxx-xxxx-xxxx"
export ELECTROBUN_TEAMID="XXXXXXXXXX"

# Canary (internal testing)
electrobun build --env=canary

# Stable (production)
electrobun build --env=stable
```

**Success:** `artifacts/` contains `.tar.zst`, `.patch`, `update.json`, `.dmg`.

**Skip signing for pipeline testing:**
```bash
ELECTROBUN_SKIP_CODESIGN=1 electrobun build --env=canary
```

**→ Ready for Stage 4 when:** Artifacts are present and the built app runs correctly.

**Deep knowledge:** See `electrobun-build` skill.

---

## Stage 4: RELEASE

**When:** Distributing the build to users and enabling auto-update.

**Steps:**
1. Upload `artifacts/` to `release.baseUrl`
2. Verify: `curl <baseUrl>/macos-arm64-update.json`
3. Running apps detect and apply the update automatically

**Success:** Users on the previous version get the update within their configured check interval.

**Deep knowledge:** See `electrobun-release` skill.

---

## Cross-Stage Config Reference

See `electrobun-config` skill for the complete `electrobun.config.ts` field reference.

---

## Common Cross-Stage Gotchas

1. **`app.version` not bumped** → Auto-updater won't detect a new release even after upload
2. **`build.views` missing an entry** → Renderer HTML loads but JS silently fails (Stage 2-3)
3. **`bundleWGPU`/`bundleCEF` not set for all platforms** → Runtime crash on non-dev machine (Stage 3)
4. **`release.baseUrl` not set** → No update.json generated, no patch created (Stage 3→4)
5. **Artifacts uploaded but `update.json` URL wrong** → Auto-updater polls `<baseUrl>/<os>-<arch>-update.json` — no version in the filename

---

## Quick Reference

| I want to... | Command | Skill |
|---|---|---|
| Start a new project | `/electrobun-init` | electrobun-init |
| Set up a new window with RPC | `/electrobun-window` | electrobun-rpc |
| Add WebGPU rendering | `/electrobun-wgpu` | electrobun-webgpu |
| Add an app menu | `/electrobun-menu` | electrobun |
| Check pipeline status | `/electrobun-workflow` | electrobun-workflow |
| Run a guided build | `/electrobun-build` | electrobun-build |
| Release to users | `/electrobun-release` | electrobun-release |
| Understand the full config | (auto) | electrobun-config |
| Debug a failure | (auto) | electrobun (debugger agent) |
