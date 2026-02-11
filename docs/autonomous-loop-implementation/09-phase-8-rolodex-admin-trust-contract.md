# Phase 8: Rolodex Admin Trust Contract

Goal: define explicit, auditable trust behavior so owner/admin claims are handled correctly in rolodex workflows.

## User intent this phase addresses

When owner/admin says:

- "this is my Twitter"
- "this is my phone"
- "this wallet is mine"

the system should accept this with reduced friction compared with non-privileged entities.

## Current challenge

Milaidy currently lacks a durable role-aware trust contract in its web chat identity path.

Even if rolodex is enabled, claim trust quality depends on reliable role identity.

## Precondition from prior phases

This phase depends on:

1. explicit admin identity and roles metadata (Phase 3)
2. stable identity mapping from incoming chat message to entity id

## Trust policy levels

## Level 1: OWNER claims

- accepted as authoritative for selected claim categories
- immediately persisted with audit trail
- optional confirm step for high-risk categories (configurable)

## Level 2: ADMIN claims

- accepted for operational categories
- optionally require confirm for identity-critical categories

## Level 3: MEMBER/NONE claims

- require verification workflow (challenge, corroboration, or confidence threshold)

## Claim category policy matrix

Examples:

1. social handle
   - OWNER: auto-accept
   - ADMIN: accept with optional confirm
   - NONE: verification required

2. phone/email
   - OWNER: accept + masked confirmation
   - ADMIN: confirm required
   - NONE: verification required

3. wallet address
   - OWNER: accept with warning/audit
   - ADMIN: confirm + optional signature challenge
   - NONE: challenge required

## Auditability requirements

Every accepted privileged claim must record:

- claim text and normalized value
- actor entity id
- actor role at decision time
- trust rule id used
- timestamp

This is critical for forensic debugging and user trust.

## Integration options

## Option A: role-aware wrapper in Milaidy before rolodex action

Pros:

- minimal rolodex plugin changes
- Milaidy controls trust gate

Cons:

- duplicated trust logic outside rolodex domain

## Option B: implement directly in rolodex plugin (preferred long-term)

Pros:

- claim trust semantics live where claims are processed
- cleaner domain ownership

Cons:

- requires plugin changes and version coordination

## Option C: hybrid staged rollout (recommended)

1. short term wrapper in Milaidy
2. migrate logic into rolodex plugin once stable

## Security threat model highlights

1. compromised admin session
   - role trust would amplify attacker impact
   - mitigations:
     - session hardening
     - optional high-risk confirmation
     - anomaly detection

2. stale role cache
   - actor downgraded but still treated privileged
   - mitigation:
     - resolve role at decision time from world metadata

3. replay of old trusted claims
   - mitigation:
     - nonce/timestamp guards for sensitive categories

## Failure behavior

If role resolution fails:

- default to non-privileged path (fail-safe)
- surface explicit UI message:
  - "Could not verify admin role; using verification flow."

## Testing requirements

1. privileged claim acceptance tests by role
2. non-privileged claim verification path tests
3. audit record integrity tests
4. downgrade role regression tests

## Done criteria

1. Owner/admin trust semantics are explicit and enforced.
2. Claims are auditable and reversible.
3. Fail-safe path defaults to non-privileged behavior on uncertainty.

