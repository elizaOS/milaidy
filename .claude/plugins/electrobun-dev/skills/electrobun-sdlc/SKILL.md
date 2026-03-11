---
name: Electrobun SDLC
description: Use when building any complete Electrobun feature from idea to documentation. Explains the 8-stage agent pipeline — researcher, architect, planner, dev squad, QA engineer, test writer, alignment agent, docs agent — and how to orchestrate them with or without Claude Code agent teams.
version: 1.0.0
---

# Electrobun SDLC Pipeline

Full 8-stage agent pipeline for building complete, tested, documented Electrobun features. Each stage has a dedicated specialist agent. Output from each stage is the input to the next.

## Pipeline Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    /electrobun-sdlc <feature>                        │
│                   Orchestrator (main Claude)                         │
└──┬───────────────────────────────────────────────────────────────────┘
   │
   ▼ Stage 1 ─────────────────────────────────────────────────────────
   electrobun-researcher
   → Explores codebase + API surface
   → Output: Research Report (files, patterns, risks, unknowns)
   │
   ▼ Stage 2 ─────────────────────────────────────────────────────────
   electrobun-architect
   → Receives Research Report
   → Output: Architecture Spec (scope, blast radius, RPC flow, types, config skeleton)
   │
   ▼ Stage 3 ─────────────────────────────────────────────────────────
   electrobun-planner
   → Receives Research Report + Architecture Spec
   → Output: Implementation Plan (atomic tasks, agent assignments, acceptance criteria)
   │
   ▼ Stage 4 ─────────────────────────────────────────────────────────
   DEV SQUAD (parallel if teams enabled)
   electrobun-ui-agent      ← renderer files, HTML, Electroview RPC
   electrobun-backend-agent ← bun files, BrowserView.defineRPC, config
   → Output: Implemented files
   │
   ▼ Stage 5 ─────────────────────────────────────────────────────────
   electrobun-qa-engineer
   → Audits all implemented code vs spec + plan
   → Output: QA Report (BLOCKER / IMPORTANT / MINOR findings, blast radius audit)
   │
   ▼ Stage 6 ─────────────────────────────────────────────────────────
   electrobun-test-writer
   → Writes golden-outcome tests (ideal behavior, not fitting current code)
   → Uses Kitchen Sink defineTest() framework
   → Output: Test file + coverage summary
   │
   ▼ Stage 7 ─────────────────────────────────────────────────────────
   electrobun-alignment-agent
   → Fixes all QA findings in severity order (BLOCKER → IMPORTANT → MINOR)
   → Corrects blast radius drift (forgotten files, unplanned changes)
   → Output: Alignment Report (what was fixed, what remains)
   │
   ▼ Stage 8 ─────────────────────────────────────────────────────────
   electrobun-docs-agent
   → Writes Mintlify MDX documentation
   → Writes regression tests
   → Marks implementation plan as ✅ COMPLETE
   → Output: Docs page, regression test file, completion summary
```

## Stage Handoffs

Each stage produces a document that the orchestrator passes to the next stage verbatim. Never have agents read each other's files — the orchestrator is the courier.

| From | To | Document |
|------|----|----------|
| Stage 1 | Stage 2 | Research Report |
| Stage 1+2 | Stage 3 | Research Report + Architecture Spec |
| Stage 2+3 | Stage 4 | Architecture Spec + Implementation Plan (agent-specific tasks) |
| Stage 4 | Stage 5 | All implemented files (list of paths) |
| Stage 2+3+4+5 | Stage 6 | Arch Spec + Plan + QA Report |
| Stage 5+6 | Stage 7 | QA Report + Test Coverage Summary |
| Stage 2+3+6+7 | Stage 8 | Arch Spec + Plan + Test Summary + Alignment Report |

## Dev Squad Coordination (Stage 4)

The dev squad runs in sequence (UI first, then backend) because the renderer defines the RPC contract.

**With `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`:**
```
TeamCreate → UI task → wait for UI completion + RPC Contract Handoff → backend task → wait → done
```

**Without teams (sequential subagents):**
```
Dispatch UI subagent → collect handoff → dispatch backend subagent → collect → done
```

The UI agent produces an **RPC Contract Handoff** table before finishing:

```
## RPC CONTRACT HANDOFF

### Requests (renderer calls bun, expects response)
| Name | Args Type | Response Type | Shared Type File |
|------|-----------|---------------|-----------------|
| getItems | {} | Item[] | src/shared/items-rpc.ts |

### Messages (bun pushes to renderer, no response)
| Name | Args Type | Shared Type File |
|------|-----------|-----------------|
| itemAdded | { item: Item } | src/shared/items-rpc.ts |

### Shared Type File Path
`src/shared/items-rpc.ts`
```

The orchestrator passes this handoff verbatim to the backend agent.

## Agent Role Boundaries

| Agent | Owns | Never Touches |
|-------|------|---------------|
| electrobun-researcher | Reads everything | Writes nothing |
| electrobun-architect | Design docs only | Source files |
| electrobun-planner | Plan doc only | Source files |
| electrobun-ui-agent | `src/<viewname>/`, shared type file | `src/bun/`, `electrobun.config.ts` |
| electrobun-backend-agent | `src/bun/`, `electrobun.config.ts` | `src/<viewname>/` |
| electrobun-qa-engineer | Reads everything | Writes nothing |
| electrobun-test-writer | `kitchen/src/tests/<name>.test.ts` | Feature source files |
| electrobun-alignment-agent | Any file with a QA finding | Files with no QA findings |
| electrobun-docs-agent | `docs/`, `*.regression.test.ts`, plan file | Feature source files |

## Quality Gates

The orchestrator enforces these gates before advancing to the next stage:

| Gate | Condition to advance |
|------|---------------------|
| After Stage 5 (QA) | QA Report received. BLOCKER count reviewed by orchestrator. |
| After Stage 6 (Tests) | Test file written and coverage summary reviewed. |
| After Stage 7 (Alignment) | All BLOCKERs marked resolved in Alignment Report. |
| After Stage 8 (Docs) | Plan marked ✅ COMPLETE. Completion summary received. |

If QA finds BLOCKERs that suggest the Architecture Spec itself was wrong (not the implementation), escalate to the human before alignment.

## Triggering the Pipeline

Run `/electrobun-sdlc <feature description>` — the orchestrator command handles stage dispatch.

For teams: set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` before starting the session.
For sequential mode (default): no environment variable needed.

## When to Use vs /electrobun-feature

| Situation | Use |
|-----------|-----|
| New complete feature (new views, RPC, docs needed) | `/electrobun-sdlc` |
| Quick addition to an existing feature (1-2 files) | `/electrobun-feature` |
| Bug fix only | `/electrobun-debugger` |
| Just wiring RPC for an existing view | `/electrobun-rpc` |
