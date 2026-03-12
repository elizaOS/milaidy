---
name: electrobun-sdlc
description: Run the full 8-stage Electrobun SDLC pipeline for a feature — researcher, architect, planner, dev squad, QA engineer, test writer, alignment agent, docs agent. Produces tested, documented, complete features.
argument-hint: <feature description>
---

Build a complete Electrobun feature through all 8 pipeline stages.

## Stage 0: Setup

Check teams mode:
```bash
echo ${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-"NOT SET"}
```

If `NOT SET`: run all stages as sequential subagents.
If set: use `TeamCreate` for Stage 4 dev squad parallelism (UI + backend).

Announce to user:
> Running Electrobun SDLC pipeline for: **<feature description>**
> Mode: [Teams / Sequential]
> 8 stages: Researcher → Architect → Planner → Dev Squad → QA → Tests → Alignment → Docs

---

## Stage 1: Research

Dispatch `electrobun-researcher` agent.

Prompt:
> You are Stage 1 of the Electrobun SDLC pipeline. Research the following feature for the architect.
>
> Feature: <feature description>
>
> Explore the codebase at `src/`, `electrobun.config.ts`, and `package.json`. Identify every file that may be touched, the relevant Electrobun APIs, existing patterns to follow, what already exists, and all risks/unknowns.
>
> Produce the complete Research Report as described in your instructions.

Collect Research Report. Present section headings to user. Advance to Stage 2.

---

## Stage 2: Architecture

Dispatch `electrobun-architect` agent.

Prompt:
> You are Stage 2 of the Electrobun SDLC pipeline. Design the architecture for this feature.
>
> Feature: <feature description>
>
> Research Report from Stage 1:
> <paste Research Report verbatim>
>
> Produce all 8 sections of the Architecture Spec: scope definition, blast radius analysis, window/view layout, RPC flow diagram, shared type contract, file structure, electrobun.config.ts changes, and platform notes.

Collect Architecture Spec.

**Gate:** Present scope + blast radius to user. Ask: "Does this scope and blast radius look right?" Wait for approval before Stage 3.

---

## Stage 3: Planning

Dispatch `electrobun-planner` agent.

Prompt:
> You are Stage 3 of the Electrobun SDLC pipeline. Convert the Architecture Spec into an atomic Implementation Plan.
>
> Feature: <feature description>
>
> Research Report:
> <paste Research Report>
>
> Architecture Spec:
> <paste Architecture Spec>
>
> Produce the complete Implementation Plan with numbered tasks, agent assignments ([AGENT: ui|backend|both]), failing test specs, acceptance criteria, and the Sanity Check Results section.

Collect Implementation Plan.

Present task count and dev squad assignment split to user (e.g., "12 tasks: 5 for UI agent, 6 for backend agent, 1 shared type task").

---

## Stage 4: Dev Squad

### Task 0: Shared type file (if required)

If the Implementation Plan has a shared type file task, dispatch `electrobun-backend-agent` first for just that task:

Prompt:
> Create only the shared RPC type file as specified in Task 1 of the Implementation Plan.
> Architecture Spec: <paste Architecture Spec>
> Task: <paste Task 1 text>
> Commit when done.

### UI Agent

Dispatch `electrobun-ui-agent` with all UI-assigned tasks.

Prompt:
> You are the UI agent in Stage 4 of the Electrobun SDLC pipeline.
>
> Feature: <feature description>
>
> Architecture Spec (your source of truth):
> <paste Architecture Spec>
>
> Your tasks from the Implementation Plan:
> <paste all [AGENT: ui] tasks>
>
> The shared type file already exists at: <path>
>
> Complete all tasks in order. After finishing, produce the RPC Contract Handoff table before signaling done.

Collect UI agent output + **RPC Contract Handoff table**.

### Backend Agent

Dispatch `electrobun-backend-agent` with all backend-assigned tasks and the RPC Contract Handoff.

Prompt:
> You are the backend agent in Stage 4 of the Electrobun SDLC pipeline.
>
> Feature: <feature description>
>
> Architecture Spec (your source of truth):
> <paste Architecture Spec>
>
> RPC Contract Handoff from UI agent:
> <paste RPC Contract Handoff table verbatim>
>
> Your tasks from the Implementation Plan:
> <paste all [AGENT: backend] tasks>
>
> Complete all tasks in order. The renderer files are already implemented — wire up the bun side to match the RPC contract exactly.

Collect backend agent output.

Present to user: "Dev squad complete. Files implemented: [list from blast radius]"

---

## Stage 5: QA

Dispatch `electrobun-qa-engineer` agent.

Prompt:
> You are Stage 5 of the Electrobun SDLC pipeline. Audit the implemented feature.
>
> Feature: <feature description>
>
> Research Report:
> <paste Research Report>
>
> Architecture Spec (source of truth):
> <paste Architecture Spec>
>
> Implementation Plan (acceptance criteria):
> <paste Implementation Plan>
>
> Files implemented (read each of these):
> <list all files from the Architecture Spec blast radius>
>
> Produce the complete QA Report with BLOCKER / IMPORTANT / MINOR findings and the Blast Radius Audit table.

Collect QA Report.

**Gate:** If QA Report contains BLOCKERs that suggest the Architecture Spec itself was wrong (not just the implementation), present to user and ask how to proceed before continuing.

Present BLOCKER count, IMPORTANT count, MINOR count to user.

---

## Stage 6: Tests

Dispatch `electrobun-test-writer` agent.

Prompt:
> You are Stage 6 of the Electrobun SDLC pipeline. Write golden-outcome tests for this feature.
>
> Feature: <feature description>
>
> Architecture Spec (defines correct behavior):
> <paste Architecture Spec>
>
> Implementation Plan (acceptance criteria as test seeds):
> <paste Implementation Plan>
>
> QA Report (each BLOCKER and IMPORTANT issue needs a test that catches it):
> <paste QA Report>
>
> Write the test file at `kitchen/src/tests/<feature-slug>.test.ts` using defineTest(). Tests must expect golden/ideal behavior — not what the current code does. Produce the Test Coverage Summary including the import line for index.ts.

Collect test file path + Test Coverage Summary.

---

## Stage 7: Alignment

Dispatch `electrobun-alignment-agent` agent.

Prompt:
> You are Stage 7 of the Electrobun SDLC pipeline. Fix all QA findings and align the implementation.
>
> Feature: <feature description>
>
> Architecture Spec (source of truth):
> <paste Architecture Spec>
>
> QA Report (work through in order: BLOCKER → IMPORTANT → MINOR):
> <paste QA Report>
>
> Test Coverage Summary (failing tests are additional signal):
> <paste Test Coverage Summary>
>
> Fix every finding. Correct blast radius drift. Clean up debug artifacts. Produce the Alignment Report with verification checklist.

Collect Alignment Report.

**Gate:** Confirm all BLOCKERs marked resolved in Alignment Report before Stage 8.

---

## Stage 8: Documentation & Completion

Dispatch `electrobun-docs-agent` agent.

Prompt:
> You are Stage 8 and the final stage of the Electrobun SDLC pipeline.
>
> Feature: <feature description>
>
> Architecture Spec:
> <paste Architecture Spec>
>
> Implementation Plan (mark all tasks complete):
> <paste Implementation Plan including file path of the plan>
>
> Test Coverage Summary:
> <paste Test Coverage Summary>
>
> Alignment Report:
> <paste Alignment Report>
>
> 1. Write the Mintlify doc page for this feature at `docs/<feature-slug>.mdx`
> 2. Update `docs/mint.json` navigation
> 3. Write regression tests at `kitchen/src/tests/<feature-slug>.regression.test.ts`
> 4. Mark the implementation plan as COMPLETE (check all checkboxes, add completion footer)
> 5. Produce the Completion Summary

Collect Completion Summary.

---

## Pipeline Complete

Present to user:

```
✅ ELECTROBUN SDLC PIPELINE COMPLETE

Feature: <feature description>

Stages completed:
  Stage 1 Research:    ✅
  Stage 2 Architecture: ✅
  Stage 3 Planning:    ✅
  Stage 4 Dev Squad:   ✅ (UI + Backend)
  Stage 5 QA:          ✅ (<N> findings resolved)
  Stage 6 Tests:       ✅ (<N> tests written)
  Stage 7 Alignment:   ✅ (all BLOCKERs fixed)
  Stage 8 Docs:        ✅

Files created: <list>
Docs: docs/<feature-slug>.mdx
Tests: kitchen/src/tests/<feature-slug>.test.ts
Regression: kitchen/src/tests/<feature-slug>.regression.test.ts
Plan: COMPLETE ✅
```
