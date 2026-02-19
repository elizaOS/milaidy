/**
 * Wallet key generation, address derivation, and balance/NFT fetching.
 * Uses Node crypto primitives (no viem/@solana/web3.js dependency).
 * Balance data from Alchemy/Ankr (EVM), NodeReal/QuickNode (BSC RPC),
 * and Helius (Solana) REST APIs.
 */
import crypto from "node:crypto";
import { logger } from "@elizaos/core";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import type {
  BscTradePreflightRequest,
  BscTradePreflightResponse,
  BscTradeExecuteRequest,
  BscTradeExecuteResponse,
  BscTradeExecutionResult,
  BscUnsignedApprovalTx,
  BscTradeQuoteRequest,
  BscTradeQuoteResponse,
  BscTradeSide,
  BscUnsignedTradeTx,
  EvmChainBalance,
  EvmNft,
  EvmTokenBalance,
  KeyValidationResult,
  SolanaNft,
  SolanaTokenBalance,
  WalletAddresses,
  WalletChain,
  WalletGenerateResult,
  WalletImportResult,
  WalletKeys,
} from "../contracts/wallet.js";

export type {
  BscTradePreflightRequest,
  BscTradePreflightResponse,
  BscTradeExecuteRequest,
  BscTradeExecuteResponse,
  BscTradeExecutionResult,
  BscUnsignedApprovalTx,
  BscTradeQuoteRequest,
  BscTradeQuoteResponse,
  BscTradeSide,
  BscUnsignedTradeTx,
  EvmChainBalance,
  EvmNft,
  EvmTokenBalance,
  KeyValidationResult,
  SolanaNft,
  SolanaTokenBalance,
  WalletAddresses,
  WalletBalancesResponse,
  WalletChain,
  WalletConfigStatus,
  WalletGenerateResult,
  WalletImportResult,
  WalletKeys,
  WalletNftsResponse,
} from "../contracts/wallet.js";

const FETCH_TIMEOUT_MS = 15_000;
export const MANAGED_EVM_ADDRESS_ENV_KEY = "MILADY_MANAGED_EVM_ADDRESS";
export const MANAGED_SOLANA_ADDRESS_ENV_KEY = "MILADY_MANAGED_SOLANA_ADDRESS";

type EvmChainProvider = "alchemy" | "ankr";

interface EvmChainConfig {
  name: string;
  subdomain: string;
  chainId: number;
  nativeSymbol: string;
  provider: EvmChainProvider;
  ankrChain?: string;
}

export interface EvmProviderKeys {
  alchemyKey?: string | null;
  ankrKey?: string | null;
  nodeRealBscRpcUrl?: string | null;
  quickNodeBscRpcUrl?: string | null;
}

export const DEFAULT_EVM_CHAINS: readonly EvmChainConfig[] = [
  {
    name: "Ethereum",
    subdomain: "eth-mainnet",
    chainId: 1,
    nativeSymbol: "ETH",
    provider: "alchemy",
  },
  {
    name: "Base",
    subdomain: "base-mainnet",
    chainId: 8453,
    nativeSymbol: "ETH",
    provider: "alchemy",
  },
  {
    name: "Arbitrum",
    subdomain: "arb-mainnet",
    chainId: 42161,
    nativeSymbol: "ETH",
    provider: "alchemy",
  },
  {
    name: "Optimism",
    subdomain: "opt-mainnet",
    chainId: 10,
    nativeSymbol: "ETH",
    provider: "alchemy",
  },
  {
    name: "Polygon",
    subdomain: "polygon-mainnet",
    chainId: 137,
    nativeSymbol: "POL",
    provider: "alchemy",
  },
  {
    // Ankr handles BSC token + NFT inventory APIs.
    name: "BSC",
    subdomain: "bsc-mainnet",
    chainId: 56,
    nativeSymbol: "BNB",
    provider: "ankr",
    ankrChain: "bsc",
  },
] as const;

// EVM key derivation (secp256k1 via Node ECDH + keccak-256)

function generateEvmPrivateKey(): string {
  return `0x${crypto.randomBytes(32).toString("hex")}`;
}

export function deriveEvmAddress(privateKeyHex: string): string {
  const cleaned = privateKeyHex.startsWith("0x")
    ? privateKeyHex.slice(2)
    : privateKeyHex;
  // Use @noble/curves — works in Node, Bun, and browsers.
  // (Node's crypto.createECDH("secp256k1") fails in Bun due to BoringSSL.)
  const pubKey = secp256k1.getPublicKey(Buffer.from(cleaned, "hex"), false); // uncompressed (65 bytes)
  const pubNoPrefix = pubKey.subarray(1); // drop the 04 prefix
  // Ethereum address = last 20 bytes of keccak-256(pubkey).
  const hash = keccak256(pubNoPrefix);
  return toChecksumAddress(`0x${hash.subarray(12).toString("hex")}`);
}

// Keccak-256 (minimal sponge implementation)

const RC = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
];

const ROT = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

function keccak256(data: Buffer | Uint8Array): Buffer {
  const rate = 136; // 1088 bits
  const state: bigint[][] = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => 0n),
  );

  // Keccak padding (0x01, NOT SHA-3's 0x06)
  const q = rate - (data.length % rate);
  const padded = Buffer.alloc(data.length + q);
  padded.set(data);
  padded[data.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  // Absorb
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let w = 0n;
      for (let b = 0; b < 8; b++)
        w |= BigInt(padded[off + i * 8 + b]) << BigInt(b * 8);
      state[i % 5][Math.floor(i / 5)] ^= w;
    }
    keccakF1600(state);
  }

  // Squeeze (32 bytes)
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) {
    const v = state[i % 5][Math.floor(i / 5)];
    for (let b = 0; b < 8; b++)
      out[i * 8 + b] = Number((v >> BigInt(b * 8)) & 0xffn);
  }
  return out;
}

function keccakF1600(state: bigint[][]): void {
  const M = (1n << 64n) - 1n;
  const rot = (v: bigint, s: number) =>
    s === 0 ? v : ((v << BigInt(s)) | (v >> BigInt(64 - s))) & M;

  for (let round = 0; round < 24; round++) {
    // theta
    const c: bigint[] = [];
    for (let x = 0; x < 5; x++)
      c[x] =
        state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4];
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rot(c[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y++) state[x][y] = (state[x][y] ^ d) & M;
    }
    // rho + pi
    const b: bigint[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => 0n),
    );
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        b[y][(2 * x + 3 * y) % 5] = rot(state[x][y], ROT[x][y]);
    // chi
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++)
        state[x][y] =
          (b[x][y] ^ (~b[(x + 1) % 5][y] & M & b[(x + 2) % 5][y])) & M;
    // iota
    state[0][0] = (state[0][0] ^ RC[round]) & M;
  }
}

function toChecksumAddress(address: string): string {
  const addr = address.toLowerCase().replace("0x", "");
  const hash = keccak256(Buffer.from(addr, "utf8")).toString("hex");
  let out = "0x";
  for (let i = 0; i < 40; i++)
    out += Number.parseInt(hash[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i];
  return out;
}

// Solana key derivation (Ed25519 via Node crypto)

function generateSolanaKeypair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const privBytes = privateKey.export({ type: "pkcs8", format: "der" });
  const pubBytes = publicKey.export({ type: "spki", format: "der" });
  // Ed25519 PKCS8 DER: raw 32-byte seed at offset 16; SPKI DER: raw 32-byte pubkey at offset 12
  const seed = (privBytes as Buffer).subarray(16, 48);
  const pubRaw = (pubBytes as Buffer).subarray(12, 44);
  // Solana secret key = seed(32) + pubkey(32)
  return {
    privateKey: base58Encode(Buffer.concat([seed, pubRaw])),
    publicKey: base58Encode(pubRaw),
  };
}

export function deriveSolanaAddress(privateKeyBase58: string): string {
  const secretBytes = base58Decode(privateKeyBase58);
  if (secretBytes.length === 64) return base58Encode(secretBytes.subarray(32));
  if (secretBytes.length === 32) {
    // Derive pubkey from 32-byte seed
    const keyObj = crypto.createPrivateKey({
      key: Buffer.concat([
        Buffer.from("302e020100300506032b657004220420", "hex"),
        secretBytes,
      ]),
      format: "der",
      type: "pkcs8",
    });
    const pubDer = crypto
      .createPublicKey(keyObj)
      .export({ type: "spki", format: "der" }) as Buffer;
    return base58Encode(pubDer.subarray(12, 44));
  }
  throw new Error(`Invalid Solana secret key length: ${secretBytes.length}`);
}

// Base58 (Bitcoin alphabet)

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(data: Buffer | Uint8Array): string {
  let num = BigInt(`0x${Buffer.from(data).toString("hex")}`);
  const chars: string[] = [];
  while (num > 0n) {
    chars.unshift(B58[Number(num % 58n)]);
    num /= 58n;
  }
  for (const byte of data) {
    if (byte === 0) chars.unshift("1");
    else break;
  }
  return chars.join("") || "1";
}

function base58Decode(str: string): Buffer {
  if (str.length === 0) return Buffer.alloc(0);
  let num = 0n;
  for (const c of str) {
    const i = B58.indexOf(c);
    if (i === -1) throw new Error(`Invalid base58: ${c}`);
    num = num * 58n + BigInt(i);
  }
  const hex = num.toString(16).padStart(2, "0");
  const bytes = Buffer.from(hex.length % 2 ? `0${hex}` : hex, "hex");
  let zeros = 0;
  for (const c of str) {
    if (c === "1") zeros++;
    else break;
  }
  return zeros > 0 ? Buffer.concat([Buffer.alloc(zeros), bytes]) : bytes;
}

// Key validation

const HEX_RE = /^[0-9a-fA-F]+$/;

export function validateEvmPrivateKey(key: string): KeyValidationResult {
  const cleaned = key.startsWith("0x") ? key.slice(2) : key;
  if (cleaned.length !== 64)
    return {
      valid: false,
      chain: "evm",
      address: null,
      error: "Must be 64 hex characters",
    };
  if (!HEX_RE.test(cleaned))
    return {
      valid: false,
      chain: "evm",
      address: null,
      error: "Invalid hex characters",
    };
  try {
    return {
      valid: true,
      chain: "evm",
      address: deriveEvmAddress(key),
      error: null,
    };
  } catch (err) {
    return {
      valid: false,
      chain: "evm",
      address: null,
      error: `Derivation failed: ${err instanceof Error ? err.message : err}`,
    };
  }
}

export function validateSolanaPrivateKey(key: string): KeyValidationResult {
  try {
    const bytes = base58Decode(key);
    if (bytes.length !== 64 && bytes.length !== 32) {
      return {
        valid: false,
        chain: "solana",
        address: null,
        error: `Must be 32 or 64 bytes, got ${bytes.length}`,
      };
    }
    return {
      valid: true,
      chain: "solana",
      address: deriveSolanaAddress(key),
      error: null,
    };
  } catch (err) {
    return {
      valid: false,
      chain: "solana",
      address: null,
      error: `Invalid key: ${err instanceof Error ? err.message : err}`,
    };
  }
}

/** Auto-detect chain from key format and validate. */
export function validatePrivateKey(key: string): KeyValidationResult {
  const trimmed = key.trim();
  if (
    trimmed.startsWith("0x") ||
    (trimmed.length === 64 && HEX_RE.test(trimmed))
  )
    return validateEvmPrivateKey(trimmed);
  return validateSolanaPrivateKey(trimmed);
}

/** Mask a secret string for safe display (e.g. logs, UI). */
export function maskSecret(value: string): string {
  if (!value || value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

// Key generation

export function generateWalletKeys(): WalletKeys {
  const evmPrivateKey = generateEvmPrivateKey();
  const solana = generateSolanaKeypair();
  return {
    evmPrivateKey,
    evmAddress: deriveEvmAddress(evmPrivateKey),
    solanaPrivateKey: solana.privateKey,
    solanaAddress: solana.publicKey,
  };
}

export function generateWalletForChain(
  chain: WalletChain,
): WalletGenerateResult {
  if (chain === "evm") {
    const pk = generateEvmPrivateKey();
    return { chain, address: deriveEvmAddress(pk), privateKey: pk };
  }
  const sol = generateSolanaKeypair();
  return {
    chain: "solana",
    address: sol.publicKey,
    privateKey: sol.privateKey,
  };
}

/** Validate key, store in process.env. Caller persists to config if needed. */
export function importWallet(
  chain: WalletChain,
  privateKey: string,
): WalletImportResult {
  const trimmed = privateKey.trim();
  if (chain === "evm") {
    const v = validateEvmPrivateKey(trimmed);
    if (!v.valid)
      return { success: false, chain, address: null, error: v.error };
    process.env.EVM_PRIVATE_KEY = trimmed.startsWith("0x")
      ? trimmed
      : `0x${trimmed}`;
    logger.info(`[wallet] Imported EVM wallet: ${v.address}`);
    return { success: true, chain, address: v.address, error: null };
  }
  const v = validateSolanaPrivateKey(trimmed);
  if (!v.valid) return { success: false, chain, address: null, error: v.error };
  process.env.SOLANA_PRIVATE_KEY = trimmed;
  logger.info(`[wallet] Imported Solana wallet: ${v.address}`);
  return { success: true, chain, address: v.address, error: null };
}

/** Derive addresses from env keys. Works without a running runtime. */
export function getWalletAddresses(): WalletAddresses {
  let evmAddress: string | null = null;
  let solanaAddress: string | null = null;
  const evmKey = process.env.EVM_PRIVATE_KEY;
  if (evmKey) {
    try {
      evmAddress = deriveEvmAddress(evmKey);
    } catch (e) {
      logger.warn(`Bad EVM key: ${e}`);
    }
  }
  const solKey = process.env.SOLANA_PRIVATE_KEY;
  if (solKey) {
    try {
      solanaAddress = deriveSolanaAddress(solKey);
    } catch (e) {
      logger.warn(`Bad SOL key: ${e}`);
    }
  }

  if (!evmAddress) {
    const managedEvmAddress = process.env[MANAGED_EVM_ADDRESS_ENV_KEY];
    if (managedEvmAddress) {
      const trimmed = managedEvmAddress.trim();
      if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
        evmAddress = trimmed;
      } else {
        logger.warn("Bad managed EVM address in env");
      }
    }
  }

  if (!solanaAddress) {
    const managedSolanaAddress = process.env[MANAGED_SOLANA_ADDRESS_ENV_KEY];
    if (managedSolanaAddress) {
      const trimmed = managedSolanaAddress.trim();
      try {
        const decoded = base58Decode(trimmed);
        if (decoded.length === 32) {
          solanaAddress = trimmed;
        } else {
          logger.warn("Bad managed Solana address in env");
        }
      } catch {
        logger.warn("Bad managed Solana address in env");
      }
    }
  }

  return { evmAddress, solanaAddress };
}

// EVM token + NFT APIs (Alchemy + Ankr)

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string;
}
interface AlchemyTokenMeta {
  name: string;
  symbol: string;
  decimals: number;
  logo: string | null;
}

interface AnkrTokenAsset {
  contractAddress?: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimals?: number | string;
  tokenType?: string;
  tokenBalance?: string | number;
  balance?: string | number;
  balanceRawInteger?: string | number;
  balanceUsd?: string | number;
  thumbnail?: string;
}

interface AnkrNftAsset {
  contractAddress?: string;
  tokenId?: string | number;
  name?: string;
  description?: string;
  imageUrl?: string;
  imagePreviewUrl?: string;
  imageOriginalUrl?: string;
  collectionName?: string;
  contractName?: string;
  tokenType?: string;
}

interface EvmProviderKeyset {
  alchemyKey: string | null;
  ankrKey: string | null;
  nodeRealBscRpcUrl: string | null;
  quickNodeBscRpcUrl: string | null;
}

/** Parse JSON from a fetch response. If the body isn't JSON, throw with the raw text. */
async function jsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.slice(0, 200) || "Invalid JSON");
  }
}

function normalizeApiKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveEvmProviderKeys(
  alchemyOrKeys: string | EvmProviderKeys | null | undefined,
  maybeAnkrKey?: string | null,
): EvmProviderKeyset {
  if (typeof alchemyOrKeys === "string" || alchemyOrKeys == null) {
    return {
      alchemyKey: normalizeApiKey(alchemyOrKeys),
      ankrKey: normalizeApiKey(maybeAnkrKey),
      nodeRealBscRpcUrl: normalizeApiKey(
        process.env.NODEREAL_BSC_RPC_URL ?? null,
      ),
      quickNodeBscRpcUrl: normalizeApiKey(
        process.env.QUICKNODE_BSC_RPC_URL ?? null,
      ),
    };
  }
  return {
    alchemyKey: normalizeApiKey(alchemyOrKeys.alchemyKey),
    ankrKey: normalizeApiKey(alchemyOrKeys.ankrKey ?? maybeAnkrKey),
    nodeRealBscRpcUrl: normalizeApiKey(
      alchemyOrKeys.nodeRealBscRpcUrl ?? process.env.NODEREAL_BSC_RPC_URL,
    ),
    quickNodeBscRpcUrl: normalizeApiKey(
      alchemyOrKeys.quickNodeBscRpcUrl ?? process.env.QUICKNODE_BSC_RPC_URL,
    ),
  };
}

function isBscChain(chain: EvmChainConfig): boolean {
  return chain.chainId === 56 || (chain.ankrChain ?? "").toLowerCase() === "bsc";
}

function describeRpcEndpoint(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "rpc";
  }
}

function makeEvmChainFailure(
  chain: EvmChainConfig,
  message: string,
): EvmChainBalance {
  return {
    chain: chain.name,
    chainId: chain.chainId,
    nativeBalance: "0",
    nativeSymbol: chain.nativeSymbol,
    nativeValueUsd: "0",
    tokens: [],
    error: message,
  };
}

function rpcJsonRequest(body: string): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    body,
  };
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function parseTokenDecimals(value: unknown, fallback = 18): number {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.trunc(num);
}

function parseUsdString(value: unknown): string {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(num) || num <= 0) return "0";
  return num.toFixed(2);
}

function parseAnkrBalance(asset: AnkrTokenAsset, decimals: number): string {
  const tokenBalance = asString(asset.tokenBalance);
  if (tokenBalance) {
    if (/^\d+$/.test(tokenBalance))
      return formatWei(BigInt(tokenBalance), decimals);
    return tokenBalance;
  }

  const displayBalance = asString(asset.balance);
  if (displayBalance) {
    if (/^\d+$/.test(displayBalance))
      return formatWei(BigInt(displayBalance), decimals);
    return displayBalance;
  }

  const rawBalance = asString(asset.balanceRawInteger);
  if (rawBalance && /^\d+$/.test(rawBalance))
    return formatWei(BigInt(rawBalance), decimals);

  return "0";
}

function isZeroBalance(balance: string): boolean {
  if (!balance) return true;
  if (/^0+(\.0+)?$/.test(balance)) return true;
  const parsed = Number.parseFloat(balance);
  return Number.isFinite(parsed) ? parsed <= 0 : false;
}

function isAnkrNativeAsset(asset: AnkrTokenAsset): boolean {
  const tokenType = (asset.tokenType ?? "").toUpperCase();
  const symbol = (asset.tokenSymbol ?? "").toUpperCase();
  const contract = (asset.contractAddress ?? "").toLowerCase();
  if (tokenType === "NATIVE") return true;
  return symbol === "BNB" && (!contract || contract === ZERO_ADDRESS);
}

async function fetchAlchemyChainBalances(
  chain: EvmChainConfig,
  address: string,
  alchemyKey: string,
): Promise<EvmChainBalance> {
  const url = `https://${chain.subdomain}.g.alchemy.com/v2/${alchemyKey}`;

  const nativeData = await jsonOrThrow<{ result?: string }>(
    await fetch(
      url,
      rpcJsonRequest(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: [address, "latest"],
        }),
      ),
    ),
  );
  const nativeBalance = formatWei(
    nativeData.result ? BigInt(nativeData.result) : 0n,
    18,
  );

  const tokenData = await jsonOrThrow<{
    result?: { tokenBalances?: AlchemyTokenBalance[] };
  }>(
    await fetch(
      url,
      rpcJsonRequest(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "alchemy_getTokenBalances",
          params: [address, "DEFAULT_TOKENS"],
        }),
      ),
    ),
  );
  const nonZero = (tokenData.result?.tokenBalances ?? []).filter(
    (t) =>
      t.tokenBalance && t.tokenBalance !== "0x0" && t.tokenBalance !== "0x",
  );

  const metaResults = await Promise.allSettled(
    nonZero.slice(0, 50).map(async (tok): Promise<EvmTokenBalance> => {
      const meta = (
        await jsonOrThrow<{ result?: AlchemyTokenMeta }>(
          await fetch(
            url,
            rpcJsonRequest(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 3,
                method: "alchemy_getTokenMetadata",
                params: [tok.contractAddress],
              }),
            ),
          ),
        )
      ).result;
      const decimals = meta?.decimals ?? 18;
      return {
        symbol: meta?.symbol ?? "???",
        name: meta?.name ?? "Unknown Token",
        contractAddress: tok.contractAddress,
        balance: formatWei(BigInt(tok.tokenBalance), decimals),
        decimals,
        valueUsd: "0",
        logoUrl: meta?.logo ?? "",
      };
    }),
  );
  const tokens = metaResults
    .filter(
      (r): r is PromiseFulfilledResult<EvmTokenBalance> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);

  return {
    chain: chain.name,
    chainId: chain.chainId,
    nativeBalance,
    nativeSymbol: chain.nativeSymbol,
    nativeValueUsd: "0",
    tokens,
    error: null,
  };
}

async function fetchAnkrChainBalances(
  chain: EvmChainConfig,
  address: string,
  ankrKey: string,
): Promise<EvmChainBalance> {
  const res = await fetch(
    `https://rpc.ankr.com/multichain/${ankrKey}`,
    rpcJsonRequest(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "ankr_getAccountBalance",
        params: {
          walletAddress: address,
          blockchain: [chain.ankrChain ?? "bsc"],
          onlyWhitelisted: false,
        },
      }),
    ),
  );
  const data = await jsonOrThrow<{ result?: { assets?: AnkrTokenAsset[] } }>(
    res,
  );
  const assets = data.result?.assets ?? [];
  const nativeAsset = assets.find(isAnkrNativeAsset);
  const nativeBalance = nativeAsset
    ? parseAnkrBalance(
        nativeAsset,
        parseTokenDecimals(nativeAsset.tokenDecimals),
      )
    : "0";
  const nativeValueUsd = nativeAsset
    ? parseUsdString(nativeAsset.balanceUsd)
    : "0";

  const tokens: EvmTokenBalance[] = [];
  for (const asset of assets) {
    if (isAnkrNativeAsset(asset)) continue;
    const decimals = parseTokenDecimals(asset.tokenDecimals);
    const balance = parseAnkrBalance(asset, decimals);
    if (isZeroBalance(balance)) continue;
    tokens.push({
      symbol: asset.tokenSymbol ?? "???",
      name: asset.tokenName ?? "Unknown Token",
      contractAddress: asset.contractAddress ?? "",
      balance,
      decimals,
      valueUsd: parseUsdString(asset.balanceUsd),
      logoUrl: asset.thumbnail ?? "",
    });
  }

  return {
    chain: chain.name,
    chainId: chain.chainId,
    nativeBalance,
    nativeSymbol: chain.nativeSymbol,
    nativeValueUsd,
    tokens,
    error: null,
  };
}

async function fetchNativeBalanceViaRpc(
  rpcUrl: string,
  address: string,
): Promise<string> {
  const data = await jsonOrThrow<{
    result?: string;
    error?: { message?: string };
  }>(
    await fetch(
      rpcUrl,
      rpcJsonRequest(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: [address, "latest"],
        }),
      ),
    ),
  );

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const raw = typeof data.result === "string" ? data.result : "0x0";
  const wei = raw.startsWith("0x") ? BigInt(raw) : BigInt(raw || "0");
  return formatWei(wei, 18);
}

async function fetchBscChainBalancesViaRpc(
  chain: EvmChainConfig,
  address: string,
  rpcUrls: string[],
): Promise<EvmChainBalance> {
  const errors: string[] = [];
  for (const rpcUrl of rpcUrls) {
    try {
      const nativeBalance = await fetchNativeBalanceViaRpc(rpcUrl, address);
      return {
        chain: chain.name,
        chainId: chain.chainId,
        nativeBalance,
        nativeSymbol: chain.nativeSymbol,
        nativeValueUsd: "0",
        tokens: [],
        error: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${describeRpcEndpoint(rpcUrl)}: ${msg}`);
    }
  }

  throw new Error(errors.join(" | ").slice(0, 400) || "BSC RPC unavailable");
}

async function fetchAlchemyChainNfts(
  chain: EvmChainConfig,
  address: string,
  alchemyKey: string,
): Promise<{ chain: string; nfts: EvmNft[] }> {
  const res = await fetch(
    `https://${chain.subdomain}.g.alchemy.com/nft/v3/${alchemyKey}/getNFTsForOwner?owner=${address}&withMetadata=true&pageSize=50`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  const data = await jsonOrThrow<{
    ownedNfts?: Array<{
      contract?: {
        address?: string;
        name?: string;
        openSeaMetadata?: { collectionName?: string };
      };
      tokenId?: string;
      name?: string;
      description?: string;
      image?: {
        cachedUrl?: string;
        thumbnailUrl?: string;
        originalUrl?: string;
      };
      tokenType?: string;
    }>;
  }>(res);
  return {
    chain: chain.name,
    nfts: (data.ownedNfts ?? []).map((nft) => ({
      contractAddress: nft.contract?.address ?? "",
      tokenId: nft.tokenId ?? "",
      name: nft.name ?? "Untitled",
      description: (nft.description ?? "").slice(0, 200),
      imageUrl:
        nft.image?.cachedUrl ??
        nft.image?.thumbnailUrl ??
        nft.image?.originalUrl ??
        "",
      collectionName:
        nft.contract?.openSeaMetadata?.collectionName ??
        nft.contract?.name ??
        "",
      tokenType: nft.tokenType ?? "ERC721",
    })),
  };
}

async function fetchAnkrChainNfts(
  chain: EvmChainConfig,
  address: string,
  ankrKey: string,
): Promise<{ chain: string; nfts: EvmNft[] }> {
  const res = await fetch(
    `https://rpc.ankr.com/multichain/${ankrKey}`,
    rpcJsonRequest(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "ankr_getNFTsByOwner",
        params: {
          walletAddress: address,
          blockchain: [chain.ankrChain ?? "bsc"],
          pageSize: 50,
        },
      }),
    ),
  );
  const data = await jsonOrThrow<{ result?: { assets?: AnkrNftAsset[] } }>(res);
  return {
    chain: chain.name,
    nfts: (data.result?.assets ?? []).map((nft) => ({
      contractAddress: nft.contractAddress ?? "",
      tokenId: String(nft.tokenId ?? ""),
      name: nft.name ?? "Untitled",
      description: (nft.description ?? "").slice(0, 200),
      imageUrl:
        nft.imageUrl ?? nft.imagePreviewUrl ?? nft.imageOriginalUrl ?? "",
      collectionName: nft.collectionName ?? nft.contractName ?? "",
      tokenType: nft.tokenType ?? "ERC721",
    })),
  };
}

export async function fetchEvmBalances(
  address: string,
  alchemyOrKeys: string | EvmProviderKeys | null | undefined,
  maybeAnkrKey?: string | null,
): Promise<EvmChainBalance[]> {
  const keys = resolveEvmProviderKeys(alchemyOrKeys, maybeAnkrKey);
  const hasManagedBscRpc = Boolean(
    keys.nodeRealBscRpcUrl || keys.quickNodeBscRpcUrl,
  );
  const activeChains = DEFAULT_EVM_CHAINS.filter((chain) =>
    chain.provider === "ankr"
      ? (isBscChain(chain) && hasManagedBscRpc) || Boolean(keys.ankrKey)
      : Boolean(keys.alchemyKey),
  );

  return Promise.all(
    activeChains.map(async (chain): Promise<EvmChainBalance> => {
      try {
        if (chain.provider === "ankr") {
          if (keys.ankrKey) {
            return await fetchAnkrChainBalances(chain, address, keys.ankrKey);
          }
          if (isBscChain(chain) && hasManagedBscRpc) {
            const fallbackRpcUrls = [
              keys.nodeRealBscRpcUrl,
              keys.quickNodeBscRpcUrl,
            ].filter((url): url is string => Boolean(url));
            return await fetchBscChainBalancesViaRpc(
              chain,
              address,
              fallbackRpcUrls,
            );
          }
          return makeEvmChainFailure(chain, "Missing ANKR_API_KEY");
        }
        if (!keys.alchemyKey)
          return makeEvmChainFailure(chain, "Missing ALCHEMY_API_KEY");
        return await fetchAlchemyChainBalances(chain, address, keys.alchemyKey);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`EVM balance fetch failed for ${chain.name}: ${msg}`);
        return makeEvmChainFailure(chain, msg);
      }
    }),
  );
}

export async function fetchEvmNfts(
  address: string,
  alchemyOrKeys: string | EvmProviderKeys | null | undefined,
  maybeAnkrKey?: string | null,
): Promise<Array<{ chain: string; nfts: EvmNft[] }>> {
  const keys = resolveEvmProviderKeys(alchemyOrKeys, maybeAnkrKey);
  const hasManagedBscRpc = Boolean(
    keys.nodeRealBscRpcUrl || keys.quickNodeBscRpcUrl,
  );
  const activeChains = DEFAULT_EVM_CHAINS.filter((chain) =>
    chain.provider === "ankr"
      ? (isBscChain(chain) && hasManagedBscRpc) || Boolean(keys.ankrKey)
      : Boolean(keys.alchemyKey),
  );

  return Promise.all(
    activeChains.map(
      async (chain): Promise<{ chain: string; nfts: EvmNft[] }> => {
        try {
          if (chain.provider === "ankr") {
            if (!keys.ankrKey) {
              // Managed NodeReal/QuickNode mode currently provides native-balance
              // readiness only; token/NFT indexing is added in later phases.
              return { chain: chain.name, nfts: [] };
            }
            return await fetchAnkrChainNfts(chain, address, keys.ankrKey);
          }
          if (!keys.alchemyKey) return { chain: chain.name, nfts: [] };
          return await fetchAlchemyChainNfts(chain, address, keys.alchemyKey);
        } catch (err) {
          logger.warn(`EVM NFT fetch failed for ${chain.name}: ${err}`);
          return { chain: chain.name, nfts: [] };
        }
      },
    ),
  );
}

// Helius API (Solana tokens + NFTs)

interface HeliusAsset {
  id: string;
  interface: string;
  content?: {
    metadata?: { name?: string; symbol?: string; description?: string };
    links?: { image?: string };
  };
  token_info?: {
    balance?: number;
    decimals?: number;
    price_info?: { total_price?: number };
    symbol?: string;
  };
  grouping?: Array<{
    group_key?: string;
    collection_metadata?: { name?: string };
  }>;
}

export async function fetchSolanaBalances(
  address: string,
  heliusKey: string,
): Promise<{
  solBalance: string;
  solValueUsd: string;
  tokens: SolanaTokenBalance[];
}> {
  const url = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
  const rpc = (body: string): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    body,
  });

  let solBalance = "0";
  try {
    const data = await jsonOrThrow<{
      result?: { value?: number };
      error?: { message?: string };
    }>(
      await fetch(
        url,
        rpc(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [address],
          }),
        ),
      ),
    );
    if (data.error?.message) throw new Error(data.error.message);
    solBalance = ((data.result?.value ?? 0) / 1e9).toFixed(9);
  } catch (err) {
    logger.warn(
      `SOL balance fetch failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  const tokens: SolanaTokenBalance[] = [];
  try {
    const data = await jsonOrThrow<{
      result?: { items?: HeliusAsset[] };
      error?: { message?: string };
    }>(
      await fetch(
        url,
        rpc(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "getAssetsByOwner",
            params: {
              ownerAddress: address,
              displayOptions: { showFungible: true, showNativeBalance: true },
              page: 1,
              limit: 100,
            },
          }),
        ),
      ),
    );
    if (data.error?.message) throw new Error(data.error.message);
    for (const item of data.result?.items ?? []) {
      if (
        item.interface !== "FungibleToken" &&
        item.interface !== "FungibleAsset"
      )
        continue;
      const dec = item.token_info?.decimals ?? 0;
      const raw = item.token_info?.balance ?? 0;
      tokens.push({
        symbol:
          item.token_info?.symbol ?? item.content?.metadata?.symbol ?? "???",
        name: item.content?.metadata?.name ?? "Unknown",
        mint: item.id,
        balance: dec > 0 ? (raw / 10 ** dec).toString() : raw.toString(),
        decimals: dec,
        valueUsd: item.token_info?.price_info?.total_price?.toFixed(2) ?? "0",
        logoUrl: item.content?.links?.image ?? "",
      });
    }
  } catch (err) {
    logger.warn(
      `Solana token fetch failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  return { solBalance, solValueUsd: "0", tokens };
}

export async function fetchSolanaNfts(
  address: string,
  heliusKey: string,
): Promise<SolanaNft[]> {
  const url = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
  try {
    const data = await jsonOrThrow<{
      result?: { items?: HeliusAsset[] };
      error?: { message?: string };
    }>(
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAssetsByOwner",
          params: {
            ownerAddress: address,
            displayOptions: { showFungible: false },
            page: 1,
            limit: 100,
          },
        }),
      }),
    );
    if (data.error?.message) throw new Error(data.error.message);
    const items = data.result?.items ?? [];
    return items
      .filter(
        (i) =>
          i.interface === "V1_NFT" ||
          i.interface === "ProgrammableNFT" ||
          i.interface === "V2_NFT",
      )
      .map((i) => ({
        mint: i.id,
        name: i.content?.metadata?.name ?? "Untitled",
        description: (i.content?.metadata?.description ?? "").slice(0, 200),
        imageUrl: i.content?.links?.image ?? "",
        collectionName:
          i.grouping?.find((g) => g.group_key === "collection")
            ?.collection_metadata?.name ?? "",
      }));
  } catch (err) {
    logger.warn(`Solana NFT fetch failed: ${err}`);
    return [];
  }
}

// Utility

// maskSecret is defined near the key-validation section above

function formatWei(wei: bigint, decimals: number): string {
  if (wei <= 0n || decimals <= 0) return wei <= 0n ? "0" : wei.toString();
  const divisor = 10n ** BigInt(decimals);
  const whole = wei / divisor;
  const rem = wei % divisor;
  if (rem === 0n) return whole.toString();
  return `${whole}.${rem.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}
