# Workflow Builder Design

## Overview

This document describes the workflow builder that is implemented in Milady today.

The current system is a standalone, in-process workflow runtime. It does **not**
use Workflow DevKit, React Flow, or any other external durable-execution engine.
Workflows are stored in `milady.json`, compiled into executable steps at runtime,
and managed through the dashboard plus REST API.

## Current Architecture

### Frontend

The workflow UI lives in the app:

- `apps/app/src/components/WorkflowBuilderView.tsx`
- `apps/app/src/components/workflow/WorkflowCanvas.tsx`
- `apps/app/src/components/workflow/NodeConfigPanel.tsx`
- `apps/app/src/components/workflow/NodePalette.tsx`

The canvas is a custom SVG implementation. It supports node placement, edge
editing, per-node configuration, validation, manual execution, and run history.

### Backend

The workflow backend lives in `src/workflows/`:

- `types.ts` — shared workflow, run, and validation types
- `storage.ts` — CRUD persistence in `milady.json`
- `validation.ts` — graph validation, handle checks, reachability, delay rules,
  transform security rules, and subworkflow cycle detection
- `compiler.ts` — converts workflow graphs into executable steps
- `runtime.ts` — runs compiled steps, tracks events, handles hooks, and manages
  subworkflow delegation

The REST layer is implemented directly in `src/api/server.ts`.

## Supported Node Types

- `trigger`
  - Manual, cron, webhook, or event trigger metadata
- `action`
  - Calls an existing registered runtime action with interpolated parameters
- `llm`
  - Runs a model prompt through the runtime
- `condition`
  - Branches on an explicit `leftOperand` / `operator` / `rightOperand`
    condition model
- `transform`
  - Executes sandboxed JavaScript against the workflow context
- `delay`
  - Waits in-process for short durations only
- `hook`
  - Pauses execution until a hook is resolved through the API
- `loop`
  - Iterates over an array path in the workflow context
- `subworkflow`
  - Starts another workflow
- `output`
  - Returns the final output value

## Execution Model

1. The server loads a workflow definition from storage.
2. `validateWorkflow()` checks the graph before compile/start.
3. `compileWorkflow()` converts the graph into ordered executable steps.
4. `startWorkflow()` creates a run record and executes steps asynchronously.
5. Step events are recorded in-memory and persisted with recent runs.
6. Hooks pause the run until `/api/workflow-hooks/:hookId/resolve` resumes it.

This runtime is intentionally lightweight. It is not durable across crashes in
the same way a true workflow engine would be. On restart, in-flight runs are
marked failed during hydration.

## Current Limits

- Delay nodes are limited to `MAX_IN_PROCESS_DELAY_MS` (60 seconds). Longer
  delays fail fast instead of silently skipping work.
- Transform nodes reuse the same Node `vm`-based sandbox pattern as custom
  actions. They are treated as privileged local automation, not as a hardened
  multi-tenant sandbox.
- Transform workflows are restricted to manual triggers and cannot expose
  webhook-enabled hook resumes.
- Subworkflow cycles are rejected during validation/compile.
- Hook resolution is sanitized to plain JSON values before resuming a run.
- Workflow provider text in the prompt is sanitized before insertion.

## REST API

These are the workflow endpoints that exist today:

- `GET /api/workflows`
- `POST /api/workflows`
- `GET /api/workflows/:id`
- `PUT /api/workflows/:id`
- `DELETE /api/workflows/:id`
- `POST /api/workflows/:id/validate`
- `POST /api/workflows/:id/start`
- `GET /api/workflows/:id/runs`
- `GET /api/workflow-runs/:runId`
- `POST /api/workflow-runs/:runId/cancel`
- `GET /api/workflow-hooks`
- `POST /api/workflow-hooks/:hookId/resolve`

There are currently **no** `/compile`, `/pause`, `/resume`, or `/events`
workflow endpoints.

## Security Model

Workflow execution follows the same trust model as other local Milady runtime
automation features:

- Standard workflow APIs require the regular Milady API token.
- Workflows containing transform nodes additionally require terminal
  authorization before create, update, start, or hook-resume operations.
- Transform workflow validation blocks trigger shapes that would bypass that
  authorization model.
- Hook resume payloads are JSON-sanitized before entering workflow context.

## Prompt Integration

Enabled workflows are exposed to the runtime through the `workflows` provider in
`src/runtime/milady-plugin.ts`. The provider tells the model which workflows
exist and makes it clear that manual workflows are started from the dashboard.
It does not advertise a `RUN_WORKFLOW` action because no such action exists.

## Future Work

Potential future improvements, not implemented in this branch:

- Durable execution for long delays and crash-safe resume
- Richer run inspection and event streaming
- Deeper UI decomposition for the editor/canvas surface
- Safer transform execution isolation than the existing local `vm` model
