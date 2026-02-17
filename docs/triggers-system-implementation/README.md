# Triggers System Implementation Dossier

This folder is an expanded implementation dossier for adding a full trigger system across:

- `@elizaos/core` / `@elizaos/typescript`
- Milady backend (`milady/src/api/server.ts`)
- Milady frontend (`milady/apps/app/src/*`)

The intent is to be implementation-safe, failure-aware, and explicit about tradeoffs.

## Why This Exists

The first report was directionally good but too coarse for safe execution. It did not fully account for:

- Milady runtime boot differences (`IGNORE_BOOTSTRAP=true`)
- dual capability stacks in Eliza (`bootstrap/*` and `basic-capabilities/* + advanced-capabilities/*`)
- action-filter and action-execution edge behavior
- route ordering and synchronization pitfalls in Milady's manual API router
- run-time race, overlap, and observability constraints in the Task engine

This dossier corrects those gaps.

## Document Index

1. `00-critical-assessment.md`
   - Critical teardown of the previous plan/report
   - Explicit shortcomings, incorrect assumptions, and corrections

2. `01-system-control-flow-map.md`
   - Current-state control-flow map across Eliza core + Milady runtime/API/UI
   - Startup, message loop, task loop, action loop, and UI data flow

3. `02-phase-1-eliza-core-trigger-runtime.md`
   - Trigger execution architecture on top of TaskService + AutonomyService
   - File-by-file runtime changes, invariants, and failure handling

4. `03-phase-2-capability-and-action-layer.md`
   - `CREATE_TASK` / `CREATE_TRIGGER` action design and capability registration strategy
   - Bootstrap-vs-basic/advanced capability path risk analysis

5. `04-phase-3-milady-api-layer.md`
   - Trigger API contract + route implementation details
   - Validation, route ordering, error semantics, and runtime coupling

6. `05-phase-4-milady-frontend-layer.md`
   - Triggers page architecture, state model, navigation integration
   - API client, AppContext, polling/websocket strategy, UX failure modes

7. `06-phase-5-observability-governance-and-ops.md`
   - Metrics, logs, audit records, quotas, anti-spam controls, kill switches
   - Operational runbooks for degraded behavior

8. `07-alternative-architectures.md`
   - Multiple implementation options with scored tradeoffs
   - Recommendation and rationale

9. `08-risk-register.md`
   - Detailed risk register (severity, likelihood, detection, mitigation, rollback)
   - Includes control-flow breakpoints and recovery plans

10. `09-test-strategy-rollout.md`
    - Unit, integration, E2E, chaos/reliability tests
    - Incremental rollout and migration/backout procedure

11. `10-file-by-file-change-catalog.md`
    - Exhaustive file-level change manifest
    - For each file: current behavior, target behavior, change scope, and test impact

12. `11-master-implementation-roadmap.md`
    - Milestone sequencing and delivery gates
    - Dependency graph and final go-live criteria

## Ground Truth Sources

This dossier is grounded in direct inspection of:

- Eliza task/action/autonomy internals
  - `eliza/packages/typescript/src/services/task.ts`
  - `eliza/packages/typescript/src/autonomy/service.ts`
  - `eliza/packages/typescript/src/runtime.ts`
  - `eliza/packages/typescript/src/types/task.ts`
  - `eliza/packages/typescript/src/basic-capabilities/*`
  - `eliza/packages/typescript/src/advanced-capabilities/*`
  - `eliza/packages/typescript/src/bootstrap/*`

- Milady runtime and server
  - `milady/src/runtime/eliza.ts`
  - `milady/src/runtime/milady-plugin.ts`
  - `milady/src/api/server.ts`

- Milady frontend
  - `milady/apps/app/src/api-client.ts`
  - `milady/apps/app/src/AppContext.tsx`
  - `milady/apps/app/src/App.tsx`
  - `milady/apps/app/src/navigation.ts`
  - `milady/apps/app/src/components/Nav.tsx`

- Reference systems
  - `openclaw/*`
  - `nanoclaw/*`

## Usage

Read in this order:

1) `00` and `01` first (constraints and current control flow),  
2) phase docs `02`-`06`,  
3) alternatives and risk/testing docs `07`-`10`.

This order prevents implementation drift and addresses the biggest failure mode of large feature work: coding before control-flow and risk are fully mapped.

