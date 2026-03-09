# Workflow Builder Integration — Design Document

## Overview

This document describes the current visual workflow/node builder implementation in Milady. The builder allows users to visually compose multi-step agent workflows by connecting nodes (actions, conditions, triggers, LLM calls) on a canvas, then compiles those graphs into executable steps that run inside the existing elizaOS agent runtime.

---

## Current Platform Architecture (Summary)

### Runtime
- **elizaOS `AgentRuntime`** — the core agent loop that processes messages, evaluates actions, calls providers, and manages state
- **Actions** — discrete capabilities (e.g. `REPLY`, `PLAY_EMOTE`, `SEND_MESSAGE`, custom actions) registered on the runtime via `runtime.registerAction()`
- **Providers** — inject context into the LLM prompt (workspace info, session keys, custom action list, emote catalog)
- **Triggers** — time-based task scheduling (`interval`, `once`, `cron`) that dispatches instructions into the autonomy service
- **Custom Actions** — user-defined HTTP/Shell/Code actions stored in `milady.json`, hot-registered at runtime, executed with parameter substitution and security sandboxing
- **Autonomy Service** — handles autonomous agent operation, instruction injection, and wake modes (`inject_now`, `next_autonomy_cycle`)

### UI
- React app (Vite) with tab-based navigation
- Tabs organized in groups: Chat, Character, Wallets, Knowledge, Social, Settings, Advanced
- Advanced sub-tabs: Plugins, Skills, Actions, Triggers, Fine-Tuning, Trajectories, Runtime, Database, Lifo, Logs, Security
- Component pattern: `*View.tsx` for full pages, `*Panel.tsx` for sidebars, `*Editor.tsx` for modals
- API client in `api-client.ts` wraps all REST calls

### Custom Actions System
- Types: `CustomActionDef` (id, name, description, similes, parameters, handler, enabled)
- Handlers: `http` (URL + method + headers + body template), `shell` (command), `code` (sandboxed JS)
- API: CRUD at `/api/custom-actions`, AI generation at `/api/custom-actions/generate`, testing at `/api/custom-actions/{id}/test`
- Runtime: `loadCustomActions()` converts defs to elizaOS `Action[]`, `registerCustomActionLive()` hot-registers

---

## Current Execution Model

The current implementation executes compiled workflow steps in-process and persists run state/events for monitoring and recovery:

- Sequential step execution from compiled node graph
- Delay node support in runtime execution
- Hook pause/resume via `/api/workflow-hooks/:hookId/resolve`
- Per-step event recording in run history

### Why It Fits Milady

| Milady Need | Current Workflow Runtime Solution |
|---|---|
| Multi-step agent tasks (post to X → wait for reply → respond) | Compiled step execution with persisted run history |
| Scheduled + delayed operations (triggers with waits) | Delay node support in runtime |
| Human-in-the-loop approvals | Hook pause/resume endpoints |
| Observability of agent actions | Per-step run event log |
| Custom action chaining | Steps that call existing `CustomActionDef` handlers |

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Milady App (React)                        │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Custom       │  │ Triggers     │  │ Workflow Builder   │ │
│  │ Actions View │  │ View         │  │ (Custom Canvas +  │ │
│  │              │  │              │  │  Node Editor)      │ │
│  └──────────────┘  └──────────────┘  └───────────────────┘ │
│                                                             │
│                    ┌──────────────────┐                     │
│                    │  api-client.ts   │                     │
│                    └────────┬─────────┘                     │
└─────────────────────────────┼───────────────────────────────┘
                              │ REST API
┌─────────────────────────────┼───────────────────────────────┐
│                    Server (src/api/server.ts)                │
│                              │                              │
│  ┌───────────────────────────▼──────────────────────────┐   │
│  │  /api/workflows/*                                     │   │
│  │    - CRUD workflow definitions                        │   │
│  │    - Start/cancel runs                                │   │
│  │    - Run status + event log                           │   │
│  └───────────────────────────┬──────────────────────────┘   │
│                              │                              │
│  ┌───────────────────────────▼──────────────────────────┐   │
│  │  Workflow Compiler (src/workflows/compiler.ts)        │   │
│  │    - Graph JSON → workflow runtime function             │   │
│  │    - Node type → step function mapping                 │   │
│  │    - Edge routing → control flow                       │   │
│  └───────────────────────────┬──────────────────────────┘   │
│                              │                              │
│  ┌───────────────────────────▼──────────────────────────┐   │
│  │  Workflow Runtime (src/workflows/runtime.ts)          │   │
│  │    - workflow runtime integration                       │   │
│  │    - start() / sleep() / hooks                         │   │
│  │    - Bridges to elizaOS runtime for action execution   │   │
│  └───────────────────────────┬──────────────────────────┘   │
│                              │                              │
│  ┌───────────────────────────▼──────────────────────────┐   │
│  │  elizaOS AgentRuntime                                 │   │
│  │    - Registered actions (custom + built-in)            │   │
│  │    - Providers (context injection)                     │   │
│  │    - Autonomy service                                  │   │
│  │    - Task system (triggers)                            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model

### WorkflowDefinition (stored in `milady.json` alongside `customActions`)

```typescript
// src/contracts/config.ts (additions)

export type WorkflowNodeType =
  | "trigger"        // Entry point: cron, webhook, manual, event
  | "action"         // Execute a registered action (custom or built-in)
  | "llm"            // LLM generation call
  | "condition"      // Branch based on expression
  | "transform"      // JavaScript data transformation (sandboxed)
  | "delay"          // Sleep / wait (maps to workflow runtime sleep())
  | "hook"           // Pause for external event (maps to createHook/createWebhook)
  | "loop"           // Iterate over array data
  | "subworkflow"    // Call another workflow
  | "output"         // Terminal node — final result

export type WorkflowNodePosition = { x: number; y: number };

export type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  label: string;
  position: WorkflowNodePosition;
  config: Record<string, unknown>;
  // Type-specific config examples:
  // trigger:   { triggerType: "cron", cronExpression: "0 9 * * *" }
  // action:    { actionId: "custom-action-uuid" | actionName: "SEND_MESSAGE", parameters: {...} }
  // llm:       { prompt: "...", model?: "...", temperature?: 0.7 }
  // condition: { expression: "{{result.status}} === 200" }
  // transform: { code: "return { filtered: params.items.filter(i => i.active) }" }
  // delay:     { duration: "5m" | date: "2025-01-01T00:00:00Z" }
  // hook:      { hookId: "approval-gate", webhookEnabled: true }
  // loop:      { itemsExpression: "{{data.users}}", variableName: "user" }
  // subworkflow: { workflowId: "uuid" }
  // output:    { outputExpression: "{{lastResult}}" }
};

export type WorkflowEdge = {
  id: string;
  source: string;        // source node id
  target: string;        // target node id
  sourceHandle?: string; // e.g. "true" | "false" for condition nodes
  label?: string;
};

export type WorkflowDef = {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  enabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

// MiladyConfig addition:
// workflows?: WorkflowDef[];
```

### WorkflowRun (runtime state, stored in DB via elizaOS task system)

```typescript
// src/workflows/types.ts

export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "paused"      // waiting on hook/webhook
  | "sleeping"    // in a delay step
  | "completed"
  | "failed"
  | "cancelled";

export type WorkflowStepEvent = {
  stepId: string;
  nodeId: string;
  nodeLabel: string;
  status: "started" | "completed" | "failed" | "retrying";
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  attempt: number;
};

export type WorkflowRun = {
  runId: string;
  workflowId: string;
  workflowName: string;
  status: WorkflowRunStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  currentNodeId?: string;
  events: WorkflowStepEvent[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
};
```

---

## Node Types — Detailed Mapping to Runtime

### 1. Trigger Node (entry point)
The trigger node defines how a workflow starts. It maps to the existing trigger system:

```typescript
// Compiles to: the workflow is started via the trigger system
// trigger.type === "cron" → creates a TriggerConfig that calls start(workflowFn, input)
// trigger.type === "webhook" → creates a webhook endpoint that calls start()
// trigger.type === "manual" → start() called from UI button
// trigger.type === "event" → listens for agent events (message received, etc.)
```

### 2. Action Node
Executes an existing registered action (custom action or built-in):

```typescript
// Compiles to a workflow runtime step:
async function executeAction_nodeId(input: StepInput) {
  "compiled step";
  const action = runtime.getAction(config.actionName);
  const result = await action.handler(runtime, message, state, {
    parameters: resolveParameters(config.parameters, input)
  });
  return result;
}
```

### 3. LLM Node
Makes an LLM generation call through the runtime's model provider:

```typescript
async function llmGenerate_nodeId(input: StepInput) {
  "compiled step";
  const prompt = interpolateTemplate(config.prompt, input);
  const result = await runtime.useModel(ModelType.TEXT_LARGE, {
    prompt,
    temperature: config.temperature ?? 0.7,
  });
  return { text: result };
}
```

### 4. Condition Node
Branches the workflow based on an expression. Has multiple output handles ("true"/"false" or named branches):

```typescript
// Not a step (no side effects) — evaluated inline in the workflow
function evaluateCondition_nodeId(input: StepInput): string {
  const value = resolveExpression(config.expression, input);
  return value ? "true" : "false"; // determines which edge to follow
}
```

### 5. Transform Node
Sandboxed JavaScript data transformation (reuses the existing `runCodeHandler` sandbox from custom actions):

```typescript
async function transform_nodeId(input: StepInput) {
  "compiled step";
  const result = await runCodeHandler(config.code, input);
  return result;
}
```

### 6. Delay Node
Maps directly to workflow runtime's `sleep()`:

```typescript
// Compiles to inline workflow code:
await sleep(config.duration); // e.g. "5 minutes", "2 hours", "7 days"
// or
await sleep(new Date(config.date));
```

### 7. Hook Node
Maps to workflow runtime's `createHook()` / `createWebhook()`:

```typescript
// Compiles to:
const [payload, resolveHook] = await createHook(config.hookId);
// Workflow pauses here until resumeHook(config.hookId, payload) is called
// The UI shows a "waiting for approval" state
```

### 8. Loop Node
Iterates over data, executing the connected subgraph for each item:

```typescript
// Compiles to:
const items = resolveExpression(config.itemsExpression, input);
const results = [];
for (const item of items) {
  const stepResult = await executeSubgraph(connectedNodes, { ...input, [config.variableName]: item });
  results.push(stepResult);
}
```

### 9. Subworkflow Node
Calls another workflow definition:

```typescript
async function subworkflow_nodeId(input: StepInput) {
  "compiled step";
  const subWorkflow = loadWorkflow(config.workflowId);
  const run = await start(subWorkflow.compiled, input);
  return run.output;
}
```

---

## Graph Compiler

The compiler converts the visual graph (nodes + edges) into a workflow runtime function. The key algorithm:

```typescript
// src/workflows/compiler.ts

export function compileWorkflow(def: WorkflowDef): CompiledWorkflow {
  // 1. Validate the graph
  //    - Exactly one trigger node
  //    - All edges connect to valid nodes
  //    - No unreachable nodes
  //    - Condition nodes have edges for all handles
  //    - No infinite loops without delay/hook nodes (optional warning)

  // 2. Topological sort from trigger node
  //    - Build adjacency list from edges
  //    - Handle condition branching (multiple outgoing edges with handles)
  //    - Handle loop nodes (back-edges)

  // 3. Generate the workflow function
  //    The output is an async function with "compiled workflow" directive that:
  //    a. Calls each node's step function in topological order
  //    b. Passes output from one step as input to the next (via edge connections)
  //    c. At condition nodes, evaluates the expression and follows the matching edge
  //    d. At delay nodes, calls sleep()
  //    e. At hook nodes, calls createHook() and waits
  //    f. At loop nodes, iterates and executes the subgraph

  // 4. Return the compiled function + metadata
  return {
    fn: compiledWorkflowFunction,
    stepCount: nodes.length - 1, // exclude trigger
    hasDelays: nodes.some(n => n.type === "delay"),
    hasHooks: nodes.some(n => n.type === "hook"),
    hasLoops: nodes.some(n => n.type === "loop"),
  };
}
```

### Data Flow Between Nodes

Each node receives the accumulated context from all upstream nodes:

```typescript
type WorkflowContext = {
  trigger: Record<string, unknown>;     // trigger input data
  [nodeId: string]: unknown;            // each node's output keyed by node id
  _last: unknown;                       // shorthand for most recent node output
};
```

Template interpolation uses `{{nodeId.field}}` or `{{_last.field}}` syntax, consistent with the existing `{{paramName}}` pattern in custom actions.

---

## API Endpoints

```
# Workflow definitions (CRUD)
GET    /api/workflows                    → list all workflow definitions
POST   /api/workflows                    → create workflow definition
GET    /api/workflows/:id                → get workflow definition
PUT    /api/workflows/:id                → update workflow definition
DELETE /api/workflows/:id                → delete workflow definition
POST   /api/workflows/:id/validate       → validate graph (check for errors)
# Workflow runs (execution)
POST   /api/workflows/:id/start          → start a new run (manual trigger)
GET    /api/workflows/:id/runs            → list runs for a workflow
GET    /api/workflow-runs/:runId          → get run status + events
POST   /api/workflow-runs/:runId/cancel   → cancel a running workflow

# Hook resolution
POST   /api/workflow-hooks/:hookId/resolve → resume workflow waiting on hook
GET    /api/workflow-hooks                → list pending hooks
```

---

## UI Components

### 1. WorkflowBuilderView (`apps/app/src/components/WorkflowBuilderView.tsx`)

Full-page workflow editor using the in-repo custom workflow canvas:

- **Left sidebar**: Node palette (draggable node types)
- **Center**: Custom SVG canvas with node and edge interactions
- **Right sidebar**: Node configuration panel (appears when a node is selected)
- **Top bar**: Workflow name, save/validate/run buttons, run history dropdown
- **Bottom bar**: Validation messages, compile status

### 2. Custom Node Components

Each node type gets a custom node component with appropriate ports:

```
┌─────────────────┐
│ ⏰ Cron Trigger  │  ── 1 output handle
│ Every day 9am   │
└────────┬────────┘
         │
┌────────▼────────┐
│ 🔧 Action       │  ── 1 input, 1 output handle
│ CHECK_PRICES    │
└────────┬────────┘
         │
┌────────▼────────┐
│ ❓ Condition     │  ── 1 input, 2 output handles (true/false)
│ price > 100     │
└───┬─────────┬───┘
    │ true    │ false
┌───▼───┐  ┌──▼──┐
│ Action │  │ End │
│ ALERT  │  │     │
└────────┘  └─────┘
```

### 3. WorkflowRunsView (`apps/app/src/components/WorkflowRunsView.tsx`)

Run monitoring dashboard:
- List of workflow runs with status badges
- Click into a run to see the event log
- Visual step-by-step progress on the graph (nodes light up green/red/yellow)
- Hook resolution UI: when a workflow is paused on a hook, show a "Resolve" button with payload input

### 4. Integration Points with Existing UI

- **Navigation**: Add `"workflows"` tab to the Advanced group alongside Actions and Triggers
- **Custom Actions Panel**: Add "Use in Workflow" button that opens the builder with the action pre-placed
- **Triggers View**: Add "Convert to Workflow" option that creates a workflow with the trigger as entry point
- **Chat**: When a workflow run completes/fails, optionally inject a message into the agent's conversation

---

## Implementation Phases

### Phase 1: Foundation (Core)

**Files to create:**
```
src/workflows/
  types.ts              — WorkflowDef, WorkflowRun, WorkflowStepEvent types
  compiler.ts           — Graph → executable function compiler
  runtime.ts            — workflow runtime integration + elizaOS bridge
  storage.ts            — Config persistence (milady.json) + run state (DB)
  validation.ts         — Graph validation rules
```

**Files to modify:**
```
src/contracts/config.ts — Add WorkflowDef, WorkflowNode, WorkflowEdge types
src/config/types.milady.ts — Add workflows?: WorkflowDef[] to MiladyConfig
src/api/server.ts       — Add /api/workflows/* endpoints
src/runtime/milady-plugin.ts — Register workflow runtime + provider
package.json            — Add workflow dependency
```

**Key tasks:**
1. Add `workflow` package as dependency
2. Define TypeScript types for workflow graph model
3. Implement graph validation (cycle detection, handle matching, reachability)
4. Implement the compiler that traverses the graph and generates step functions
5. Bridge workflow runtime's `start()` / `sleep()` / `createHook()` with elizaOS runtime
6. Wire steps to call existing `buildHandler()` from custom-actions for action nodes
7. Store workflow definitions in milady.json under `workflows[]`
8. Store workflow runs in the elizaOS task system (like triggers do)
9. REST API endpoints for CRUD + execution

### Phase 2: Visual Builder (UI)

**Files to create:**
```
apps/app/src/components/
  WorkflowBuilderView.tsx     — Main workflow editor page
  WorkflowRunsView.tsx        — Run monitoring page
  workflow/
    NodePalette.tsx           — Draggable node type list
    NodeConfigPanel.tsx       — Right sidebar config editor
    nodes/
      TriggerNode.tsx         — Custom workflow node
      ActionNode.tsx
      LlmNode.tsx
      ConditionNode.tsx
      TransformNode.tsx
      DelayNode.tsx
      HookNode.tsx
      LoopNode.tsx
      OutputNode.tsx
```

**Files to modify:**
```
apps/app/src/navigation.ts          — Add "workflows" tab
apps/app/src/components/AdvancedPageView.tsx — Add workflows sub-tab
apps/app/src/api-client.ts          — Add workflow API methods
apps/app/package.json               — No additional canvas dependency required
```

**Key tasks:**
1. Use the existing in-repo workflow canvas implementation
2. Build custom node components with appropriate input/output handles
3. Build node configuration panel (reuse patterns from CustomActionEditor)
4. Build the node palette with drag-and-drop onto canvas
5. Implement save/load workflow graph to/from API
6. Real-time validation feedback as user builds the graph
7. "Test Run" button that starts a workflow and shows live progress
8. Run history view with event log and graph visualization

### Phase 3: Deep Runtime Integration

1. **Action node auto-discovery**: Populate action node dropdown from `runtime.getActions()` including custom actions
2. **Trigger unification**: Allow existing triggers to start workflows instead of raw instruction injection
3. **Workflow as Action**: Register workflows as elizaOS Actions so the agent can trigger them from conversation (e.g., "run the price check workflow")
4. **Streaming results**: Expose workflow run events to the UI via server-managed streaming/polling endpoints (no `getWritable()` runtime API)
5. **AI workflow generation**: Extend the existing `/api/custom-actions/generate` pattern — user describes a workflow in natural language, AI generates the graph JSON

### Phase 4: Advanced Features

1. **Subworkflows**: Allow workflows to call other workflows
2. **Parallel branches**: Fork/join pattern for concurrent step execution
3. **Error recovery UI**: When a step fails, show the error in the graph and let users retry from that point
4. **Workflow templates**: Pre-built templates (social media posting pipeline, monitoring + alerting, data enrichment)
5. **Version history**: Track workflow definition changes with diffing
6. **Import/Export**: JSON export (like custom actions) for sharing workflows

---

## How It Connects to Existing Systems

### Custom Actions → Workflow Steps
Every `CustomActionDef` is automatically available as an Action node in the workflow builder. The compiler generates step functions that call the same `buildHandler()` used by the custom actions runtime.

### Triggers → Workflow Entry Points
The existing trigger types (`interval`, `once`, `cron`) become configuration options for the Trigger node. The compiler generates a trigger registration that uses the same `registerTriggerTaskWorker` infrastructure.

### Autonomy Service → Workflow Dispatch
Workflows can be triggered from the autonomy loop. The autonomy service's `injectAutonomousInstruction()` can start a workflow run, and workflow hook nodes can inject messages back into the agent conversation.

### Security Model
- **Transform/Code nodes**: Reuse the existing `runCodeHandler()` sandbox from custom actions (node:vm with null-prototype context, 30s timeout)
- **HTTP action nodes**: Reuse SSRF protection from custom actions (`resolveUrlSafety`, DNS resolution, IP blocking)
- **Shell action nodes**: Reuse `MILADY_TERMINAL_RUN_TOKEN` gate
- **Workflow definitions**: Stored in `milady.json` — same trust model as custom actions (local owner authored)

---

## Key Design Decisions

### Why a custom canvas implementation?
- Keeps the workflow editor implementation self-contained
- Avoids introducing an additional graph UI dependency
- Matches existing Milady UI interaction patterns

### Why compile graphs before execution?
- Compilation validates workflow structure before runtime execution
- Compiled steps are easier to test and reason about
- Runtime execution stays deterministic and debuggable

### Why compile graphs instead of interpreting them?
- Compiled functions are inspectable and debuggable
- Compilation step catches errors before execution
- Generated code can be audited for security

### Why store definitions in milady.json?
- Consistent with custom actions storage pattern
- No additional database schema needed
- Portable — copy config file to transfer workflows
- Hot-reloadable — same pattern as custom action live registration

---

## Example: "Daily Price Alert" Workflow

**Visual graph:**
```
[Cron Trigger: 0 9 * * *]
        │
[Action: FETCH_CRYPTO_PRICE (params: {coin: "BTC"})]
        │
[Condition: {{_last.output}} contains "above 100000"]
    ├── true ──→ [Action: SEND_MESSAGE (params: {text: "BTC above 100k!"})]
    │                      │
    │               [Output: "Alert sent"]
    │
    └── false ─→ [Output: "Price normal, no alert"]
```

**Compiled workflow (what Milady runtime executes):**
```typescript
async function dailyPriceAlert(input: { triggeredAt: string }) {
  // Step 1: Fetch price
  const priceResult = await fetchCryptoPrice({ coin: "BTC" });

  // Step 2: Evaluate condition
  if (priceResult.output.includes("above 100000")) {
    // Step 3a: Send alert
    await sendMessage({ text: "BTC above 100k!" });
    return { result: "Alert sent" };
  }

  return { result: "Price normal, no alert" };
}

async function fetchCryptoPrice(params: { coin: string }) {
  // Calls the registered FETCH_CRYPTO_PRICE custom action
  const handler = runtime.getAction("FETCH_CRYPTO_PRICE");
  return handler.handler(runtime, message, state, { parameters: params });
}

async function sendMessage(params: { text: string }) {
  const handler = runtime.getAction("SEND_MESSAGE");
  return handler.handler(runtime, message, state, { parameters: params });
}
```

---

## Dependencies

```json
{
  "dependencies": {},
  "devDependencies": {}
}

// apps/app/package.json
{
  "dependencies": {}
}
```

---

## File Tree (Final State)

```
src/workflows/
  types.ts              — Core type definitions
  compiler.ts           — Graph → executable step compiler
  compiler.test.ts      — Compiler unit tests
  runtime.ts            — Workflow execution engine + elizaOS bridge
  runtime.test.ts       — Runtime unit tests
  storage.ts            — Persistence layer
  validation.ts         — Graph validation
  validation.test.ts    — Validation tests

apps/app/src/components/
  WorkflowBuilderView.tsx
  WorkflowRunsView.tsx
  workflow/
    NodePalette.tsx
    NodeConfigPanel.tsx
    WorkflowCanvas.tsx
    nodes/
      TriggerNode.tsx
      ActionNode.tsx
      LlmNode.tsx
      ConditionNode.tsx
      TransformNode.tsx
      DelayNode.tsx
      HookNode.tsx
      LoopNode.tsx
      OutputNode.tsx
      SubworkflowNode.tsx
      shared.tsx          — Common node styles/handles
```
