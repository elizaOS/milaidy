/**
 * Wallet utilities for first-class EVM + Solana wallet support.
 *
 * Key generation uses Node's crypto module to avoid hard dependencies on
 * viem / @solana/web3.js at the milaidy package level. Both libraries are
 * optional (the plugins bring them), but for onboarding key generation we
 * use raw crypto primitives.
 *
 * Balance and NFT fetching uses the Alchemy (EVM) and Helius (Solana)
 * REST APIs directly via fetch().
 */
import crypto from "node:crypto";
import { logger } from "@elizaos/core";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default timeout for external API requests (15 seconds). */
const FETCH_TIMEOUT_MS = 15_000;

/** Default EVM chains to show in the inventory. */
export const DEFAULT_EVM_CHAINS = [
  { name: "Ethereum", subdomain: "eth-mainnet", chainId: 1, nativeSymbol: "ETH" },
  { name: "Base", subdomain: "base-mainnet", chainId: 8453, nativeSymbol: "ETH" },
  { name: "Arbitrum", subdomain: "arb-mainnet", chainId: 42161, nativeSymbol: "ETH" },
  { name: "Optimism", subdomain: "opt-mainnet", chainId: 10, nativeSymbol: "ETH" },
  { name: "Polygon", subdomain: "polygon-mainnet", chainId: 137, nativeSymbol: "POL" },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WalletKeys {
  evmPrivateKey: string;
  evmAddress: string;
  solanaPrivateKey: string;
  solanaAddress: string;
}

export interface WalletAddresses {
  evmAddress: string | null;
  solanaAddress: string | null;
}

export interface EvmTokenBalance {
  symbol: string;
  name: string;
  contractAddress: string;
  balance: string;
  decimals: number;
  valueUsd: string;
  logoUrl: string;
}

export interface EvmChainBalance {
  chain: string;
  chainId: number;
  nativeBalance: string;
  nativeSymbol: string;
  nativeValueUsd: string;
  tokens: EvmTokenBalance[];
}

export interface SolanaTokenBalance {
  symbol: string;
  name: string;
  mint: string;
  balance: string;
  decimals: number;
  valueUsd: string;
  logoUrl: string;
}

export interface WalletBalancesResponse {
  evm: {
    address: string;
    chains: EvmChainBalance[];
  } | null;
  solana: {
    address: string;
    solBalance: string;
    solValueUsd: string;
    tokens: SolanaTokenBalance[];
  } | null;
}

export interface EvmNft {
  contractAddress: string;
  tokenId: string;
  name: string;
  description: string;
  imageUrl: string;
  collectionName: string;
  tokenType: string;
}

export interface SolanaNft {
  mint: string;
  name: string;
  description: string;
  imageUrl: string;
  collectionName: string;
}

export interface WalletNftsResponse {
  evm: Array<{ chain: string; nfts: EvmNft[] }>;
  solana: { nfts: SolanaNft[] } | null;
}

export interface WalletConfigStatus {
  alchemyKeySet: boolean;
  heliusKeySet: boolean;
  birdeyeKeySet: boolean;
  evmChains: string[];
  evmAddress: string | null;
  solanaAddress: string | null;
}

// ---------------------------------------------------------------------------
// secp256k1 helpers — pure Node crypto, no viem dependency
// ---------------------------------------------------------------------------

/**
 * Generate a random 32-byte private key suitable for secp256k1 (EVM).
 * Returns hex-encoded with 0x prefix.
 */
function generateEvmPrivateKey(): string {
  const key = crypto.randomBytes(32);
  return `0x${key.toString("hex")}`;
}

/**
 * Derive an Ethereum address from a hex private key.
 * Uses Node's built-in crypto (ECDH with secp256k1).
 */
export function deriveEvmAddress(privateKeyHex: string): string {
  const cleaned = privateKeyHex.startsWith("0x") ? privateKeyHex.slice(2) : privateKeyHex;
  const ecdh = crypto.createECDH("secp256k1");
  ecdh.setPrivateKey(Buffer.from(cleaned, "hex"));
  // Uncompressed public key is 65 bytes (04 + x + y). Drop the 04 prefix.
  const pubUncompressed = ecdh.getPublicKey();
  const pubNoPrefix = pubUncompressed.subarray(1); // drop 0x04
  // Ethereum address = last 20 bytes of keccak-256 hash of the public key.
  // Node's sha3-256 is FIPS-202 SHA-3, NOT keccak-256 (different padding).
  // We use our own keccak-256 implementation below.
  const keccakHash = keccak256(pubNoPrefix);
  const address = `0x${keccakHash.subarray(12).toString("hex")}`;
  return toChecksumAddress(address);
}

// ---------------------------------------------------------------------------
// Keccak-256 (minimal implementation)
// ---------------------------------------------------------------------------

const KECCAK_ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

const ROTATION_OFFSETS = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

function keccak256(data: Buffer | Uint8Array): Buffer {
  // Keccak-256: rate = 1088 bits (136 bytes), capacity = 512 bits, output = 256 bits
  const rate = 136;
  const outputLen = 32;

  // State: 5x5 matrix of 64-bit words
  const state: bigint[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0n));

  // Pad: Keccak uses 0x01 padding (NOT SHA-3's 0x06)
  const padded = keccakPad(data, rate);

  // Absorb
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate / 8; i++) {
      const x = i % 5;
      const y = Math.floor(i / 5);
      const word = readUint64LE(padded, offset + i * 8);
      state[x][y] ^= word;
    }
    keccakF1600(state);
  }

  // Squeeze
  const output = Buffer.alloc(outputLen);
  for (let i = 0; i < outputLen / 8; i++) {
    const x = i % 5;
    const y = Math.floor(i / 5);
    writeUint64LE(output, i * 8, state[x][y]);
  }
  return output;
}

function keccakPad(data: Buffer | Uint8Array, rate: number): Buffer {
  const q = rate - (data.length % rate);
  const padded = Buffer.alloc(data.length + q);
  padded.set(data);
  // Keccak padding: first pad byte = 0x01, last pad byte |= 0x80
  padded[data.length] = 0x01;
  padded[padded.length - 1] |= 0x80;
  return padded;
}

function readUint64LE(buf: Buffer | Uint8Array, offset: number): bigint {
  let val = 0n;
  for (let i = 0; i < 8; i++) {
    val |= BigInt(buf[offset + i]) << BigInt(i * 8);
  }
  return val;
}

function writeUint64LE(buf: Buffer, offset: number, val: bigint): void {
  for (let i = 0; i < 8; i++) {
    buf[offset + i] = Number((val >> BigInt(i * 8)) & 0xffn);
  }
}

function keccakF1600(state: bigint[][]): void {
  const mask64 = (1n << 64n) - 1n;
  for (let round = 0; round < 24; round++) {
    // θ step
    const c: bigint[] = [];
    for (let x = 0; x < 5; x++) {
      c[x] = state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4];
    }
    const d: bigint[] = [];
    for (let x = 0; x < 5; x++) {
      d[x] = c[(x + 4) % 5] ^ rot64(c[(x + 1) % 5], 1, mask64);
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[x][y] = (state[x][y] ^ d[x]) & mask64;
      }
    }
    // ρ and π steps
    const b: bigint[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0n));
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        b[y][(2 * x + 3 * y) % 5] = rot64(state[x][y], ROTATION_OFFSETS[x][y], mask64);
      }
    }
    // χ step
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[x][y] = (b[x][y] ^ ((~b[(x + 1) % 5][y] & mask64) & b[(x + 2) % 5][y])) & mask64;
      }
    }
    // ι step
    state[0][0] = (state[0][0] ^ KECCAK_ROUND_CONSTANTS[round]) & mask64;
  }
}

function rot64(val: bigint, shift: number, mask: bigint): bigint {
  const s = shift % 64;
  if (s === 0) return val;
  return ((val << BigInt(s)) | (val >> BigInt(64 - s))) & mask;
}

function toChecksumAddress(address: string): string {
  const addr = address.toLowerCase().replace("0x", "");
  const hashBuf = keccak256(Buffer.from(addr, "utf8"));
  const hashHex = hashBuf.toString("hex");
  let checksummed = "0x";
  for (let i = 0; i < 40; i++) {
    if (Number.parseInt(hashHex[i], 16) >= 8) {
      checksummed += addr[i].toUpperCase();
    } else {
      checksummed += addr[i];
    }
  }
  return checksummed;
}

// ---------------------------------------------------------------------------
// Ed25519 helpers — Solana uses Ed25519, which Node crypto supports natively
// ---------------------------------------------------------------------------

/**
 * Generate a Solana keypair using Node's Ed25519 support.
 * Returns { privateKey (base58), publicKey (base58) }.
 */
function generateSolanaKeypair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  // Export raw bytes
  const privBytes = privateKey.export({ type: "pkcs8", format: "der" });
  const pubBytes = publicKey.export({ type: "spki", format: "der" });
  // Ed25519 PKCS8 DER: the raw 32-byte seed starts at offset 16
  const seed = (privBytes as Buffer).subarray(16, 48);
  // Ed25519 SPKI DER: the raw 32-byte public key starts at offset 12
  const pubRaw = (pubBytes as Buffer).subarray(12, 44);
  // Solana uses a 64-byte "secret key" = seed (32) + public key (32)
  const solanaSecret = Buffer.concat([seed, pubRaw]);
  return {
    privateKey: base58Encode(solanaSecret),
    publicKey: base58Encode(pubRaw),
  };
}

/**
 * Derive a Solana public address (base58) from a base58-encoded secret key.
 */
export function deriveSolanaAddress(privateKeyBase58: string): string {
  const secretBytes = base58Decode(privateKeyBase58);
  // Solana secret key is 64 bytes: 32-byte seed + 32-byte public key
  if (secretBytes.length === 64) {
    return base58Encode(secretBytes.subarray(32));
  }
  // If it's just a 32-byte seed, derive the public key
  if (secretBytes.length === 32) {
    const keyObj = crypto.createPrivateKey({
      key: Buffer.concat([
        // Ed25519 PKCS8 DER prefix
        Buffer.from("302e020100300506032b657004220420", "hex"),
        secretBytes,
      ]),
      format: "der",
      type: "pkcs8",
    });
    const pubKey = crypto.createPublicKey(keyObj);
    const pubDer = pubKey.export({ type: "spki", format: "der" }) as Buffer;
    return base58Encode(pubDer.subarray(12, 44));
  }
  throw new Error(`Invalid Solana secret key length: ${secretBytes.length}`);
}

// ---------------------------------------------------------------------------
// Base58 (Bitcoin alphabet)
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(data: Buffer | Uint8Array): string {
  let num = BigInt(`0x${Buffer.from(data).toString("hex")}`);
  const chars: string[] = [];
  while (num > 0n) {
    const [div, mod] = [num / 58n, num % 58n];
    chars.unshift(BASE58_ALPHABET[Number(mod)]);
    num = div;
  }
  // Preserve leading zeros
  for (const byte of data) {
    if (byte === 0) chars.unshift("1");
    else break;
  }
  return chars.join("") || "1";
}

function base58Decode(str: string): Buffer {
  if (str.length === 0) return Buffer.alloc(0);
  let num = 0n;
  for (const char of str) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base58 character: ${char}`);
    num = num * 58n + BigInt(idx);
  }
  const hex = num.toString(16).padStart(2, "0");
  const bytes = Buffer.from(hex.length % 2 ? `0${hex}` : hex, "hex");
  // Restore leading zeros
  let leadingZeros = 0;
  for (const char of str) {
    if (char === "1") leadingZeros++;
    else break;
  }
  if (leadingZeros > 0) {
    return Buffer.concat([Buffer.alloc(leadingZeros), bytes]);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Types — chain selection + import
// ---------------------------------------------------------------------------

/** Supported blockchain chains for wallet operations. */
export type WalletChain = "evm" | "solana";

/** Result of a key validation check. */
export interface KeyValidationResult {
  valid: boolean;
  chain: WalletChain;
  address: string | null;
  error: string | null;
}

/** Result of a wallet import operation. */
export interface WalletImportResult {
  success: boolean;
  chain: WalletChain;
  address: string | null;
  error: string | null;
}

/** Result of a single-chain wallet generation. */
export interface WalletGenerateResult {
  chain: WalletChain;
  address: string;
  privateKey: string;
}

// ---------------------------------------------------------------------------
// Key validation
// ---------------------------------------------------------------------------

/** Hex character regex (without 0x prefix). */
const HEX_RE = /^[0-9a-fA-F]+$/;

/**
 * Validate an EVM private key string.
 *
 * A valid EVM private key is a 32-byte hex string, optionally prefixed
 * with "0x". It must also produce a valid secp256k1 public key.
 */
export function validateEvmPrivateKey(key: string): KeyValidationResult {
  const cleaned = key.startsWith("0x") ? key.slice(2) : key;

  if (cleaned.length !== 64) {
    return { valid: false, chain: "evm", address: null, error: "EVM private key must be 64 hex characters (32 bytes)" };
  }

  if (!HEX_RE.test(cleaned)) {
    return { valid: false, chain: "evm", address: null, error: "EVM private key contains invalid hex characters" };
  }

  try {
    const address = deriveEvmAddress(key);
    return { valid: true, chain: "evm", address, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, chain: "evm", address: null, error: `Failed to derive EVM address: ${msg}` };
  }
}

/**
 * Validate a Solana private key string (base58-encoded).
 *
 * A valid Solana secret key is either 64 bytes (seed + public key) or
 * 32 bytes (seed only), encoded in base58.
 */
export function validateSolanaPrivateKey(key: string): KeyValidationResult {
  try {
    const bytes = base58Decode(key);

    if (bytes.length !== 64 && bytes.length !== 32) {
      return {
        valid: false,
        chain: "solana",
        address: null,
        error: `Solana secret key must be 32 or 64 bytes, got ${bytes.length}`,
      };
    }

    const address = deriveSolanaAddress(key);
    return { valid: true, chain: "solana", address, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, chain: "solana", address: null, error: `Invalid Solana private key: ${msg}` };
  }
}

/**
 * Auto-detect chain and validate a private key.
 *
 * Heuristic: if the key starts with "0x" or is 64-char hex, treat as EVM.
 * Otherwise, treat as Solana (base58).
 */
export function validatePrivateKey(key: string): KeyValidationResult {
  const trimmed = key.trim();

  // EVM keys: "0x" prefix or 64-char pure hex
  if (trimmed.startsWith("0x") || (trimmed.length === 64 && HEX_RE.test(trimmed))) {
    return validateEvmPrivateKey(trimmed);
  }

  // Otherwise, try Solana
  return validateSolanaPrivateKey(trimmed);
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/**
 * Generate fresh EVM + Solana wallet keypairs.
 * Uses only Node built-in crypto — no external dependencies.
 */
export function generateWalletKeys(): WalletKeys {
  const evmPrivateKey = generateEvmPrivateKey();
  const evmAddress = deriveEvmAddress(evmPrivateKey);

  const solana = generateSolanaKeypair();

  return {
    evmPrivateKey,
    evmAddress,
    solanaPrivateKey: solana.privateKey,
    solanaAddress: solana.publicKey,
  };
}

/**
 * Generate a wallet for a specific chain.
 *
 * Unlike {@link generateWalletKeys} which creates both, this function
 * creates a keypair for a single chain only. Useful when the user
 * wants to add only one chain.
 */
export function generateWalletForChain(chain: WalletChain): WalletGenerateResult {
  if (chain === "evm") {
    const privateKey = generateEvmPrivateKey();
    const address = deriveEvmAddress(privateKey);
    return { chain, address, privateKey };
  }

  const solana = generateSolanaKeypair();
  return { chain: "solana", address: solana.publicKey, privateKey: solana.privateKey };
}

/**
 * Import a wallet by validating and storing a private key.
 *
 * Validates the key format, derives the address, and stores the key
 * in `process.env` (the canonical runtime secret store). Does NOT
 * write to disk — the caller is responsible for persisting to config.env
 * if desired.
 *
 * @returns Import result with the derived address or an error.
 */
export function importWallet(chain: WalletChain, privateKey: string): WalletImportResult {
  const trimmed = privateKey.trim();

  if (chain === "evm") {
    const validation = validateEvmPrivateKey(trimmed);
    if (!validation.valid) {
      return { success: false, chain, address: null, error: validation.error };
    }

    const normalized = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
    process.env.EVM_PRIVATE_KEY = normalized;
    logger.info(`[wallet] Imported EVM wallet: ${validation.address}`);
    return { success: true, chain, address: validation.address, error: null };
  }

  // Solana
  const validation = validateSolanaPrivateKey(trimmed);
  if (!validation.valid) {
    return { success: false, chain, address: null, error: validation.error };
  }

  process.env.SOLANA_PRIVATE_KEY = trimmed;
  logger.info(`[wallet] Imported Solana wallet: ${validation.address}`);
  return { success: true, chain, address: validation.address, error: null };
}

/**
 * Retrieve wallet addresses from process.env (or the given config env).
 * Does NOT require a running runtime.
 */
export function getWalletAddresses(): WalletAddresses {
  let evmAddress: string | null = null;
  let solanaAddress: string | null = null;

  const evmKey = process.env.EVM_PRIVATE_KEY;
  if (evmKey) {
    try {
      evmAddress = deriveEvmAddress(evmKey);
    } catch (err) {
      logger.warn(`Failed to derive EVM address: ${err}`);
    }
  }

  const solKey = process.env.SOLANA_PRIVATE_KEY;
  if (solKey) {
    try {
      solanaAddress = deriveSolanaAddress(solKey);
    } catch (err) {
      logger.warn(`Failed to derive Solana address: ${err}`);
    }
  }

  return { evmAddress, solanaAddress };
}

// ---------------------------------------------------------------------------
// Alchemy API helpers (EVM tokens + NFTs)
// ---------------------------------------------------------------------------

interface AlchemyTokenBalanceResult {
  contractAddress: string;
  tokenBalance: string;
}

interface AlchemyTokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  logo: string | null;
}

/**
 * Fetch EVM token balances for all configured chains via Alchemy.
 */
export async function fetchEvmBalances(
  address: string,
  alchemyKey: string,
): Promise<EvmChainBalance[]> {
  // Fetch all chains in parallel — they are independent API endpoints.
  const results = await Promise.all(
    DEFAULT_EVM_CHAINS.map(async (chain): Promise<EvmChainBalance> => {
      try {
        const baseUrl = `https://${chain.subdomain}.g.alchemy.com/v2/${alchemyKey}`;
        const fetchOpts = (body: string): RequestInit => ({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          body,
        });

        // Fetch native balance
        const nativeRes = await fetch(baseUrl, fetchOpts(JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"],
        })));
        const nativeData = await nativeRes.json() as { result?: string };
        const nativeWei = nativeData.result ? BigInt(nativeData.result) : 0n;
        const nativeBalance = formatWei(nativeWei, 18);

        // Fetch ERC-20 token balances
        const tokenRes = await fetch(baseUrl, fetchOpts(JSON.stringify({
          jsonrpc: "2.0", id: 2, method: "alchemy_getTokenBalances", params: [address, "DEFAULT_TOKENS"],
        })));
        const tokenData = await tokenRes.json() as {
          result?: { tokenBalances?: AlchemyTokenBalanceResult[] };
        };

        const nonZeroTokens = (tokenData.result?.tokenBalances ?? []).filter(
          (t) => t.tokenBalance && t.tokenBalance !== "0x0" && t.tokenBalance !== "0x"
        );

        // Fetch metadata for non-zero tokens in parallel (capped at 50)
        const metaResults = await Promise.allSettled(
          nonZeroTokens.slice(0, 50).map(async (token): Promise<EvmTokenBalance> => {
            const metaRes = await fetch(baseUrl, fetchOpts(JSON.stringify({
              jsonrpc: "2.0", id: 3, method: "alchemy_getTokenMetadata", params: [token.contractAddress],
            })));
            const metaData = await metaRes.json() as { result?: AlchemyTokenMetadata };
            const meta = metaData.result;
            const rawBalance = BigInt(token.tokenBalance);
            const decimals = meta?.decimals ?? 18;
            return {
              symbol: meta?.symbol ?? "???",
              name: meta?.name ?? "Unknown Token",
              contractAddress: token.contractAddress,
              balance: formatWei(rawBalance, decimals),
              decimals,
              valueUsd: "0",
              logoUrl: meta?.logo ?? "",
            };
          }),
        );
        const tokens = metaResults
          .filter((r): r is PromiseFulfilledResult<EvmTokenBalance> => r.status === "fulfilled")
          .map((r) => r.value);

        return {
          chain: chain.name,
          chainId: chain.chainId,
          nativeBalance,
          nativeSymbol: chain.nativeSymbol,
          nativeValueUsd: "0",
          tokens,
        };
      } catch (err) {
        logger.warn(`Failed to fetch EVM balances for ${chain.name}: ${err}`);
        return {
          chain: chain.name,
          chainId: chain.chainId,
          nativeBalance: "0",
          nativeSymbol: chain.nativeSymbol,
          nativeValueUsd: "0",
          tokens: [],
        };
      }
    }),
  );

  return results;
}

/**
 * Fetch EVM NFTs for all configured chains via Alchemy NFT API v3.
 */
export async function fetchEvmNfts(
  address: string,
  alchemyKey: string,
): Promise<Array<{ chain: string; nfts: EvmNft[] }>> {
  // Fetch all chains in parallel — they are independent API endpoints.
  const results = await Promise.all(
    DEFAULT_EVM_CHAINS.map(async (chain): Promise<{ chain: string; nfts: EvmNft[] }> => {
      try {
        const url = `https://${chain.subdomain}.g.alchemy.com/nft/v3/${alchemyKey}/getNFTsForOwner?owner=${address}&withMetadata=true&pageSize=50`;
        const nftRes = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        const data = await nftRes.json() as {
          ownedNfts?: Array<{
            contract?: { address?: string; name?: string; openSeaMetadata?: { collectionName?: string } };
            tokenId?: string;
            name?: string;
            description?: string;
            image?: { cachedUrl?: string; thumbnailUrl?: string; originalUrl?: string };
            tokenType?: string;
          }>;
        };

        const nfts: EvmNft[] = (data.ownedNfts ?? []).map((nft) => ({
          contractAddress: nft.contract?.address ?? "",
          tokenId: nft.tokenId ?? "",
          name: nft.name ?? "Untitled",
          description: (nft.description ?? "").slice(0, 200),
          imageUrl: nft.image?.cachedUrl ?? nft.image?.thumbnailUrl ?? nft.image?.originalUrl ?? "",
          collectionName: nft.contract?.openSeaMetadata?.collectionName ?? nft.contract?.name ?? "",
          tokenType: nft.tokenType ?? "ERC721",
        }));

        return { chain: chain.name, nfts };
      } catch (err) {
        logger.warn(`Failed to fetch EVM NFTs for ${chain.name}: ${err}`);
        return { chain: chain.name, nfts: [] };
      }
    }),
  );

  return results;
}

// ---------------------------------------------------------------------------
// Helius API helpers (Solana tokens + NFTs)
// ---------------------------------------------------------------------------

interface HeliusAsset {
  id: string;
  interface: string;
  content?: {
    metadata?: { name?: string; symbol?: string; description?: string };
    links?: { image?: string };
    json_uri?: string;
  };
  token_info?: {
    balance?: number;
    decimals?: number;
    price_info?: { total_price?: number; price_per_token?: number };
    symbol?: string;
  };
  grouping?: Array<{ group_key?: string; group_value?: string; collection_metadata?: { name?: string } }>;
}

interface HeliusGetAssetsByOwnerResponse {
  result?: {
    items?: HeliusAsset[];
    total?: number;
  };
}

/**
 * Fetch Solana token balances via Helius DAS getAssetsByOwner.
 */
export async function fetchSolanaBalances(
  address: string,
  heliusKey: string,
): Promise<{
  solBalance: string;
  solValueUsd: string;
  tokens: SolanaTokenBalance[];
}> {
  const url = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;

  // Fetch SOL balance via standard RPC
  let solBalance = "0";
  try {
    const solRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [address],
      }),
    });
    const solData = await solRes.json() as { result?: { value?: number } };
    const lamports = solData.result?.value ?? 0;
    solBalance = (lamports / 1e9).toFixed(9);
  } catch (err) {
    logger.warn(`Failed to fetch SOL balance: ${err}`);
  }

  // Fetch fungible tokens via DAS
  const tokens: SolanaTokenBalance[] = [];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "getAssetsByOwner",
        params: {
          ownerAddress: address,
          displayOptions: {
            showFungible: true,
            showNativeBalance: true,
          },
          page: 1,
          limit: 100,
        },
      }),
    });
    const data = await res.json() as HeliusGetAssetsByOwnerResponse;
    const items = data.result?.items ?? [];

    for (const item of items) {
      // Only include fungible tokens
      if (item.interface !== "FungibleToken" && item.interface !== "FungibleAsset") {
        continue;
      }
      const decimals = item.token_info?.decimals ?? 0;
      const rawBalance = item.token_info?.balance ?? 0;
      const balance = decimals > 0 ? (rawBalance / 10 ** decimals).toString() : rawBalance.toString();
      const valueUsd = item.token_info?.price_info?.total_price?.toFixed(2) ?? "0";

      tokens.push({
        symbol: item.token_info?.symbol ?? item.content?.metadata?.symbol ?? "???",
        name: item.content?.metadata?.name ?? "Unknown",
        mint: item.id,
        balance,
        decimals,
        valueUsd,
        logoUrl: item.content?.links?.image ?? "",
      });
    }
  } catch (err) {
    logger.warn(`Failed to fetch Solana token balances: ${err}`);
  }

  return { solBalance, solValueUsd: "0", tokens };
}

/**
 * Fetch Solana NFTs via Helius DAS getAssetsByOwner.
 */
export async function fetchSolanaNfts(
  address: string,
  heliusKey: string,
): Promise<SolanaNft[]> {
  const url = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAssetsByOwner",
        params: {
          ownerAddress: address,
          displayOptions: {
            showFungible: false,
          },
          page: 1,
          limit: 100,
        },
      }),
    });
    const data = await res.json() as HeliusGetAssetsByOwnerResponse;
    const items = data.result?.items ?? [];

    return items
      .filter((item) =>
        item.interface === "V1_NFT" ||
        item.interface === "ProgrammableNFT" ||
        item.interface === "V2_NFT"
      )
      .map((item) => {
        const collection = item.grouping?.find((g) => g.group_key === "collection");
        return {
          mint: item.id,
          name: item.content?.metadata?.name ?? "Untitled",
          description: (item.content?.metadata?.description ?? "").slice(0, 200),
          imageUrl: item.content?.links?.image ?? "",
          collectionName: collection?.collection_metadata?.name ?? "",
        };
      });
  } catch (err) {
    logger.warn(`Failed to fetch Solana NFTs: ${err}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function formatWei(wei: bigint, decimals: number): string {
  if (wei === 0n) return "0";
  if (wei < 0n) return "0"; // Guard: balances should never be negative
  if (decimals <= 0) return wei.toString();
  const divisor = 10n ** BigInt(decimals);
  const whole = wei / divisor;
  const remainder = wei % divisor;
  if (remainder === 0n) return whole.toString();
  const fracStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

/**
 * Mask a sensitive string for display: show first 4 and last 4 characters.
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
