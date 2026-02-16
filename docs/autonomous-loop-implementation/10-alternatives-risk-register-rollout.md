# Alternatives, Risk Register, Rollout, and File-Level Execution Plan

This document provides:

1. per-phase implementation alternatives
2. integrated risk register
3. file-by-file execution sequencing
4. rollout and verification plan

## A. File-Level Execution Plan (Concrete)

## Phase 1: Event backbone

Files:

- `src/api/server.ts`
  - add event buffer state
  - add event broadcast helper
  - subscribe to agent event service and heartbeat stream
  - add replay route
  - include cleanup of event subscriptions on close
- `apps/app/src/api-client.ts`
  - add event type definitions
  - add replay fetch method
  - add websocket handlers for new event types
- `apps/app/src/AppContext.tsx`
  - add event store, dedupe, replay merge logic
  - add selectors

## Phase 2: Autonomous provider

Files:

- `src/providers/` (new provider module recommended)
- `src/runtime/eliza.ts`
  - register provider plugin or include provider in bridge plugin stack

Optional:

- `src/api/server.ts`
  - helper endpoints or hooks for diagnostics only

## Phase 3: Admin identity and roles

Files:

- `src/api/server.ts`
  - admin entity bootstrap in onboarding/room ensure paths
  - role map initialization/reconciliation
- `src/runtime/eliza.ts`
  - ensure cli path uses same role model
- `src/config/*`
  - optional persisted admin id field and validation

## Phase 4: Frontend ingestion hardening

Files:

- `apps/app/src/api-client.ts`
- `apps/app/src/AppContext.tsx`
- optional app-local event types module

## Phase 5: Autonomy panel UI

Files:

- `apps/app/src/components/AutonomousPanel.tsx` (new)
- `apps/app/src/components/WidgetSidebar.tsx` (extract goals/tasks subcomponent)
- `apps/app/src/AppContext.tsx` (selectors used by panel)

## Phase 6: Layout refactor

Files:

- `apps/app/src/App.tsx`
  - swap right sidebar component and width model

## Phase 7: Context bridge policy

Files:

- same provider module from Phase 2
- `src/api/server.ts` and/or runtime helper path for canonical admin room discovery

## Phase 8: Rolodex trust contract

Files (short-term Milady wrapper):

- `src/api/server.ts` message/action handling points where claims are interpreted

Files (long-term plugin-native):

- rolodex plugin package source (outside current milady repo if external dependency)

## B. Alternatives Matrix by Phase

## Phase 1 alternatives

1. websocket + replay endpoint (**recommended**)
2. SSE stream only
3. polling snapshots

Decision rationale:

- existing websocket infra already present and used
- replay endpoint solves reconnect gaps

## Phase 2 alternatives

1. provider-only dynamic summary (**recommended first**)
2. cached bridge memory records
3. hybrid cached+dynamic

Decision rationale:

- fastest safe path with bounded complexity

## Phase 3 alternatives

1. world metadata roles + persisted admin pointer (**recommended**)
2. separate admin registry table
3. session-only role model

Decision rationale:

- aligns with core role/settings providers and ownership semantics

## Phase 4 alternatives

1. normalized AppContext store (**recommended**)
2. raw array store
3. external state library migration

Decision rationale:

- balanced reliability and change scope

## Phase 5 alternatives

1. multi-section autonomy panel (**recommended**)
2. merged chronological feed
3. admin-tab-only viewer

Decision rationale:

- supports real-time operator workflows

## Phase 6 alternatives

1. right-panel in chat shell (**recommended**)
2. separate admin page only
3. floating overlay always

Decision rationale:

- best balance of observability and usability

## Phase 7 alternatives

1. deterministic provider bridge with strict caps (**recommended**)
2. full-history injection
3. manual trigger only

Decision rationale:

- prevents context bloat and retains continuity

## Phase 8 alternatives

1. Milady-side trust wrapper then plugin-native migration (**recommended**)
2. plugin-only immediate change
3. no privileged trust path

Decision rationale:

- staged delivery with lower coordination risk

## C. Integrated Risk Register

Severity scale:

- Critical: data/security/correctness failure with major impact
- High: major functionality degradation
- Medium: noticeable quality issue
- Low: minor issue

## R1: Event schema instability

- severity: High
- phase: 1,4,5
- risk: backend/frontend drift causes parsing failures
- mitigation:
  - add `version`
  - strict parser and compatibility branch
  - schema tests

## R2: Missing replay leading to silent gaps

- severity: High
- phase: 1,4
- risk: reconnect drops events and misrepresents autonomy
- mitigation:
  - replay endpoint
  - gap detection in client
  - "partial history" UI markers

## R3: Payload sensitivity leakage

- severity: Critical
- phase: 1,5
- risk: sensitive tool/provider data shown in UI
- mitigation:
  - server-side redaction
  - configurable verbosity levels
  - event field denylist

## R4: Admin identity instability across restart

- severity: High
- phase: 3,8
- risk: role trust applied to wrong entity
- mitigation:
  - persisted admin entity id
  - startup reconciliation checks
  - fail-safe downgrade on mismatch

## R5: Role metadata absent or stale

- severity: High
- phase: 3,8
- risk: privileged trust incorrectly applied or denied
- mitigation:
  - role map migration
  - per-decision role fetch
  - audit logging

## R6: Context bloat and degraded model behavior

- severity: High
- phase: 2,7
- risk: admin bridge overwhelms prompt budget
- mitigation:
  - strict caps
  - deterministic truncation
  - summary-first strategy

## R7: UI performance degradation under event flood

- severity: Medium/High
- phase: 5
- risk: laggy panel and poor UX
- mitigation:
  - bounded windows
  - memoized selectors
  - batched state updates

## R8: Legacy path divergence (`/api/chat` vs conversations)

- severity: Medium
- phase: 1-3
- risk: inconsistent behavior by endpoint path
- mitigation:
  - unify internals or clearly deprecate one path
  - shared helper for identity/room setup

## R9: External rolodex package mismatch

- severity: Medium
- phase: 8
- risk: plugin contract differs from Milady assumptions
- mitigation:
  - implement short-term wrapper
  - integration tests against actual plugin version

## R10: Migration regression in existing user worlds

- severity: High
- phase: 3
- risk: ownership/roles inconsistency after upgrade
- mitigation:
  - idempotent migration
  - backup + dry-run checks
  - clear log diagnostics

## D. Rollout Strategy

## Stage 0: hidden plumbing

- deliver event stream backend + frontend store behind flags
- keep old UI behavior default

## Stage 1: internal panel

- enable autonomy panel for dev/testing builds
- compare panel output with existing logs and runtime traces

## Stage 2: admin identity migration

- run role/ownership reconciliation
- enable trust contract in observe-only mode (log-only decisions)

## Stage 3: enforce trust policy

- turn on role-based claim handling
- keep emergency disable flag

## Stage 4: bridge context enablement

- enable provider bridge with conservative caps
- monitor token usage and loop quality

## Stage 5: default-on

- enable full stack for all operators
- keep kill-switch flags for rollback

## E. Observability and Diagnostics

Must-add metrics and logs:

1. event throughput/sec by stream
2. websocket client count and reconnect rate
3. replay request volume and average replay size
4. provider bridge chars/tokens and truncation counts
5. trust decision counts by role/category
6. autonomy panel render lag (optional client metric)

## F. Test Plan Summary

## Unit

- event envelope and parser validation
- dedupe/ordering/replay merge
- context bridge summarization and truncation
- trust policy rule evaluation

## Integration

- runtime event emit -> websocket -> frontend render pipeline
- reconnect replay continuity
- role migration and claim acceptance path

## End-to-end

- admin issues directive in chat
- autonomy run reflects directive
- autonomy panel shows thought/action/provider timeline
- owner claim accepted and audited

## G. Sequence Recommendation (Build Order)

1. Phase 1
2. Phase 4
3. Phase 5
4. Phase 6
5. Phase 3
6. Phase 2
7. Phase 7
8. Phase 8

Reason:

- visibility foundation first
- then UX surface
- then identity/trust semantics
- then context blending and role-aware claim logic

## H. Explicit Shortcomings to Track During Implementation

1. `/api/workbench/overview` autonomy state is currently placeholder.
2. two chat APIs create duplicate identity/setup logic.
3. role metadata population is not first-class in current setup.
4. rolodex enablement path is configurable and can be absent.
5. event payload redaction policy is not defined yet.

These are accepted as known constraints and should be tracked as checklist items in implementation PRs.

