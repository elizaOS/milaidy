# Autonomous Loop Implementation Dossier

This folder contains a detailed implementation dossier for making Milady "autonomy-first":

- real-time visibility into autonomous reasoning/actions
- clear admin identity and trust semantics
- controlled context blending between admin chat and autonomous loop
- explicit rolodex trust behavior for owner/admin inputs

## Document Index

1. `00-critical-assessment.md`
   - Critical review of the initial high-level phase plan
   - What was wrong, underspecified, or risky
   - Corrected design constraints

2. `01-system-control-flow-map.md`
   - End-to-end control flow map of current Milady
   - Runtime, API server, websocket, frontend, onboarding, conversations
   - Current architecture boundaries and coupling points

3. `02-phase-1-realtime-event-streaming.md`
   - Server event-streaming architecture
   - WebSocket event schema, buffering, replay, ordering, backpressure
   - Bridging `AgentEventService` into Milady API

4. `03-phase-2-autonomous-state-provider.md`
   - Autonomous provider design
   - Context budget controls, summarization strategy, privacy boundaries
   - Fallback behavior and failure modes

5. `04-phase-3-admin-identity-and-trust.md`
   - Admin identity model (owner/admin/member) in Milady
   - Ownership/roles world metadata migration strategy
   - Role assignment lifecycle from onboarding to runtime

6. `05-phase-4-frontend-event-ingestion.md`
   - Frontend websocket event pipeline
   - AppContext event store design
   - Reconnection/resync and dedupe logic

7. `06-phase-5-autonomous-sidebar-ui.md`
   - Autonomous loop panel IA and UI architecture
   - Components, states, rendering policy, performance controls
   - Interaction model (filters, collapse, pause, inspect details)

8. `07-phase-6-layout-and-information-architecture.md`
   - Chat + autonomy panel layout redesign
   - Width strategy, responsive behavior, collapse modes
   - Accessibility and density tradeoffs

9. `08-phase-7-context-bridging-admin-autonomy.md`
   - How admin-chat context enters autonomy safely
   - Anti-context-bloat mechanisms
   - Deterministic provider ordering and truncation

10. `09-phase-8-rolodex-admin-trust-contract.md`
    - Role-aware trust policy for rolodex claims
    - "Admin says this is my handle" acceptance model
    - Verification fallback for non-admin actors

11. `10-alternatives-risk-register-rollout.md`
    - Multiple implementation options per phase
    - Comprehensive risk register + mitigations
    - Rollout strategy, observability, test plan, migration sequencing

## Scope and Grounding

This dossier is grounded in direct code-path analysis across:

- Milady runtime: `src/runtime/eliza.ts`
- Milady API server: `src/api/server.ts`
- Milady frontend: `apps/app/src/api-client.ts`, `apps/app/src/AppContext.tsx`, `apps/app/src/App.tsx`, `apps/app/src/components/*`
- Eliza core event/autonomy internals:
  - `eliza/packages/typescript/src/services/agentEvent.ts`
  - `eliza/packages/typescript/src/types/agentEvent.ts`
  - `eliza/packages/typescript/src/autonomy/service.ts`
  - `eliza/packages/typescript/src/services/message.ts`
- Legacy reference patterns from Hyperscape dashboard components (poll-based thought/log UIs)

## Important Note on "eliza-old"

The local `eliza-old` clone is currently incomplete/in-progress, and the original `elizaOS/eliza-old` remote no longer exists. Legacy UI references in this dossier therefore use:

- directly verified code from `hyperscape` (which contains the old-style thought/log panels), and
- direct inspection of current Eliza core event/autonomy internals.

Where uncertainty remains, it is called out explicitly in each phase doc.

