# BAP-578 Non-Fungible Agent Integration Design

## Overview

Full BAP-578 (Non-Fungible Agent) standard integration into Milady on BNB Smart Chain. Extends the existing `plugin-bnb-identity` package to support agent NFT minting, on-chain learning proofs via Merkle trees, ownership transfer, logic upgrades, and emergency pause.

Coexists with the existing ERC-8004 Agent Identity Registry — ERC-8004 handles identity registration, BAP-578 handles asset ownership and learning provenance. Both linked by wallet address.

## Architecture

**Approach:** Extend `packages/plugin-bnb-identity/` (chosen over standalone plugin or core-layer integration).

**Contract interaction:** All on-chain calls go through bnbchain-mcp MCP server, same pattern as existing ERC-8004 actions.

```
milady-plugin.ts (core)
  learning-store.ts → LEARNINGS.md
       ↑                     ↓
  auto-analysis trigger    read entries
                             ↓
              ┌──────────────────────────┐
              │ plugin-bnb-identity      │
              │                          │
              │  merkle-learning.ts      │
              │    ↓ build tree          │
              │  service.ts (MCP)        │
              │    ↓ updateLearningRoot  │
              │  store.ts               │
              │    ↓ persist locally     │
              └──────────────────────────┘

  ERC-8004 registry ←──→ BAP-578 NFA
  (identity layer)       (asset layer)
  linked by wallet address in store
```

## Data Model

### NFA Types (extend `types.ts`)

```typescript
interface NfaMetadata {
  tokenId: string;
  owner: string;
  learningRoot: string;
  logicContract: string;
  paused: boolean;
  network: "bsc" | "bsc-testnet";
  mintTxHash: string;
  lastUpdatedAt: string;
}

interface LearningLeaf {
  id: string;
  timestamp: string;
  category: "error" | "correction" | "insight" | "pattern";
  summary: string;
  contentHash: string;  // keccak256 of full detail
}

interface LearningProof {
  leaf: string;
  proof: string[];
  root: string;
  index: number;
}

interface NfaRecord {
  tokenId: string;
  network: string;
  owner: string;
  learningRoot: string;
  learningCount: number;
  lastAnchoredAt: string;
  logicContract?: string;
  paused: boolean;
}
```

### Store

`~/.milady/bnb-identity.json` gains an `nfa` field alongside existing `identity`.

## Service Layer

New MCP tool calls added to `BnbIdentityService`:

| Method | MCP Tool | Purpose |
|--------|----------|---------|
| `mintNfa()` | `mint_bap578_nfa` | Mint NFA NFT |
| `updateLearningRoot()` | `update_bap578_learning` | Write Merkle root on-chain |
| `transferNfa()` | `transfer_bap578_nfa` | Transfer ownership |
| `upgradeLogic()` | `upgrade_bap578_logic` | Upgrade logic contract |
| `pauseNfa()` | `pause_bap578_nfa` | Emergency pause |
| `unpauseNfa()` | `unpause_bap578_nfa` | Unpause |
| `getNfaInfo()` | `get_bap578_nfa` | Read-only query |

All write ops go through `callMcpTool()` with HTTP fallback to `BNB_MCP_URL`.

## Merkle Learning Module

New file: `merkle-learning.ts`

- `hashLearningLeaf(entry)` — keccak256(abi.encodePacked(id, timestamp, category, contentHash))
- `buildLearningTree(entries)` — sorted-pair Merkle tree, OpenZeppelin compatible
- `getLearningRoot(entries)` — root of tree
- `getLearningProof(entries, targetId)` — proof for a specific learning
- `verifyLearningProof(proof)` — verify proof against root

Learning entries stay off-chain in LEARNINGS.md. Only the 32-byte Merkle root goes on-chain. Verification: request proof + check against on-chain root.

## Actions

### BNB_NFA_MINT
- Validate: BNB_PRIVATE_KEY set, no existing NFA in store
- Handler: build agentURI metadata → mintNfa() → save to store
- Post-mint: optionally associate with ERC-8004 registration

### BNB_NFA_ANCHOR_LEARNINGS
- Validate: NFA exists in store, new learnings since last anchor
- Handler: read LEARNINGS.md entries → buildLearningTree() → updateLearningRoot() → update store
- Can be wired into auto-analysis trigger via `features.nfaAutoAnchor` config flag

### BNB_NFA_TRANSFER
- Validate: NFA exists, user confirms recipient
- Handler: transferNfa() → update store owner
- Two-turn confirmation pattern (matches existing BNB_IDENTITY_REGISTER)

### BNB_NFA_UPGRADE_LOGIC
- Validate: NFA exists, newLogic is valid address
- Handler: upgradeLogic() → update store
- Two-turn confirmation

### BNB_NFA_PAUSE / BNB_NFA_UNPAUSE
- Validate: NFA exists, current state matches expected toggle
- Handler: pauseNfa/unpauseNfa() → update store
- Single action with toggle behavior

## Integration Points

1. **Learning Store → Merkle Tree:** `BNB_NFA_ANCHOR_LEARNINGS` reads LEARNINGS.md from workspace dir (via runtime env/settings), builds tree, anchors root. No direct cross-package import — reads file from known path.

2. **Auto-analysis → Auto-anchor:** Post-hook in existing auto-analysis trigger. When `features.nfaAutoAnchor === true`, anchor learnings after analysis completes.

3. **ERC-8004 ↔ BAP-578:** Store keeps both `identity.tokenId` and `nfa.tokenId`. Association is by wallet address (same owner). No on-chain cross-reference required.

## Plugin Registration

```typescript
export const bnbIdentityPlugin: Plugin = {
  name: "bnb-identity",
  actions: [
    // Existing ERC-8004
    bnbIdentityRegisterAction,
    bnbIdentityUpdateAction,
    bnbIdentityResolveAction,
    // BAP-578 NFA
    bnbNfaMintAction,
    bnbNfaAnchorLearningsAction,
    bnbNfaTransferAction,
    bnbNfaUpgradeLogicAction,
    bnbNfaPauseAction,
  ],
};
```
