# File-by-File Change Specification

## Purpose

This document maps each relevant file to:

- current role in control flow
- planned modifications by phase
- risk and verification requirements

It is intended as the implementation checklist for execution.

---

## Frontend Files

## `apps/app/src/components/ChatView.tsx`

### Current role

- captures typed input and voice transcript
- invokes shared send handler

### Planned changes

- add mode toggle UI and active-state indicator
- include resolved processing options in send calls
- lock mode snapshot per send action

### Risks

- UI mode desync during in-flight request

### Verification

- interaction tests for typed and voice sends with toggle changes

---

## `apps/app/src/AppContext.tsx`

### Current role

- central orchestration for conversations and message send flow

### Planned changes

- extend send signature with processing options
- resolve precedence (message override > conversation default > app default)
- preserve processing metadata in optimistic local message state

### Risks

- mode precedence bugs

### Verification

- unit tests for precedence resolution and conversation state transitions

---

## `apps/app/src/api-client.ts`

### Current role

- API request shape and auth behavior

### Planned changes

- extend conversation message payload with optional `processing`
- maintain backward-compatible omission when undefined

### Risks

- accidental schema breaking for old server versions

### Verification

- integration tests with mock server accepting old/new payloads

---

## API and Cloud Transport Files

## `src/api/server.ts`

### Current role

- request parsing, conversation lookup, cloud/local branch, runtime dispatch

### Planned changes

- parse and validate `processing` object
- normalize mode/profile
- propagate to local runtime and cloud proxy
- ensure room id parity in cloud calls

### Risks

- mode ignored in one branch
- room fallback leakage

### Verification

- route-level tests for local and cloud branch parity

---

## `src/cloud/cloud-proxy.ts`

### Current role

- forwards chat operations to bridge client

### Planned changes

- add `processing` parameter for message and stream methods
- require explicit room forwarding from caller

### Risks

- default room fallback overuse

### Verification

- unit tests for forwarded params shape

---

## `src/cloud/bridge-client.ts`

### Current role

- builds JSON-RPC payloads to cloud bridge endpoint

### Planned changes

- include `processing` object in `params`
- preserve room id and mode in stream/non-stream calls

### Risks

- bridge payload mismatch with cloud handler schema

### Verification

- contract tests against cloud entrypoint parser

---

## `deploy/cloud-agent-entrypoint.ts`

### Current role

- cloud-side request parsing and runtime invocation

### Planned changes

- parse `processing` params
- normalize mode/profile
- pass options into runtime message handling

### Risks

- cloud path diverges from local runtime behavior

### Verification

- cloud e2e parity tests with local path outputs and metrics

---

## Milady Runtime Integration Files

## `src/runtime/eliza.ts`

### Current role

- runtime bootstrap and plugin registration

### Planned changes

- register fast profile defaults/settings source
- wire custom message service only if temporary bridge is required

### Risks

- startup config mismatch between environments

### Verification

- startup diagnostics and profile schema validation tests

---

## `src/runtime/milady-plugin.ts`

### Current role

- Milady-specific plugins, actions, providers, evaluators registration

### Planned changes

- tag/classify Milady actions/providers/evaluators for fast profile policy
- optionally provide fast-profile defaults in plugin config

### Risks

- missing metadata on newly added capabilities

### Verification

- metadata lint checks and profile coverage tests

---

## `src/providers/workspace-provider.ts`

### Current role

- context provider that can add non-trivial overhead depending on implementation

### Planned changes

- ensure excluded by default in fast profile unless explicitly needed
- document latency characteristics and fallback behavior

### Risks

- quality loss if removed without substitute context

### Verification

- A/B response quality checks with provider included vs excluded

---

## Eliza Core Files

## `eliza/packages/typescript/src/types/message-service.ts`

### Current role

- defines message processing options interface

### Planned changes

- add explicit processing mode/profile and policy sub-objects
- maintain optional fields for backward compatibility

### Risks

- API surface churn without usage

### Verification

- type-level tests and runtime option normalization tests

---

## `eliza/packages/typescript/src/services/message.ts`

### Current role

- core message orchestration pipeline

### Planned changes

- resolve processing profile at request start
- pass model size/policies through should-respond, generation, actions, evaluators
- avoid hardcoded large-model assumptions for fast profile

### Risks

- default-mode regression due branching complexity

### Verification

- full pipeline tests for default and fast modes + concurrent mixed-mode tests

---

## `eliza/packages/typescript/src/runtime.ts`

### Current role

- model routing, provider composition, action processing, evaluator execution

### Planned changes

- read request-scoped model routing context in `useModel`
- expose policy-aware helper overloads where needed
- avoid runtime-global mutable mode in per-message path

### Risks

- context propagation gaps

### Verification

- async isolation tests and routing correctness assertions

---

## `eliza/packages/typescript/src/services/action-filter.ts`

### Current role

- relevance filtering for actions/providers with global config

### Planned changes

- optional per-call overrides for fast profile (for example final top-K)
- preserve current defaults when no overrides provided

### Risks

- aggressive filtering increases false negatives

### Verification

- miss-rate tracking and profile-specific tests

---

## `eliza/packages/typescript/src/bootstrap/providers/actions.ts`

### Current role

- formats and validates available actions for prompt context

### Planned changes

- apply deterministic allow-list/policy before dynamic filtering
- support profile-aware action set generation

### Risks

- action list too narrow for valid user intents

### Verification

- prompt/action coverage tests for representative intents

---

## `eliza/packages/typescript/src/bootstrap/providers/evaluators.ts`

### Current role

- builds evaluator context for prompts by validating evaluator set

### Planned changes

- support profile-aware evaluator subset for prompt context

### Risks

- missing evaluators may reduce internal reasoning quality

### Verification

- compare response quality and evaluator usage traces by mode

---

## `eliza/packages/typescript/src/types/components.ts`

### Current role

- shared type definitions for actions/providers/evaluators

### Planned changes

- optional metadata/tag fields for provider/evaluator policy classification

### Risks

- inconsistent metadata adoption

### Verification

- lint rule or startup validation for required metadata under profile mode

---

## `eliza/packages/typescript/src/types/model.ts`

### Current role

- model enums and model-related settings keys

### Planned changes

- no breaking changes required, but may add profile-related mapping constants if needed

### Risks

- configuration sprawl

### Verification

- config documentation tests and runtime diagnostics

---

## `eliza/packages/typescript/src/autonomy/service.ts`

### Current role

- autonomy workflow integration and goal updates

### Planned changes

- verify fast mode does not unintentionally trigger heavy autonomy loops
- possibly gate autonomy updates by mode/profile policy

### Risks

- hidden latency from autonomy side effects in fast mode

### Verification

- autonomy-on/off comparative latency tests in fast profile

---

## Execution Checklist Summary

1. Implement transport contract in frontend + API + cloud bridge.
2. Add message-scoped profile controls in core message pipeline.
3. Add concurrency-safe model routing context.
4. Apply deterministic provider/action/evaluator policies.
5. Instrument, test, and rollout behind flags.

