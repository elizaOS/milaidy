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

---

## Trading

### POST /api/wallet/trade/preflight

Run a preflight check to verify the wallet and RPC are ready for a BSC trade.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tokenAddress` | string | No | Token contract address to validate (optional) |

**Response**

Returns a readiness object with wallet balance, RPC status, and any blocking issues.

---

### POST /api/wallet/trade/quote

Get a price quote for a BSC token swap before executing.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `side` | string | Yes | `"buy"` or `"sell"` |
| `tokenAddress` | string | Yes | Token contract address |
| `amount` | string | Yes | Trade amount (in human-readable units) |
| `slippageBps` | number | No | Slippage tolerance in basis points |

**Response**

Returns a quote object with estimated output amount, price impact, and route details.

**Errors**

| Status | Condition |
|--------|-----------|
| 400 | Missing `side`, `tokenAddress`, or `amount` |

---

### POST /api/wallet/trade/execute

Execute a token trade on BSC. Behavior depends on wallet configuration and confirmation:

- Without `confirm: true` or without a local private key, returns an unsigned transaction for client-side signing.
- With `confirm: true`, a local key, and appropriate trade permissions, executes the trade on-chain and returns the receipt.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `side` | string | Yes | `"buy"` or `"sell"` |
| `tokenAddress` | string | Yes | Token contract address |
| `amount` | string | Yes | Trade amount (in human-readable units) |
| `slippageBps` | number | No | Slippage tolerance in basis points |
| `deadlineSeconds` | number | No | Transaction deadline in seconds |
| `confirm` | boolean | No | Set to `true` to execute immediately with a local key |
| `source` | string | No | `"agent"` or `"manual"` — attribution for ledger tracking |

**Response (unsigned)**

```json
{
  "ok": true,
  "mode": "user-sign",
  "executed": false,
  "requiresUserSignature": true,
  "unsignedTx": { "to": "0x...", "data": "0x...", "value": "0x0" },
  "requiresApproval": true,
  "unsignedApprovalTx": { "to": "0x...", "data": "0x..." }
}
```

**Response (executed)**

```json
{
  "ok": true,
  "mode": "local-sign",
  "executed": true,
  "requiresUserSignature": false,
  "execution": {
    "hash": "0x...",
    "explorerUrl": "https://bscscan.com/tx/0x..."
  }
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| 400 | Missing `side`, `tokenAddress`, or `amount` |
| 403 | Trade permission denied |

---

### GET /api/wallet/trade/tx-status

Check the on-chain status of a previously submitted trade transaction.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `hash` | string | Yes | Transaction hash |

**Response**

```json
{
  "ok": true,
  "hash": "0x...",
  "status": "success",
  "explorerUrl": "https://bscscan.com/tx/0x...",
  "chainId": 56,
  "blockNumber": 12345678,
  "confirmations": 12,
  "nonce": 42,
  "gasUsed": "150000",
  "effectiveGasPriceWei": "3000000000"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"pending"`, `"success"`, `"reverted"`, or `"not_found"` |
| `chainId` | number | Always `56` (BSC) |

**Errors**

| Status | Condition |
|--------|-----------|
| 400 | Missing `hash` query parameter |

---

### GET /api/wallet/trading/profile

Get a trading profit-and-loss profile from the local trade ledger.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `window` | string | `30d` | Time window: `"7d"`, `"30d"`, or `"all"` |
| `source` | string | `all` | Filter by attribution: `"agent"`, `"manual"`, or `"all"` |

**Response**

Returns aggregated trading statistics including realized and unrealized P&L over the requested window.

---

### POST /api/wallet/transfer/execute

Transfer native tokens (BNB) or ERC-20 tokens on BSC.

- Without `confirm: true` or without a local private key, returns an unsigned transaction for client-side signing.
- With `confirm: true` and a local key, executes the transfer on-chain.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `toAddress` | string | Yes | Recipient EVM address |
| `amount` | string | Yes | Amount to transfer (in human-readable units) |
| `assetSymbol` | string | Yes | Token symbol (e.g. `"BNB"`, `"USDT"`) |
| `tokenAddress` | string | No | ERC-20 contract address (required for non-native tokens) |
| `confirm` | boolean | No | Set to `true` to execute immediately with a local key |

**Response**

Same shape as the trade execute response — returns either an unsigned transaction or an execution receipt.

**Errors**

| Status | Condition |
|--------|-----------|
| 400 | Missing `toAddress`, `amount`, or `assetSymbol` |
| 400 | Invalid EVM address format |

---

### POST /api/wallet/production-defaults

Apply opinionated production defaults for wallet trading configuration (trade permission mode, RPC settings, etc.).

**Response**

```json
{
  "ok": true,
  "applied": [
    "tradePermissionMode=user-sign-only",
    "bscRpcUrl=https://bsc-dataseed.binance.org"
  ],
  "tradePermissionMode": "user-sign-only"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `applied` | string[] | List of configuration changes that were applied |
| `tradePermissionMode` | string | The resulting trade permission mode |

---

## Common Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `INVALID_REQUEST` | Request body is malformed or missing required fields |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication token |
| 404 | `NOT_FOUND` | Requested resource does not exist |
| 400 | `INVALID_KEY` | Private key format is invalid |
| 400 | `INVALID_ADDRESS` | EVM address format is invalid |
| 403 | `EXPORT_FORBIDDEN` | Export is not permitted without proper confirmation |
| 403 | `TRADE_FORBIDDEN` | Trade permission denied |
| 500 | `INSUFFICIENT_BALANCE` | Wallet balance is insufficient for the operation |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
