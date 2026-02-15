# Fast Mode Implementation Dossier

This dossier is a deep implementation and risk analysis for adding **per-message fast mode** to Milaidy + ElizaOS while preserving autonomous/full mode behavior.

The goal is not just a feature spec. It is an execution blueprint:

- exact control-flow mapping of current behavior
- phase-by-phase implementation with file-level changes
- critical teardown of the prior recommendation
- alternatives, weaknesses, and failure modes
- rollout/rollback, observability, and testing requirements

---

## Document Index

1. `00-critical-assessment-of-prior-recommendation.md`
   - What was right in the previous proposal
   - What is wrong or incomplete after code-level verification
   - Why some assumptions do not hold in production

2. `01-current-system-control-flow.md`
   - End-to-end current control flow (typed chat, voice, cloud proxy, local runtime)
   - Exact branch behavior and data contracts
   - Full file inventory for the fast-mode change surface

3. `02-phase-1-fast-mode-contract-ui.md`
   - Frontend/API contract design for per-message fast mode
   - UI and state architecture for toggles, defaults, and voice behavior

4. `03-phase-2-api-and-cloud-transport.md`
   - Server request handling changes
   - Cloud bridge and stream protocol changes
   - Conversation isolation and room routing corrections

5. `04-phase-3-eliza-message-pipeline-fast-path.md`
   - MessageService and runtime pipeline adaptation plan
   - Which pipeline segments to keep, reduce, or skip
   - Backward compatibility and migration details

6. `05-phase-4-provider-action-evaluator-filter-strategy.md`
   - Provider/action/evaluator filtering options
   - Existing limits of filtering APIs
   - Concrete design for deterministic fast-mode filtering

7. `06-phase-5-model-routing-and-concurrency-safety.md`
   - Per-message model override design
   - LLM mode isolation and race-condition prevention
   - Why global runtime mutation is unsafe

8. `07-phase-6-observability-and-ops.md`
   - Metrics, logs, traces, and event schema for fast mode
   - Operational SLOs and runbook-level diagnostics

9. `08-phase-7-test-strategy-and-verification.md`
   - Unit/integration/e2e/load test matrix
   - Negative tests and failure-injection plan
   - Cloud/local parity verification

10. `09-phase-8-rollout-migration-rollback.md`
    - Feature flags, canaries, and phased rollout
    - Rollback semantics and data safety
    - Deployment sequencing

11. `10-alternatives-decision-record.md`
    - Option-by-option architecture comparison
    - Cost, risk, reversibility, and blast radius
    - Recommended target state and staged plan

12. `11-risk-register.md`
    - Detailed risk register with severity, probability, detection, mitigation
    - Cross-phase dependency risks

13. `12-file-by-file-change-spec.md`
    - File-by-file implementation requirements and verification checkpoints
    - Explicit mapping of control-flow roles to planned edits

14. `13-detailed-control-flow-walkthroughs.md`
    - Branch-level execution walkthroughs for local, cloud, and voice paths
    - Failure points and fast-mode hook points at each stage

15. `14-phase-execution-backlog.md`
    - Actionable task backlog with dependencies and rollout gates
    - Cross-phase blockers and unresolved decision points

---

## Grounding Scope

This dossier is based on direct code-path inspection across:

- Milaidy frontend:
  - `apps/app/src/components/ChatView.tsx`
  - `apps/app/src/hooks/useVoiceChat.ts`
  - `apps/app/src/AppContext.tsx`
  - `apps/app/src/api-client.ts`
- Milaidy API and cloud bridge:
  - `src/api/server.ts`
  - `src/cloud/cloud-proxy.ts`
  - `src/cloud/bridge-client.ts`
  - `deploy/cloud-agent-entrypoint.ts`
- Milaidy runtime bootstrapping:
  - `src/runtime/eliza.ts`
  - `src/runtime/milaidy-plugin.ts`
  - `src/providers/workspace-provider.ts`
- Eliza core runtime and message pipeline:
  - `eliza/packages/typescript/src/services/message.ts`
  - `eliza/packages/typescript/src/runtime.ts`
  - `eliza/packages/typescript/src/services/action-filter.ts`
  - `eliza/packages/typescript/src/types/message-service.ts`
  - `eliza/packages/typescript/src/types/components.ts`
  - `eliza/packages/typescript/src/types/model.ts`
  - `eliza/packages/typescript/src/autonomy/service.ts`
  - `eliza/packages/typescript/src/request-context.ts`

---

## Executive Recommendation (High Level)

After validating real control flow and runtime constraints, the recommended implementation is:

1. **Stage A (safe, quick):** add end-to-end `fastMode` request contract and carry it through Milaidy local + cloud paths.
2. **Stage B (core correctness):** add first-class per-message processing controls in Eliza MessageService and runtime (not runtime-global mutation).
3. **Stage C (optimization):** introduce deterministic provider/action/evaluator fast profiles.
4. **Stage D (production hardening):** add observability, test gating, and canary rollout.

The details, caveats, and critical weaknesses of alternative paths are documented in the files below.

