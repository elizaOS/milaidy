---
name: Electrobun Plugin Guide
description: The master index for the electrobun-dev Claude Code plugin. Use when starting a new Electrobun project, unsure which skill or command to use, wanting a full overview of what the plugin provides, or onboarding to the plugin ecosystem. Lists all 15 skills, 13 commands, and 11 agents with when-to-use guidance and decision trees.
version: 1.0.0
---

# electrobun-dev Plugin Guide

Complete reference for the electrobun-dev Claude Code plugin. All resources are available via the `Skill` tool (skills), slash commands (commands), or agent dispatch (agents).

---

## Quick Start Decision Tree

```
What do I want to do?
│
├─ Start a brand-new Electrobun app
│    └─ /electrobun-init → then /electrobun-setup
│
├─ Build a complete new feature (with tests + docs)
│    └─ /electrobun-sdlc <feature description>
│
├─ Add a quick feature to an existing view
│    └─ /electrobun-feature <description>
│
├─ Wire up RPC between bun and renderer
│    └─ /electrobun-rpc
│
├─ Add a new window or manage windows
│    └─ /electrobun-window
│
├─ Add application menus or tray
│    └─ /electrobun-menu
│
├─ Add WebGPU / GPU rendering
│    └─ /electrobun-wgpu
│
├─ Run or write tests
│    └─ /electrobun-test
│
├─ Build and package the app
│    └─ /electrobun-build
│
├─ Publish a release and set up updates
│    └─ /electrobun-release
│
├─ Check where I am in the pipeline
│    └─ /electrobun-workflow
│
├─ Align an existing project with plugin standards
│    └─ /electrobun-align
│
├─ Something is broken / debugging
│    └─ electrobun-debugger agent
│
└─ Understand what the plugin provides
     └─ (you're already here)
```

---

## Skills Reference (15 skills)

Skills are invoked via the `Skill` tool. They load context and rules for a domain.

### Foundation

| Skill | Load When |
|-------|-----------|
| `electrobun` | Any Electrobun project work — BrowserWindow, BrowserView, events, app lifecycle, menus, tray |
| `electrobun-config` | Editing `electrobun.config.ts` or looking up any config field |
| `electrobun-rpc` | Wiring RPC between bun process and renderer |
| `electrobun-platform` | Building for multiple OS targets, platform-specific behavior, artifact naming |

### Development Lifecycle

| Skill | Load When |
|-------|-----------|
| `electrobun-init` | Scaffolding a new project, choosing a template |
| `electrobun-dev` | Running dev server, hot reload, opening devtools |
| `electrobun-workflow` | Checking pipeline status, understanding the INIT→DEV→BUILD→RELEASE flow |
| `electrobun-build` | Building for distribution, code signing, CI/CD matrix |
| `electrobun-release` | Publishing releases, auto-update configuration, Updater API |

### Specialized

| Skill | Load When |
|-------|-----------|
| `electrobun-webgpu` | Native GPU rendering, WGSL shaders, Dawn, WGPU buffer management |
| `electrobun-testing` | Writing `defineTest()` test cases, Kitchen Sink test framework |
| `electrobun-kitchen-sink` | Working with the Kitchen Sink reference app, UI map, test automation |

### Agent Orchestration

| Skill | Load When |
|-------|-----------|
| `electrobun-sdlc` | Running the full 8-stage SDLC pipeline, understanding stage handoffs |
| `electrobun-teams` | Using `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, orchestrating UI + backend agents |

### Integration

| Skill | Load When |
|-------|-----------|
| `electrobun-milady` | Submitting PRs to milady-ai/milady, understanding trust scoring + review system |

---

## Commands Reference (13 commands)

Commands are slash commands invoked as `/electrobun-<name>`.

### Project Lifecycle

| Command | What it does |
|---------|-------------|
| `/electrobun-init` | Interactive template picker (19 templates) → scaffolds new project |
| `/electrobun-setup` | Run after init — creates CI/CD, test scaffold, docs, CLAUDE.md, gitignore, release workflow for a production-ready project |
| `/electrobun-workflow` | Shows pipeline status: which stage you're in, what's done, what's next |

### Feature Development

| Command | What it does |
|---------|-------------|
| `/electrobun-feature <desc>` | Quick 2-agent build: UI agent → RPC Contract Handoff → backend agent |
| `/electrobun-sdlc <desc>` | Full 8-stage pipeline: researcher → architect → planner → dev squad → QA → tests → alignment → docs |
| `/electrobun-rpc` | RPC setup wizard: schema authoring, handler wiring, shared type file |
| `/electrobun-window` | Window creation wizard: BrowserWindow options, sizing, positioning, title bar |
| `/electrobun-menu` | Application menu / context menu / tray menu builder |
| `/electrobun-wgpu` | WebGPU feature builder: shader setup, render loop, buffer management |

### Quality & Testing

| Command | What it does |
|---------|-------------|
| `/electrobun-test` | 5-option menu: run by name, run all automated, write new test, manifest ops, coverage |
| `/electrobun-align` | Alignment wizard for existing projects: scans, backs up, prompts per change, repairs drift |

### Release

| Command | What it does |
|---------|-------------|
| `/electrobun-build` | Guided build: env picker, signing prereqs, version confirm, artifact summary |
| `/electrobun-release` | Full release: version bump, signing check, channel select, build, upload, verify |

---

## Agents Reference (11 agents)

Agents are dispatched by commands or orchestrators — not invoked directly by users.

### SDLC Pipeline Agents (Stages 1–8)

| Stage | Agent | Role |
|-------|-------|------|
| 1 | `electrobun-researcher` | Codebase scan, API surface mapping, risk identification |
| 2 | `electrobun-architect` | Architecture spec, blast radius analysis, RPC flow, config skeleton |
| 3 | `electrobun-planner` | Atomic TDD task plans, agent assignments, sanity checks |
| 4a | `electrobun-ui-agent` | Renderer files, HTML/CSS, Electroview RPC, produces RPC Contract Handoff |
| 4b | `electrobun-backend-agent` | Bun-side wiring, BrowserView.defineRPC, config updates |
| 5 | `electrobun-qa-engineer` | Spec compliance audit, blast radius check, BLOCKER/IMPORTANT/MINOR report |
| 6 | `electrobun-test-writer` | Golden-outcome tests (Kitchen Sink defineTest or vitest) |
| 7 | `electrobun-alignment-agent` | Fix QA findings in priority order, cleanup, blast radius correction |
| 8 | `electrobun-docs-agent` | Mintlify docs, regression tests, mark plan COMPLETE |

### Specialist Agents

| Agent | Use When |
|-------|---------|
| `electrobun-debugger` | Something is broken — build failure, RPC timeout, blank window, GPU crash |
| `electrobun-kitchen-agent` | Automating Kitchen Sink tests, reading UI map, running test suites |

---

## Plugin File Layout

```
~/.claude/plugins/electrobun-dev/
├── skills/
│   ├── electrobun/           ← Core patterns
│   ├── electrobun-build/     ← Build system + CI/CD
│   ├── electrobun-config/    ← Config reference
│   ├── electrobun-dev/       ← Dev server
│   ├── electrobun-guide/     ← This file (master index)
│   ├── electrobun-init/      ← Templates
│   ├── electrobun-kitchen-sink/ ← Kitchen Sink reference
│   ├── electrobun-milady/    ← milady integration
│   ├── electrobun-platform/  ← Cross-platform
│   ├── electrobun-release/   ← Release + Updater
│   ├── electrobun-rpc/       ← RPC system
│   ├── electrobun-sdlc/      ← 8-stage pipeline
│   ├── electrobun-teams/     ← Agent teams
│   ├── electrobun-testing/   ← defineTest framework
│   ├── electrobun-webgpu/    ← GPU rendering
│   └── electrobun-workflow/  ← Pipeline map
├── commands/
│   ├── electrobun-align.md   ← Alignment wizard
│   ├── electrobun-build.md   ← Build wizard
│   ├── electrobun-feature.md ← Quick 2-agent feature
│   ├── electrobun-init.md    ← Template picker
│   ├── electrobun-menu.md    ← Menu builder
│   ├── electrobun-release.md ← Release wizard
│   ├── electrobun-rpc.md     ← RPC wizard
│   ├── electrobun-sdlc.md    ← Full SDLC
│   ├── electrobun-setup.md   ← Project setup
│   ├── electrobun-test.md    ← Test runner
│   ├── electrobun-wgpu.md    ← WebGPU builder
│   ├── electrobun-window.md  ← Window wizard
│   └── electrobun-workflow.md ← Pipeline status
└── agents/
    ├── electrobun-alignment-agent.md
    ├── electrobun-architect.md
    ├── electrobun-backend-agent.md
    ├── electrobun-debugger.md
    ├── electrobun-docs-agent.md
    ├── electrobun-kitchen-agent.md
    ├── electrobun-planner.md
    ├── electrobun-qa-engineer.md
    ├── electrobun-researcher.md
    ├── electrobun-test-writer.md
    └── electrobun-ui-agent.md
```

---

## Workflow Map

```
NEW PROJECT
    /electrobun-init       → Pick template, scaffold
    /electrobun-setup      → CI/CD, docs, tests, CLAUDE.md

DEVELOPMENT
    /electrobun-dev        → Run dev server
    /electrobun-feature    → Quick feature (2-agent)
    /electrobun-sdlc       → Full feature (8-stage)
    /electrobun-rpc        → Wire RPC
    /electrobun-window     → Add window
    /electrobun-menu       → Add menus
    /electrobun-wgpu       → Add GPU rendering

QUALITY
    /electrobun-test       → Run/write tests
    /electrobun-align      → Repair drift

BUILD & RELEASE
    /electrobun-build      → Package for distribution
    /electrobun-release    → Publish + update server

STATUS CHECK
    /electrobun-workflow   → Where am I in the pipeline?
```

---

## Common Skill Combinations

| Goal | Load These Skills |
|------|------------------|
| "I'm starting a new feature" | `electrobun` + `electrobun-rpc` |
| "I'm setting up builds" | `electrobun-build` + `electrobun-config` |
| "I'm releasing" | `electrobun-release` + `electrobun-platform` |
| "I'm debugging" | `electrobun` + `electrobun-debugger` agent |
| "I'm writing tests" | `electrobun-testing` + `electrobun-kitchen-sink` |
| "I'm building GPU features" | `electrobun-webgpu` + `electrobun-config` |
| "I'm contributing to milady" | `electrobun-milady` + `electrobun-sdlc` |
| "I'm setting up CI/CD" | `electrobun-build` + `electrobun-release` + `electrobun-platform` |
