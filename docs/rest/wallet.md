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

## BSC Trading

<Info>
BSC trading endpoints require a configured BSC RPC URL and an EVM wallet address. Trade execution modes depend on `tradePermissionMode` in the agent's configuration: `"user-sign-only"` returns unsigned transactions for external signing, while `"local-key"` modes execute using the server-side private key.
</Info>

### POST /api/wallet/trade/preflight

Check BSC trade readiness including wallet, RPC, chain connectivity, and gas availability.

**Request**

```json
{
  "tokenAddress": "0x1234...abcd"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenAddress` | string | no | Token contract address to check liquidity for |

**Response**

```json
{
  "ready": true,
  "wallet": "0xd8dA...6045",
  "rpcConnected": true,
  "chainId": 56,
  "gasEstimate": "0.001"
}
```

---

### POST /api/wallet/trade/quote

Produce a BSC trade quote with estimated amounts and routing information. Does not execute the trade.

**Request**

```json
{
  "side": "buy",
  "tokenAddress": "0x1234...abcd",
  "amount": "0.1",
  "slippageBps": 100
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `side` | string | yes | `"buy"` or `"sell"` |
| `tokenAddress` | string | yes | Token contract address |
| `amount` | string | yes | Amount to trade (in human-readable units) |
| `slippageBps` | number | no | Slippage tolerance in basis points |

**Response**

```json
{
  "side": "buy",
  "tokenAddress": "0x1234...abcd",
  "slippageBps": 100,
  "route": "pancakeswap-v2",
  "routerAddress": "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  "quoteIn": {
    "symbol": "BNB",
    "amount": "0.1",
    "amountWei": "100000000000000000"
  },
  "quoteOut": {
    "symbol": "TOKEN",
    "amount": "1500.0",
    "amountWei": "1500000000000000000000"
  }
}
```

---

### POST /api/wallet/trade/execute

Execute or prepare a BSC trade. In `"user-sign-only"` mode, returns an unsigned transaction for external signing. In local-key modes with `confirm: true`, executes using the server-side EVM private key.

**Request**

```json
{
  "side": "buy",
  "tokenAddress": "0x1234...abcd",
  "amount": "0.1",
  "slippageBps": 100,
  "deadlineSeconds": 300,
  "confirm": true,
  "source": "manual"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `side` | string | yes | `"buy"` or `"sell"` |
| `tokenAddress` | string | yes | Token contract address |
| `amount` | string | yes | Amount to trade |
| `slippageBps` | number | no | Slippage tolerance in basis points |
| `deadlineSeconds` | number | no | Transaction deadline in seconds |
| `confirm` | boolean | no | Set `true` to execute locally (requires local key and appropriate permission mode) |
| `source` | string | no | `"agent"` or `"manual"` (default: `"manual"`) — recorded in the trade ledger |

**Response (unsigned — user-sign mode):**
```json
{
  "ok": true,
  "side": "buy",
  "mode": "user-sign",
  "quote": { "..." : "..." },
  "executed": false,
  "requiresUserSignature": true,
  "unsignedTx": {
    "to": "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    "data": "0x...",
    "valueWei": "100000000000000000",
    "chainId": 56
  },
  "requiresApproval": false
}
```

**Response (executed — local-key mode):**
```json
{
  "ok": true,
  "side": "buy",
  "mode": "local-key",
  "quote": { "..." : "..." },
  "executed": true,
  "requiresUserSignature": false,
  "execution": {
    "hash": "0xTxHash...",
    "nonce": 42,
    "explorerUrl": "https://bscscan.com/tx/0xTxHash..."
  }
}
```

---

### GET /api/wallet/trade/tx-status

Check the on-chain status of a BSC transaction by hash.

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `hash` | string | yes | Transaction hash to check |

**Response**

```json
{
  "ok": true,
  "hash": "0xTxHash...",
  "status": "success",
  "explorerUrl": "https://bscscan.com/tx/0xTxHash...",
  "chainId": 56,
  "blockNumber": 12345678,
  "confirmations": 15,
  "nonce": 42,
  "gasUsed": "150000",
  "effectiveGasPriceWei": "3000000000"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"pending"`, `"success"`, `"reverted"`, or `"not_found"` |
| `blockNumber` | number \| null | Block the transaction was included in |
| `confirmations` | number | Number of confirmations |
| `nonce` | number \| null | Transaction nonce |
| `gasUsed` | string \| null | Gas consumed |
| `effectiveGasPriceWei` | string \| null | Effective gas price in wei |

---

### GET /api/wallet/trading/profile

Returns trading profit-and-loss profile from the local trade ledger.

**Query params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `window` | string | no | `"30d"` | Time window: `"7d"`, `"30d"`, or `"all"` |
| `source` | string | no | `"all"` | Filter by trade source: `"agent"`, `"manual"`, or `"all"` |

**Response**

```json
{
  "totalTrades": 25,
  "window": "30d",
  "source": "all"
}
```

---

## Token Transfer

### POST /api/wallet/transfer/execute

Execute or prepare a BNB or ERC-20 token transfer on BSC. Like trades, the execution mode depends on `tradePermissionMode`.

**Request**

```json
{
  "toAddress": "0xRecipient...",
  "amount": "1.5",
  "assetSymbol": "BNB",
  "tokenAddress": null,
  "confirm": true
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `toAddress` | string | yes | Recipient EVM address |
| `amount` | string | yes | Amount to transfer (human-readable) |
| `assetSymbol` | string | yes | Token symbol (e.g. `"BNB"`, `"USDC"`) |
| `tokenAddress` | string | no | ERC-20 contract address (omit for native BNB) |
| `confirm` | boolean | no | Set `true` to execute locally |

**Response (unsigned):**
```json
{
  "ok": true,
  "mode": "user-sign",
  "executed": false,
  "requiresUserSignature": true,
  "unsignedTx": { "..." : "..." }
}
```

**Response (executed):**
```json
{
  "ok": true,
  "mode": "local-key",
  "executed": true,
  "execution": {
    "hash": "0xTxHash...",
    "explorerUrl": "https://bscscan.com/tx/0xTxHash..."
  }
}
```

---

## Production Defaults

### POST /api/wallet/production-defaults

Apply opinionated production wallet configuration defaults. Sets sensible BSC RPC and trade permission defaults when not already configured.

**Response**

```json
{
  "ok": true,
  "applied": ["tradePermissionMode=user-sign-only"],
  "skipped": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `applied` | string[] | Configuration keys that were set |
| `skipped` | string[] | Configuration keys already set (not overwritten) |

---

## Privy Wallet

### GET /api/privy/status

Check whether Privy wallet provisioning is enabled.

**Response**

```json
{
  "enabled": true,
  "configured": true
}
```

---

### POST /api/privy/login

Start a Privy wallet login flow.

---

### POST /api/privy/logout

Log out of the Privy wallet session.

---

## Common Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `INVALID_REQUEST` | Request body is malformed or missing required fields |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication token |
| 404 | `NOT_FOUND` | Requested resource does not exist |
| 400 | `INVALID_KEY` | Private key format is invalid |
| 403 | `EXPORT_FORBIDDEN` | Export is not permitted without proper confirmation |
| 500 | `INSUFFICIENT_BALANCE` | Wallet balance is insufficient for the operation |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
