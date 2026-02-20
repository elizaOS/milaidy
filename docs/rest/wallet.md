---
title: "Wallet API"
sidebarTitle: "Wallet"
description: "REST API endpoints for managing EVM and Solana wallets, balances, NFTs, and keys."
---

The wallet API provides access to the agent's on-chain identity across EVM-compatible chains and Solana. Balance and NFT lookups require API keys (Alchemy for EVM, Helius for Solana) configured via `PUT /api/wallet/config`.

<Warning>
The `POST /api/wallet/export` endpoint returns private keys in plaintext. It requires explicit confirmation and is logged as a security event.
</Warning>

## Endpoints

### GET /api/wallet/addresses

Get the agent's EVM and Solana wallet addresses.

**Response**

```json
{
  "evmAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "solanaAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU"
}
```

---

### GET /api/wallet/balances

Get token balances across all supported chains. Requires `ALCHEMY_API_KEY` for EVM chains and `HELIUS_API_KEY` for Solana. Returns `null` for chains where the required API key is not configured.

**Response**

```json
{
  "evm": {
    "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "chains": [
      {
        "chainId": 1,
        "name": "Ethereum",
        "nativeBalance": "1.5",
        "tokens": []
      }
    ]
  },
  "solana": {
    "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU",
    "nativeBalance": "2.5",
    "tokens": []
  }
}
```

---

### GET /api/wallet/nfts

Get NFTs held by the agent across EVM chains and Solana. Requires `ALCHEMY_API_KEY` for EVM and `HELIUS_API_KEY` for Solana.

**Response**

```json
{
  "evm": [
    {
      "contractAddress": "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
      "tokenId": "1234",
      "name": "Bored Ape #1234",
      "imageUrl": "https://..."
    }
  ],
  "solana": {
    "nfts": []
  }
}
```

---

### GET /api/wallet/config

Get the wallet API key configuration status and current wallet addresses. Key values are not returned — only their set/unset status.

**Response**

```json
{
  "alchemyKeySet": true,
  "infuraKeySet": false,
  "ankrKeySet": false,
  "heliusKeySet": true,
  "birdeyeKeySet": false,
  "evmChains": ["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon"],
  "evmAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "solanaAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU"
}
```

---

### PUT /api/wallet/config

Update wallet API keys. Accepted keys: `ALCHEMY_API_KEY`, `INFURA_API_KEY`, `ANKR_API_KEY`, `HELIUS_API_KEY`, `BIRDEYE_API_KEY`. Setting `HELIUS_API_KEY` also automatically configures `SOLANA_RPC_URL`. Triggers a runtime restart to apply changes.

**Request**

```json
{
  "ALCHEMY_API_KEY": "alchemy-key-here",
  "HELIUS_API_KEY": "helius-key-here"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ALCHEMY_API_KEY` | string | No | Alchemy API key for EVM balance/NFT lookups |
| `INFURA_API_KEY` | string | No | Infura API key |
| `ANKR_API_KEY` | string | No | Ankr API key |
| `HELIUS_API_KEY` | string | No | Helius API key for Solana lookups — also sets `SOLANA_RPC_URL` |
| `BIRDEYE_API_KEY` | string | No | Birdeye API key for Solana token prices |

**Response**

```json
{
  "ok": true
}
```

---

### POST /api/wallet/import

Import an existing private key for EVM or Solana. Chain is auto-detected if not specified.

**Request**

```json
{
  "privateKey": "0xabc123...",
  "chain": "evm"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `privateKey` | string | Yes | Private key to import |
| `chain` | string | No | `"evm"` or `"solana"` — auto-detected if omitted |

**Response**

```json
{
  "ok": true,
  "chain": "evm",
  "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
}
```

---

### POST /api/wallet/generate

Generate one or more new wallets. The generated private keys are saved to config and available immediately via `GET /api/wallet/addresses`.

**Request**

```json
{
  "chain": "both"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chain` | string | No | `"evm"`, `"solana"`, or `"both"` (default: `"both"`) |

**Response**

```json
{
  "ok": true,
  "wallets": [
    { "chain": "evm", "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
    { "chain": "solana", "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU" }
  ]
}
```

---

### POST /api/wallet/export

Export private keys in plaintext. Requires explicit confirmation. This action is logged as a security event.

**Request**

```json
{
  "confirm": true
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `confirm` | boolean | Yes | Must be `true` to proceed |
| `exportToken` | string | No | Optional one-time export token for additional security |

**Response**

```json
{
  "evm": {
    "privateKey": "0xabc123...",
    "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
  },
  "solana": {
    "privateKey": "base58encodedkey...",
    "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU"
  }
}
```
