---
title: Whitelist API
sidebarTitle: Whitelist
description: REST API endpoints for NFT ownership verification and Merkle proof generation for whitelisted minting.
---

## NFT Verification

### Verify NFT Ownership

```
POST /api/whitelist/nft/verify
```

Verifies Milady NFT ownership for the agent's own EVM wallet and, if verified, adds it to the in-memory whitelist. The wallet address is resolved server-side from the agent's onboarded wallet — no address is accepted in the request body.

**Request body:** none.

**Response:**
```json
{
  "verified": true,
  "balance": 2,
  "contractAddress": "0x5Af0D9827E0c53E4799BB226655A1de152A425a5",
  "error": null,
  "walletAddress": "0xabc..."
}
```

**Errors:** `400` if no wallet address is onboarded; `500` on chain verification failure.

### NFT Whitelist Status

```
GET /api/whitelist/nft/status
```

Returns the agent's current NFT whitelist eligibility without triggering a blockchain call.

**Response:**
```json
{
  "walletAddress": "0xabc...",
  "whitelisted": false,
  "contractAddress": "0x5Af0D9827E0c53E4799BB226655A1de152A425a5",
  "message": "Address is not whitelisted. Use POST /api/whitelist/nft/verify to verify NFT ownership."
}
```

`walletAddress` is an empty string if no wallet is onboarded.

## Merkle Proofs

### Get Merkle Root

```
GET /api/whitelist/merkle/root
```

Returns the Merkle root hash and address count for the current in-memory whitelist tree.

**Response:**
```json
{
  "root": "0xdeadbeef...",
  "addressCount": 1847,
  "proofReady": true
}
```

### Get Merkle Proof

```
GET /api/whitelist/merkle/proof
```

Generates the Merkle inclusion proof for a given wallet address. The proof can be passed directly to the `mintWhitelist()` on-chain function.

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| `address` | string | yes |

**Response:**
```json
{
  "proof": ["0xabc...", "0xdef..."],
  "leaf": "0x123...",
  "root": "0xdeadbeef...",
  "isWhitelisted": true
}
```

`proof` is an empty array and `isWhitelisted` is `false` if the address is not in the tree.

**Errors:** `400` if `address` query param is missing.
