# Phase 3: Admin Identity and Trust Model

Goal: make "you are the admin/owner" explicit, durable, and role-aware across chat and autonomy.

## Current state and gap

Current Milady behavior:

- sets `world.metadata.ownership.ownerId` for web/cli chat worlds
- does not consistently populate `world.metadata.roles`
- uses in-memory random `chatUserId` in API server

This supports onboarding settings lookup, but does not provide durable admin semantics for trust policies.

## Requirements

1. Durable admin identity per agent deployment.
2. Explicit role hierarchy in world metadata (`OWNER`, `ADMIN`, `NONE`).
3. Stable mapping between transport identity and entity identity.
4. Role checks available at action/provider time, not only setup time.

## Files in scope

- `src/api/server.ts`
- `src/runtime/eliza.ts`
- config model files under `src/config/` if persistent admin id is added

Core semantics reference:

- `eliza/packages/typescript/src/roles.ts`
- role provider behavior in core providers

## Proposed identity model

## 1) Persisted admin entity id

Add config field (example):

- `agents.defaults.adminEntityId`

This is created once and reused across restarts.

## 2) Role metadata initialization

When ensuring world ownership:

- set `world.metadata.ownership.ownerId = adminEntityId`
- set `world.metadata.roles[adminEntityId] = "OWNER"`

If role map absent, initialize map.

## 3) Admin room association

Define canonical admin room metadata:

- `room.metadata.adminControl = true`

This helps select source context for autonomy provider and trust policy.

## Migration strategy (existing installs)

At runtime/API startup:

1. discover worlds tied to current chat contexts
2. if only ownership exists:
   - create roles map
   - assign owner role to ownership ownerId
3. if ownership owner differs from persisted adminEntityId:
   - record warning + do not auto-overwrite blindly
   - require deterministic reconciliation rule (latest setup vs explicit lock)

## Trust policy contract

Role-aware trust levels:

1. OWNER
   - may assert identity claims directly ("this is my twitter")
   - claim accepted with audit tag `trusted_owner_claim`
2. ADMIN
   - can assert operational claims; optional confirmation for sensitive identity changes
3. NONE
   - requires verification workflow

## Security concerns

1. **Session spoof risk**
   - if transport auth is weak, role trust is unsafe.
   - mitigation: tie role identity to authenticated pairing/session token.

2. **Role drift**
   - stale cached role data can produce wrong trust path.
   - mitigation: read role from world metadata per action execution.

3. **Owner takeover during migration**
   - migration must be conservative and auditable.

## Alternative implementation patterns

## Option A: world metadata only (recommended)

Pros:

- aligns with existing core role/settings providers
- minimal conceptual expansion

Cons:

- needs careful consistency across multiple worlds

## Option B: separate admin table/document

Pros:

- cleaner dedicated schema

Cons:

- duplicates source of truth vs world metadata
- extra synchronization complexity

## Option C: session-only admin role

Pros:

- simple

Cons:

- non-durable and unsafe for long-lived autonomy

Recommendation: Option A with persisted adminEntityId pointer.

## Testing requirements

1. onboarding creates owner role mapping
2. restart preserves same admin entity
3. role-based checks work in:
   - admin chat actions
   - autonomous provider context gathering
4. migration upgrades ownership-only worlds to ownership+roles

## Done criteria

1. Admin identity is deterministic and durable.
2. Roles are available and populated in world metadata.
3. Owner/admin trust policy can be enforced by downstream phases.

