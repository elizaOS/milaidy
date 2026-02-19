---
title: "Wallet & Crypto"
sidebarTitle: "Wallet & Crypto"
description: "Built-in EVM and Solana wallet with key generation, balance fetching, NFT queries, signing policy, and smart contract interactions."
---

# Wallet & Crypto

Milady includes a built-in crypto wallet supporting both EVM-compatible chains and Solana. The wallet uses Node.js crypto primitives (no heavy dependencies like viem or @solana/web3.js) and fetches on-chain data via Alchemy (EVM) and Helius (Solana) REST APIs.

## Table of Contents

1. [Key Generation and Derivation](#key-generation-and-derivation)
2. [Supported EVM Chains](#supported-evm-chains)
3. [Solana Support](#solana-support)
4. [Wallet Addresses and Balances](#wallet-addresses-and-balances)
5. [NFT Queries](#nft-queries)
6. [Wallet Import and Export](#wallet-import-and-export)
7. [Signing Policy](#signing-policy)
8. [Smart Contract Interactions](#smart-contract-interactions)
9. [API Endpoints](#api-endpoints)

---

## Key Generation and Derivation

### EVM (secp256k1)

EVM private keys are 32 random bytes generated via `crypto.randomBytes(32)`. The public key is derived using the `@noble/curves` secp256k1 implementation (chosen for cross-runtime compatibility with Node, Bun, and browsers). The Ethereum address is the last 20 bytes of the keccak-256 hash of the uncompressed public key, formatted with EIP-55 checksum encoding.

### Solana (Ed25519)

Solana keypairs are generated via `crypto.generateKeyPairSync("ed25519")`. The private key is exported as PKCS8 DER (32-byte seed extracted at offset 16), and the public key as SPKI DER (32-byte raw key at offset 12). The Solana secret key format is seed(32) + pubkey(32), both Base58-encoded using the Bitcoin alphabet.

### Combined Key Generation

The `generateWalletKeys()` function produces both an EVM and a Solana keypair at once, returning:

```typescript
interface WalletKeys {
  evmPrivateKey: string;    // 0x-prefixed hex
  evmAddress: string;       // EIP-55 checksummed
  solanaPrivateKey: string;  // Base58-encoded
  solanaAddress: string;     // Base58-encoded public key
}
```

You can also generate for a single chain with `generateWalletForChain("evm" | "solana")`.

---

## Supported EVM Chains

Milady supports five EVM chains out of the box, all fetched via Alchemy:

| Chain | Chain ID | Native Symbol | Alchemy Subdomain |
|-------|----------|---------------|-------------------|
| Ethereum | 1 | ETH | eth-mainnet |
| Base | 8453 | ETH | base-mainnet |
| Arbitrum | 42161 | ETH | arb-mainnet |
| Optimism | 10 | ETH | opt-mainnet |
| Polygon | 137 | POL | polygon-mainnet |

Balance queries run in parallel across all chains via `eth_getBalance` (native) and `alchemy_getTokenBalances` (ERC-20 tokens). Token metadata is resolved with `alchemy_getTokenMetadata`, limited to the first 50 non-zero-balance tokens per chain.

---

## Solana Support

Solana balances are fetched via Helius RPC (`mainnet.helius-rpc.com`):

- **SOL balance**: Standard `getBalance` RPC call, divided by 1e9 for display.
- **SPL tokens**: `getAssetsByOwner` with `showFungible: true`, extracting `FungibleToken` and `FungibleAsset` interfaces. Returns symbol, name, mint address, balance, decimals, and USD value (if available from Helius price data).

---

## Wallet Addresses and Balances

The `getWalletAddresses()` function derives addresses from environment variables `EVM_PRIVATE_KEY` and `SOLANA_PRIVATE_KEY` without requiring a running runtime. Returns:

```typescript
interface WalletAddresses {
  evmAddress: string | null;
  solanaAddress: string | null;
}
```

---

## NFT Queries

### EVM NFTs

Fetched via Alchemy NFT v3 API (`getNFTsForOwner`) across all supported chains. Returns up to 50 NFTs per chain with metadata (name, description, image URL, collection name, token type).

### Solana NFTs

Fetched via Helius `getAssetsByOwner` filtering for `V1_NFT`, `ProgrammableNFT`, and `V2_NFT` interfaces. Returns up to 100 NFTs with mint address, name, description, image, and collection name.

---

## Wallet Import and Export

### Import

The `POST /api/wallet/import` endpoint accepts a `chain` ("evm" or "solana") and `privateKey`. If no chain is specified, the key format is auto-detected:

- Keys starting with `0x` or 64-character hex strings are treated as EVM.
- All other keys are treated as Solana (Base58-decoded, validated as 32 or 64 bytes).

On successful import, the key is stored in `process.env` and persisted to the agent's `milady.json` config file.

### Export

The `POST /api/wallet/export` endpoint returns private keys for both chains. This endpoint requires confirmation and is protected by a rejection resolver that checks for valid auth tokens and explicit confirmation. Key exports are logged as warnings.

### Key Validation

Keys are validated before import:

- **EVM**: Must be exactly 64 hex characters (with or without `0x` prefix). Address derivation is verified.
- **Solana**: Must decode from Base58 to exactly 32 or 64 bytes. Address derivation is verified.

---

## Signing Policy

The signing policy engine evaluates transaction requests against configurable rules before allowing signatures. Defined in `src/services/signing-policy.ts`.

### Policy Configuration

```typescript
interface SigningPolicy {
  allowedChainIds: number[];          // empty = allow all
  allowedContracts: string[];         // lowercase addresses; empty = allow all
  deniedContracts: string[];          // checked before allowlist
  maxTransactionValueWei: string;     // default: "100000000000000000" (0.1 ETH)
  maxTransactionsPerHour: number;     // default: 10
  maxTransactionsPerDay: number;      // default: 50
  allowedMethodSelectors: string[];   // 4-byte hex; empty = allow all
  humanConfirmationThresholdWei: string; // default: "10000000000000000" (0.01 ETH)
  requireHumanConfirmation: boolean;
}
```

### Policy Decisions

Each signing request is evaluated and returns:

```typescript
type PolicyDecision = {
  allowed: boolean;
  reason: string;
  requiresHumanConfirmation: boolean;
  matchedRule: string;
};
```

The evaluator maintains a request log for rate limiting and a processed-request-ID set for replay protection.

---

## Smart Contract Interactions

Milady defines several smart contract interaction interfaces in `src/contracts/`:

### Apps Registry (`src/contracts/apps.ts`)

Manages installable apps with viewer configurations:

- `AppLaunchResult` — plugin installation, display name, launch URL, viewer config
- `InstalledAppInfo` — installed app metadata (name, plugin, version, install time)
- `AppStopResult` — app shutdown with plugin uninstall scope

### Drops and Airdrops (`src/contracts/drop.ts`)

Supports NFT minting with drop mechanics:

- `DropStatus` — drop state (enabled, public/whitelist mint, supply, price, minted-out flag)
- `MintResult` — agent ID, mint number, transaction hash, shiny flag

### Verification (`src/contracts/verification.ts`)

Identity verification:

- `VerificationResult` — verified boolean, error message, handle

---

## API Endpoints

### Wallet Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/wallet/addresses` | Get current EVM and Solana addresses |
| `GET` | `/api/wallet/balances` | Fetch balances across all chains |
| `GET` | `/api/wallet/nfts` | Fetch NFTs across all chains |
| `GET` | `/api/wallet/config` | Get wallet configuration status (which API keys are set, supported chains, addresses) |
| `PUT` | `/api/wallet/config` | Update wallet API keys (Alchemy, Infura, Ankr, Helius, Birdeye) |
| `POST` | `/api/wallet/import` | Import a private key (auto-detects chain) |
| `POST` | `/api/wallet/generate` | Generate new wallet(s) for "evm", "solana", or "both" |
| `POST` | `/api/wallet/export` | Export private keys (requires confirmation) |

### Configuration Status Response

The `GET /api/wallet/config` response indicates which provider API keys are set:

```json
{
  "alchemyKeySet": true,
  "infuraKeySet": false,
  "ankrKeySet": false,
  "heliusKeySet": true,
  "birdeyeKeySet": false,
  "evmChains": ["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon"],
  "evmAddress": "0x...",
  "solanaAddress": "..."
}
```

### Environment Variables

| Variable | Required For | Provider |
|----------|-------------|----------|
| `EVM_PRIVATE_KEY` | EVM wallet | — |
| `SOLANA_PRIVATE_KEY` | Solana wallet | — |
| `ALCHEMY_API_KEY` | EVM balances and NFTs | Alchemy |
| `HELIUS_API_KEY` | Solana balances and NFTs | Helius |
| `INFURA_API_KEY` | Alternative EVM provider | Infura |
| `ANKR_API_KEY` | Alternative EVM provider | Ankr |
| `BIRDEYE_API_KEY` | Token price data | Birdeye |
