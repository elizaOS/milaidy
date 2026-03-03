---
name: integration-dod-map
description: |
  Build a complete integration inventory and a measurable Definition of Done
  graph for the repo, including dependency mapping, coverage status, and a
  prioritized missing-work backlog.

  Use when: you need a non-handwavy integration readiness audit with explicit
  evidence, verification commands, and UNKNOWN markers for unresolved facts.
---

# Integration DoD Map

Create a complete integration map and a trackable Definition of Done (DoD) baseline.

## Source Of Truth

- `package.json`
- `tsconfig.json`
- `biome.json`
- `vitest.config.ts`
- `vitest.unit.config.ts`
- `vitest.e2e.config.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/test.yml`
- `src/api/server.ts`
- `src/config/plugin-auto-enable.ts`
- `src/config/schema.ts`
- `src/config/types.milady.ts`
- Integration route/service modules under `src/api/`, `src/services/`, `src/cloud/`, `src/providers/`

## Workflow

1. Gather repo facts from config, scripts, type/lint settings, test stack, and CI jobs.
2. Enumerate integrations as boundary crossings:
   - external APIs/services
   - internal data/services
   - auth/security boundaries
   - deployment/runtime boundaries
3. Build an inventory table with entry points, data sensitivity, env requirements, coverage, and observability.
4. Build a Mermaid graph with system dependencies and trust boundaries.
5. Define DoD in three layers:
   - global DoD
   - per-integration template
   - filled per-integration instances
6. Build a DoD coverage matrix using status semantics:
   - `✅ done` (include file evidence and a row-level proof command)
   - `⚠️ partial` (state exact missing artifact)
   - `❌ missing` (state exact missing artifact)
   - `❓ unknown` (state what must be inspected)
7. Produce a prioritized missing-work backlog with:
   - stable row ID (for issue mapping)
   - priority (`P0`/`P1`/`P2`)
   - area
   - owner (area-owner model: `API`, `Runtime`, `Security`, `Blockchain`, `DX/Tooling`, `Docs`)
   - integration
   - missing item
   - measurable acceptance criteria
   - verification command(s)
   - suggested file locations
   - risk if not done
8. Generate `GitHub Issue Drafts`:
   - one issue draft per missing-work row
   - include title, labels (priority + area), owner (area-owner), acceptance criteria, verification commands, risk, and source reference to the backlog row
9. Run UNKNOWN minimization:
   - execute targeted scans before finalizing
   - convert avoidable `❓` to `✅`/`⚠️`/`❌` with evidence
   - keep `❓` only when local evidence is genuinely unavailable, and explain blocker
10. Emit copy/paste verification commands that mirror CI behavior.

## Guardrails

- Do mapping + standards + gap analysis only. Do not implement feature logic in this pass.
- Do not guess. If evidence is missing, mark `UNKNOWN` and list required follow-up.
- Minimize `UNKNOWN` aggressively with targeted repository scans before final output.
- Every “done” claim must include:
  - at least one file path evidence reference
  - at least one verification command
- Coverage matrix rows must include a `Proof command` column.
- Missing Worklist must include both `Area` and `Owner` columns; owner uses area-owner model.
- Keep tests deterministic; avoid timing-flake assertions in recommendations.
- Enforce type-safety posture:
  - strict TS
  - no unbounded `any` expansion
- “Dry code” bar:
  - no parallel implementations
  - no dead/unreferenced paths in touched surface
  - shared logic extraction where duplication is risk-bearing
- Integration reliability bar must cover:
  - happy path
  - failure modes
  - timeout/retry policy
  - observability
  - security considerations
- Portability: skill definition should be tracked in git. If repo ignores `skills/`, add targeted unignore rules for this skill.

## Output Contract

Write one report at repo root:

- `INTEGRATION_DOD_MAP.md`

Use this section order:

1. Title + timestamp
2. Repo Facts
3. Integration Inventory
4. Integration Graph (Mermaid)
5. Definition of Done - Global
6. Definition of Done - Per Integration (Template)
7. Definition of Done - Per Integration (Filled)
8. Integration DoD Coverage Matrix
9. Missing Worklist (Prioritized)
10. GitHub Issue Drafts
11. Verification Commands
12. Unknowns / Questions

## Strict Compliance Checklist

- Missing Worklist has `Area` + `Owner` fields.
- Integration matrix includes `Proof command` column.
- Every row marked with `✅` has both:
  - file-path evidence
  - a direct verification command
- Every missing-work row has a corresponding issue draft.
- `UNKNOWN` entries are only retained with explicit blocker text.
- Report section order matches output contract exactly.

## Validate

```bash
bun run lint
bun run format
bun run typecheck
bunx vitest run --config vitest.unit.config.ts
bun run test:coverage
bun run build
bunx vitest run --config vitest.e2e.config.ts --exclude test/anvil-contracts.e2e.test.ts --exclude test/apps-e2e.e2e.test.ts
bunx vitest run --config vitest.e2e.config.ts test/e2e-validation.e2e.test.ts
```
