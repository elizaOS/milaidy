---
name: plugin-bnb-identity
description: Maintain and evolve Milady's ERC-8004 identity plugin (`@miladyai/plugin-bnb-identity`) for registering, updating, and resolving on-chain agent identities, including metadata/profile generation and persistence helpers.
---

# Plugin BNB Identity

Use this skill for package-local work in `packages/plugin-bnb-identity`.

## Scope
- Edit and evolve plugin actions (`register`, `update`, `resolve`).
- Update metadata generation (`buildAgentMetadata`, data URI / hosted URI flow).
- Adjust MCP tool wiring and runtime call behavior.
- Update local persistence record shape (`bnb-identity.json`).
- Add or update types and tests in `src/` and `test/`.

## Files of interest
- `src/types.ts`
- `src/metadata.ts`
- `src/store.ts`
- `src/service.ts`
- `src/actions.ts`
- `src/index.ts`
- `test/metadata.test.ts`
- `test/store.test.ts`

## Key conventions
- Keep deterministic metadata generation.
- Keep write actions confirmation-gated and read paths safe.
- Preserve plugin export shape and compatibility.
- Keep changes minimal and test-focused.

## Validation
- `bun test`
- `bun run build`
