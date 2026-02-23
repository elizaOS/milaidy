---
title: "Drop & Whitelist API"
sidebarTitle: "Drop"
description: "REST API endpoints for NFT drop minting and Twitter-based whitelist verification."
---

The drop and whitelist API handles NFT minting for public and whitelisted drops, plus a Twitter-based verification flow for adding addresses to the whitelist.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/drop/status` | Get current drop status and metadata |
| POST | `/api/drop/mint` | Mint an NFT from the public drop |
| POST | `/api/drop/mint-whitelist` | Mint an NFT using a whitelist spot |
| GET | `/api/whitelist/status` | Check whitelist verification status for an address |
| POST | `/api/whitelist/twitter/message` | Generate a verification tweet message |
| POST | `/api/whitelist/twitter/verify` | Verify a tweet to whitelist an address |

---

### GET /api/drop/status

Returns the current state of the NFT drop — whether it is active, supply remaining, price, and related metadata.

**Response**

```json
{
  "active": true,
  "totalSupply": 1000,
  "minted": 342,
  "remaining": 658,
  "price": "0.05",
  "currency": "ETH",
  "contractAddress": "0x1234...abcd"
}
```

---

### POST /api/drop/mint

Mint an NFT from the public (non-whitelisted) drop.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Wallet address to receive the NFT |
| `quantity` | number | No | Number of NFTs to mint (default 1) |

**Response**

```json
{
  "ok": true,
  "txHash": "0xabc123...",
  "tokenId": 343
}
```

---

### POST /api/drop/mint-whitelist

Mint an NFT using a whitelist allocation. The address must have been previously verified.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Whitelisted wallet address |
| `quantity` | number | No | Number of NFTs to mint (default 1) |

**Response**

```json
{
  "ok": true,
  "txHash": "0xdef456...",
  "tokenId": 344
}
```

---

### GET /api/whitelist/status

Check whether a wallet address has been verified for the whitelist.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `address` | string | Wallet address to check |

**Response**

```json
{
  "address": "0x1234...abcd",
  "whitelisted": true,
  "verifiedAt": "2025-06-01T12:00:00.000Z"
}
```

---

### POST /api/whitelist/twitter/message

Generate a verification message that the user must tweet to prove wallet ownership.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Wallet address to verify |

**Response**

```json
{
  "message": "Verifying my wallet 0x1234...abcd for @MiladyAgent whitelist #milady-verify-abc123"
}
```

---

### POST /api/whitelist/twitter/verify

Submit a tweet URL for verification. The server fetches the tweet, validates the verification message content, and adds the address to the whitelist if valid.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Wallet address being verified |
| `tweetUrl` | string | Yes | URL of the verification tweet |

**Response**

```json
{
  "ok": true,
  "whitelisted": true
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| 400 | Missing address or tweet URL |
| 400 | Tweet does not contain the expected verification message |
| 400 | Tweet author does not match expectations |

---

## Operational Runbook

### Setup Checklist

1. Configure drop contract/network settings and signer credentials.
2. Configure Twitter verification integration for whitelist checks.
3. Verify the runtime can reach RPC and social verification providers.

### Failure Modes

- Mint request fails on-chain:
  Check signer funding, nonce state, gas policy, and RPC availability.
- Whitelist verify fails:
  Check tweet URL parsing, author validation, and expected message format.
- Status endpoint stale or inconsistent:
  Check drop service initialization and cache invalidation behavior.

### Verification Commands

```bash
bunx vitest run src/api/registry-routes.test.ts src/api/twitter-verify.test.ts
bun run typecheck
```
