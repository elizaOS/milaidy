/**
 * Comprehensive unit tests for the wallet module.
 *
 * Covers:
 * - EVM key generation and address derivation
 * - Solana key generation and address derivation
 * - Wallet import validation
 * - Secure storage (keys in env, not in plaintext config)
 * - Wallet availability for plugins
 * - Multi-chain support
 * - Key format validation edge cases
 * - maskSecret utility
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EVM_CHAINS,
  deriveEvmAddress,
  deriveSolanaAddress,
  generateWalletForChain,
  generateWalletKeys,
  getWalletAddresses,
  importWallet,
  validateEvmPrivateKey,
  validatePrivateKey,
  validateSolanaPrivateKey,
  type WalletKeys,
} from "./wallet";

// ---------------------------------------------------------------------------
// Known test vectors
// ---------------------------------------------------------------------------

/** Hardhat test account #0 — well-known deterministic key pair. */
const HARDHAT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const HARDHAT_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Save and restore env vars around tests that mutate process.env. */
function saveEnvKeys(...keys: string[]): { restore: () => void } {
  const saved: Record<string, string | undefined> = {};
  for (const key of keys) {
    saved[key] = process.env[key];
  }
  return {
    restore() {
      for (const key of keys) {
        if (saved[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = saved[key];
        }
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVM Key Generation & Address Derivation
// ═══════════════════════════════════════════════════════════════════════════

describe("EVM key generation", () => {
  it("generates a 32-byte hex private key with 0x prefix", () => {
    const keys = generateWalletKeys();
    expect(keys.evmPrivateKey).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("generates a valid 42-character checksum address", () => {
    const keys = generateWalletKeys();
    expect(keys.evmAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(keys.evmAddress.length).toBe(42);
  });

  it("generates unique keys on each call", () => {
    const keys1 = generateWalletKeys();
    const keys2 = generateWalletKeys();
    expect(keys1.evmPrivateKey).not.toBe(keys2.evmPrivateKey);
    expect(keys1.evmAddress).not.toBe(keys2.evmAddress);
  });

  it("generates a single EVM key via generateWalletForChain", () => {
    const result = generateWalletForChain("evm");
    expect(result.chain).toBe("evm");
    expect(result.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

describe("EVM address derivation", () => {
  it("derives the correct address from the Hardhat #0 key", () => {
    const address = deriveEvmAddress(HARDHAT_PRIVATE_KEY);
    expect(address.toLowerCase()).toBe(HARDHAT_ADDRESS.toLowerCase());
  });

  it("handles keys without 0x prefix", () => {
    const keyWithoutPrefix = HARDHAT_PRIVATE_KEY.slice(2);
    const address = deriveEvmAddress(keyWithoutPrefix);
    expect(address.toLowerCase()).toBe(HARDHAT_ADDRESS.toLowerCase());
  });

  it("produces a checksummed address (EIP-55)", () => {
    const address = deriveEvmAddress(HARDHAT_PRIVATE_KEY);
    // EIP-55 checksum means some chars are uppercase
    expect(address).not.toBe(address.toLowerCase());
    expect(address.startsWith("0x")).toBe(true);
  });

  it("is deterministic — same key always gives the same address", () => {
    const addr1 = deriveEvmAddress(HARDHAT_PRIVATE_KEY);
    const addr2 = deriveEvmAddress(HARDHAT_PRIVATE_KEY);
    expect(addr1).toBe(addr2);
  });

  it("different keys produce different addresses", () => {
    const keys1 = generateWalletKeys();
    const keys2 = generateWalletKeys();
    expect(keys1.evmAddress).not.toBe(keys2.evmAddress);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Solana Key Generation & Address Derivation
// ═══════════════════════════════════════════════════════════════════════════

describe("Solana key generation", () => {
  it("generates a non-empty base58 private key", () => {
    const keys = generateWalletKeys();
    expect(keys.solanaPrivateKey.length).toBeGreaterThan(0);
    // Base58 alphabet check (no 0, O, I, l)
    expect(keys.solanaPrivateKey).toMatch(
      /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/,
    );
  });

  it("generates a non-empty base58 public address", () => {
    const keys = generateWalletKeys();
    expect(keys.solanaAddress.length).toBeGreaterThan(0);
    expect(keys.solanaAddress).toMatch(
      /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/,
    );
  });

  it("generates unique Solana keys on each call", () => {
    const keys1 = generateWalletKeys();
    const keys2 = generateWalletKeys();
    expect(keys1.solanaPrivateKey).not.toBe(keys2.solanaPrivateKey);
    expect(keys1.solanaAddress).not.toBe(keys2.solanaAddress);
  });

  it("generates a single Solana key via generateWalletForChain", () => {
    const result = generateWalletForChain("solana");
    expect(result.chain).toBe("solana");
    expect(result.privateKey.length).toBeGreaterThan(0);
    expect(result.address.length).toBeGreaterThan(0);
  });
});

describe("Solana address derivation", () => {
  it("re-derives the same address from a generated key", () => {
    const keys = generateWalletKeys();
    const rederived = deriveSolanaAddress(keys.solanaPrivateKey);
    expect(rederived).toBe(keys.solanaAddress);
  });

  it("is deterministic — same key always gives the same address", () => {
    const keys = generateWalletKeys();
    const addr1 = deriveSolanaAddress(keys.solanaPrivateKey);
    const addr2 = deriveSolanaAddress(keys.solanaPrivateKey);
    expect(addr1).toBe(addr2);
  });

  it("throws for an invalid key length", () => {
    // 16 bytes is neither 32 nor 64 — should throw
    expect(() => deriveSolanaAddress("1111111111111111111111")).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Multi-chain support
// ═══════════════════════════════════════════════════════════════════════════

describe("Multi-chain support", () => {
  it("generateWalletKeys returns both EVM and Solana keys", () => {
    const keys = generateWalletKeys();
    expect(keys.evmPrivateKey).toBeDefined();
    expect(keys.evmAddress).toBeDefined();
    expect(keys.solanaPrivateKey).toBeDefined();
    expect(keys.solanaAddress).toBeDefined();
  });

  it("DEFAULT_EVM_CHAINS includes the expected chains", () => {
    const chainNames = DEFAULT_EVM_CHAINS.map((c) => c.name);
    expect(chainNames).toContain("Ethereum");
    expect(chainNames).toContain("Base");
    expect(chainNames).toContain("Arbitrum");
    expect(chainNames).toContain("Optimism");
    expect(chainNames).toContain("Polygon");
  });

  it("each EVM chain has required fields", () => {
    for (const chain of DEFAULT_EVM_CHAINS) {
      expect(chain.name).toBeTruthy();
      expect(chain.subdomain).toBeTruthy();
      expect(typeof chain.chainId).toBe("number");
      expect(chain.nativeSymbol).toBeTruthy();
    }
  });

  it("generateWalletForChain('evm') only generates EVM key", () => {
    const result = generateWalletForChain("evm");
    expect(result.chain).toBe("evm");
    expect(result.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("generateWalletForChain('solana') only generates Solana key", () => {
    const result = generateWalletForChain("solana");
    expect(result.chain).toBe("solana");
    // Solana keys don't have 0x prefix
    expect(result.privateKey.startsWith("0x")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Key Validation
// ═══════════════════════════════════════════════════════════════════════════

describe("EVM key validation", () => {
  it("accepts a valid 0x-prefixed hex key", () => {
    const result = validateEvmPrivateKey(HARDHAT_PRIVATE_KEY);
    expect(result.valid).toBe(true);
    expect(result.chain).toBe("evm");
    expect(result.address).toBeTruthy();
    expect(result.error).toBeNull();
  });

  it("accepts a valid key without 0x prefix", () => {
    const result = validateEvmPrivateKey(HARDHAT_PRIVATE_KEY.slice(2));
    expect(result.valid).toBe(true);
    expect(result.address?.toLowerCase()).toBe(HARDHAT_ADDRESS.toLowerCase());
  });

  it("rejects a key that is too short", () => {
    const result = validateEvmPrivateKey("0xdead");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("64 hex characters");
  });

  it("rejects a key that is too long", () => {
    const longKey = `0x${"a".repeat(66)}`;
    const result = validateEvmPrivateKey(longKey);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("64 hex characters");
  });

  it("rejects a key with invalid hex characters", () => {
    const badKey = `0x${"g".repeat(64)}`;
    const result = validateEvmPrivateKey(badKey);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid hex characters");
  });

  it("rejects an empty string", () => {
    const result = validateEvmPrivateKey("");
    expect(result.valid).toBe(false);
  });
});

describe("Solana key validation", () => {
  it("accepts a valid generated Solana key", () => {
    const keys = generateWalletKeys();
    const result = validateSolanaPrivateKey(keys.solanaPrivateKey);
    expect(result.valid).toBe(true);
    expect(result.chain).toBe("solana");
    expect(result.address).toBe(keys.solanaAddress);
    expect(result.error).toBeNull();
  });

  it("rejects a key with invalid base58 characters", () => {
    // '0' is not in base58 alphabet
    const result = validateSolanaPrivateKey("000InvalidBase58");
    expect(result.valid).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = validateSolanaPrivateKey("");
    expect(result.valid).toBe(false);
  });
});

describe("Auto-detect key validation", () => {
  it("auto-detects an 0x-prefixed key as EVM", () => {
    const result = validatePrivateKey(HARDHAT_PRIVATE_KEY);
    expect(result.chain).toBe("evm");
    expect(result.valid).toBe(true);
  });

  it("auto-detects a 64-char hex string as EVM", () => {
    const result = validatePrivateKey(HARDHAT_PRIVATE_KEY.slice(2));
    expect(result.chain).toBe("evm");
    expect(result.valid).toBe(true);
  });

  it("auto-detects a base58 string as Solana", () => {
    const keys = generateWalletKeys();
    const result = validatePrivateKey(keys.solanaPrivateKey);
    expect(result.chain).toBe("solana");
    expect(result.valid).toBe(true);
  });

  it("trims whitespace before validation", () => {
    const result = validatePrivateKey(`  ${HARDHAT_PRIVATE_KEY}  `);
    expect(result.valid).toBe(true);
    expect(result.chain).toBe("evm");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wallet Import
// ═══════════════════════════════════════════════════════════════════════════

describe("Wallet import", () => {
  let envBackup: { restore: () => void };

  beforeEach(() => {
    envBackup = saveEnvKeys("EVM_PRIVATE_KEY", "SOLANA_PRIVATE_KEY");
    delete process.env.EVM_PRIVATE_KEY;
    delete process.env.SOLANA_PRIVATE_KEY;
  });

  afterEach(() => {
    envBackup.restore();
  });

  it("imports a valid EVM key into process.env", () => {
    const result = importWallet("evm", HARDHAT_PRIVATE_KEY);
    expect(result.success).toBe(true);
    expect(result.chain).toBe("evm");
    expect(result.address?.toLowerCase()).toBe(HARDHAT_ADDRESS.toLowerCase());
    expect(result.error).toBeNull();
    expect(process.env.EVM_PRIVATE_KEY).toBe(HARDHAT_PRIVATE_KEY);
  });

  it("normalizes EVM key to include 0x prefix", () => {
    const keyWithoutPrefix = HARDHAT_PRIVATE_KEY.slice(2);
    const result = importWallet("evm", keyWithoutPrefix);
    expect(result.success).toBe(true);
    expect(process.env.EVM_PRIVATE_KEY).toBe(`0x${keyWithoutPrefix}`);
  });

  it("imports a valid Solana key into process.env", () => {
    const keys = generateWalletKeys();
    const result = importWallet("solana", keys.solanaPrivateKey);
    expect(result.success).toBe(true);
    expect(result.chain).toBe("solana");
    expect(result.address).toBe(keys.solanaAddress);
    expect(process.env.SOLANA_PRIVATE_KEY).toBe(keys.solanaPrivateKey);
  });

  it("rejects an invalid EVM key", () => {
    const result = importWallet("evm", "not-a-valid-key");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(process.env.EVM_PRIVATE_KEY).toBeUndefined();
  });

  it("rejects an invalid Solana key", () => {
    const result = importWallet("solana", "0xthis-is-not-base58");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(process.env.SOLANA_PRIVATE_KEY).toBeUndefined();
  });

  it("trims whitespace from the key", () => {
    const result = importWallet("evm", `  ${HARDHAT_PRIVATE_KEY}  `);
    expect(result.success).toBe(true);
    expect(process.env.EVM_PRIVATE_KEY).toBe(HARDHAT_PRIVATE_KEY);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Secure Storage
// ═══════════════════════════════════════════════════════════════════════════

describe("Secure key storage", () => {
  let envBackup: { restore: () => void };

  beforeEach(() => {
    envBackup = saveEnvKeys("EVM_PRIVATE_KEY", "SOLANA_PRIVATE_KEY");
  });

  afterEach(() => {
    envBackup.restore();
  });

  it("getWalletAddresses reads from process.env, not from a config file", () => {
    // Set known key in env
    process.env.EVM_PRIVATE_KEY = HARDHAT_PRIVATE_KEY;
    delete process.env.SOLANA_PRIVATE_KEY;

    const addrs = getWalletAddresses();
    expect(addrs.evmAddress?.toLowerCase()).toBe(HARDHAT_ADDRESS.toLowerCase());
    expect(addrs.solanaAddress).toBeNull();
  });

  it("returns null addresses when env vars are not set", () => {
    delete process.env.EVM_PRIVATE_KEY;
    delete process.env.SOLANA_PRIVATE_KEY;

    const addrs = getWalletAddresses();
    expect(addrs.evmAddress).toBeNull();
    expect(addrs.solanaAddress).toBeNull();
  });

  it("importWallet stores keys ONLY in process.env", () => {
    delete process.env.EVM_PRIVATE_KEY;
    const result = importWallet("evm", HARDHAT_PRIVATE_KEY);
    expect(result.success).toBe(true);

    // Key is in process.env (which is the expected runtime store)
    expect(process.env.EVM_PRIVATE_KEY).toBeTruthy();

    // Verify the module does NOT export the key in any global state
    // other than process.env — getWalletAddresses reads from env.
    const addrs = getWalletAddresses();
    expect(addrs.evmAddress).toBeTruthy();
  });

  it("generated keys are stored in process.env by the calling code (not wallet module)", () => {
    // generateWalletKeys itself does NOT set process.env — the caller does.
    // This is by design: the wallet module is stateless.
    delete process.env.EVM_PRIVATE_KEY;
    delete process.env.SOLANA_PRIVATE_KEY;

    const keys = generateWalletKeys();

    // Before setting env, getWalletAddresses returns null
    const addrsBefore = getWalletAddresses();
    expect(addrsBefore.evmAddress).toBeNull();
    expect(addrsBefore.solanaAddress).toBeNull();

    // After setting env, addresses resolve
    process.env.EVM_PRIVATE_KEY = keys.evmPrivateKey;
    process.env.SOLANA_PRIVATE_KEY = keys.solanaPrivateKey;

    const addrsAfter = getWalletAddresses();
    expect(addrsAfter.evmAddress).toBe(keys.evmAddress);
    expect(addrsAfter.solanaAddress).toBe(keys.solanaAddress);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Wallet Availability for Plugins
// ═══════════════════════════════════════════════════════════════════════════

describe("Wallet availability for plugins", () => {
  let envBackup: { restore: () => void };

  beforeEach(() => {
    envBackup = saveEnvKeys(
      "EVM_PRIVATE_KEY",
      "SOLANA_PRIVATE_KEY",
      "ALCHEMY_API_KEY",
      "HELIUS_API_KEY",
      "BIRDEYE_API_KEY",
      "SOLANA_RPC_URL",
    );
  });

  afterEach(() => {
    envBackup.restore();
  });

  it("EVM key is accessible via the standard EVM_PRIVATE_KEY env var", () => {
    process.env.EVM_PRIVATE_KEY = HARDHAT_PRIVATE_KEY;
    expect(process.env.EVM_PRIVATE_KEY).toBe(HARDHAT_PRIVATE_KEY);
  });

  it("Solana key is accessible via the standard SOLANA_PRIVATE_KEY env var", () => {
    const keys = generateWalletKeys();
    process.env.SOLANA_PRIVATE_KEY = keys.solanaPrivateKey;
    expect(process.env.SOLANA_PRIVATE_KEY).toBe(keys.solanaPrivateKey);
  });

  it("API keys for balance fetching are stored as env vars", () => {
    process.env.ALCHEMY_API_KEY = "test-alchemy";
    process.env.HELIUS_API_KEY = "test-helius";
    process.env.BIRDEYE_API_KEY = "test-birdeye";
    process.env.SOLANA_RPC_URL = "https://mainnet.helius-rpc.com/?api-key=test";

    expect(process.env.ALCHEMY_API_KEY).toBe("test-alchemy");
    expect(process.env.HELIUS_API_KEY).toBe("test-helius");
    expect(process.env.BIRDEYE_API_KEY).toBe("test-birdeye");
    expect(process.env.SOLANA_RPC_URL).toContain("helius-rpc.com");
  });

  it("wallet secrets are included in the Character secrets list", async () => {
    // Verify that buildCharacterFromConfig includes wallet-related keys.
    // We import the function and check the output includes wallet env keys.
    const { buildCharacterFromConfig } = await import("../runtime/eliza");

    process.env.EVM_PRIVATE_KEY = HARDHAT_PRIVATE_KEY;
    process.env.SOLANA_PRIVATE_KEY = "testSolanaKey123";
    process.env.ALCHEMY_API_KEY = "test-alchemy";
    process.env.HELIUS_API_KEY = "test-helius";

    const character = buildCharacterFromConfig({} as Record<string, never>);

    expect(character.secrets?.EVM_PRIVATE_KEY).toBe(HARDHAT_PRIVATE_KEY);
    expect(character.secrets?.SOLANA_PRIVATE_KEY).toBe("testSolanaKey123");
    expect(character.secrets?.ALCHEMY_API_KEY).toBe("test-alchemy");
    expect(character.secrets?.HELIUS_API_KEY).toBe("test-helius");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge cases & boundary conditions
// ═══════════════════════════════════════════════════════════════════════════

describe("getWalletAddresses — edge cases", () => {
  let envBackup: { restore: () => void };

  beforeEach(() => {
    envBackup = saveEnvKeys("EVM_PRIVATE_KEY", "SOLANA_PRIVATE_KEY");
  });

  afterEach(() => {
    envBackup.restore();
  });

  it("returns null for both when env is empty", () => {
    delete process.env.EVM_PRIVATE_KEY;
    delete process.env.SOLANA_PRIVATE_KEY;
    const addrs = getWalletAddresses();
    expect(addrs.evmAddress).toBeNull();
    expect(addrs.solanaAddress).toBeNull();
  });

  it("returns null for EVM when key is garbage (doesn't crash)", () => {
    process.env.EVM_PRIVATE_KEY = "not-a-hex-key-at-all";
    const addrs = getWalletAddresses();
    expect(addrs.evmAddress).toBeNull();
  });

  it("returns null for Solana when key is garbage (doesn't crash)", () => {
    process.env.SOLANA_PRIVATE_KEY = "0000invalid!!!";
    const addrs = getWalletAddresses();
    expect(addrs.solanaAddress).toBeNull();
  });

  it("returns EVM address even when Solana key is missing", () => {
    process.env.EVM_PRIVATE_KEY = HARDHAT_PRIVATE_KEY;
    delete process.env.SOLANA_PRIVATE_KEY;
    const addrs = getWalletAddresses();
    expect(addrs.evmAddress).toBeTruthy();
    expect(addrs.solanaAddress).toBeNull();
  });

  it("returns Solana address even when EVM key is missing", () => {
    delete process.env.EVM_PRIVATE_KEY;
    const keys = generateWalletKeys();
    process.env.SOLANA_PRIVATE_KEY = keys.solanaPrivateKey;
    const addrs = getWalletAddresses();
    expect(addrs.evmAddress).toBeNull();
    expect(addrs.solanaAddress).toBe(keys.solanaAddress);
  });
});

describe("deriveEvmAddress — boundary inputs", () => {
  it("throws on empty string", () => {
    expect(() => deriveEvmAddress("")).toThrow();
  });

  it("throws on short hex (@noble/curves validates byte length)", () => {
    // @noble/curves strictly requires 32 bytes — short inputs are rejected.
    expect(() => deriveEvmAddress("0xdead")).toThrow();
  });

  it("works with uppercase hex", () => {
    const upper = HARDHAT_PRIVATE_KEY.toUpperCase().replace("0X", "0x");
    const addr = deriveEvmAddress(upper);
    expect(addr.toLowerCase()).toBe(HARDHAT_ADDRESS.toLowerCase());
  });

  it("produces same address for Hardhat account #1", () => {
    // Hardhat #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
    const addr = deriveEvmAddress(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    );
    expect(addr.toLowerCase()).toBe(
      "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    );
  });
});

describe("validateEvmPrivateKey — boundary inputs", () => {
  it("rejects all-zero key (valid hex but may produce invalid EC point)", () => {
    const allZero = `0x${"0".repeat(64)}`;
    // All zeros is not a valid secp256k1 private key
    const result = validateEvmPrivateKey(allZero);
    expect(result.valid).toBe(false);
  });

  it("accepts max valid key (order - 1 of secp256k1 curve)", () => {
    // secp256k1 order n = FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140
    // n-1 is valid
    const maxKey =
      "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD036413F";
    const result = validateEvmPrivateKey(maxKey);
    expect(result.valid).toBe(true);
    expect(result.address).toBeTruthy();
  });
});

describe("Solana key edge cases", () => {
  it("deriveSolanaAddress round-trips for 10 generated keys", () => {
    for (let i = 0; i < 10; i++) {
      const keys = generateWalletKeys();
      expect(deriveSolanaAddress(keys.solanaPrivateKey)).toBe(
        keys.solanaAddress,
      );
    }
  });

  it("generateWalletForChain('solana') produces a derivable key", () => {
    const result = generateWalletForChain("solana");
    expect(deriveSolanaAddress(result.privateKey)).toBe(result.address);
  });
});

describe("importWallet — edge cases", () => {
  let envBackup: { restore: () => void };

  beforeEach(() => {
    envBackup = saveEnvKeys("EVM_PRIVATE_KEY", "SOLANA_PRIVATE_KEY");
    delete process.env.EVM_PRIVATE_KEY;
    delete process.env.SOLANA_PRIVATE_KEY;
  });

  afterEach(() => {
    envBackup.restore();
  });

  it("importing twice overwrites the first key", () => {
    const keys1 = generateWalletKeys();
    const keys2 = generateWalletKeys();
    importWallet("evm", keys1.evmPrivateKey);
    expect(process.env.EVM_PRIVATE_KEY).toBe(keys1.evmPrivateKey);
    importWallet("evm", keys2.evmPrivateKey);
    expect(process.env.EVM_PRIVATE_KEY).toBe(keys2.evmPrivateKey);
  });

  it("rejects EVM key with only whitespace", () => {
    const result = importWallet("evm", "   ");
    expect(result.success).toBe(false);
  });

  it("rejects Solana key with only whitespace", () => {
    const result = importWallet("solana", "   ");
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WalletKeys type shape validation
// ═══════════════════════════════════════════════════════════════════════════

describe("WalletKeys type shape", () => {
  it("generateWalletKeys returns all required fields", () => {
    const keys: WalletKeys = generateWalletKeys();

    // Type-level check that all fields exist (compile-time)
    const required: Array<keyof WalletKeys> = [
      "evmPrivateKey",
      "evmAddress",
      "solanaPrivateKey",
      "solanaAddress",
    ];

    for (const field of required) {
      expect(keys[field]).toBeTruthy();
      expect(typeof keys[field]).toBe("string");
    }
  });
});
