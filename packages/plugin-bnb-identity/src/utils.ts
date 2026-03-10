/**
 * Shared utility functions for @milady/plugin-bnb-identity.
 *
 * Extracted from actions.ts to keep individual modules under 500 LOC.
 */

import type { IAgentRuntime, Memory } from "@elizaos/core";
import type { AgentMetadata, BnbIdentityConfig } from "./types.js";

// ── Pending-confirmation cache with TTL ────────────────────────────────────

/** How long a pending confirmation entry stays valid (5 minutes). */
const PENDING_TTL_MS = 5 * 60 * 1000;

export interface PendingEntry {
  data: Record<string, unknown>;
  timestamp: number;
}

const pendingConfirmations = new Map<string, PendingEntry>();

/**
 * Removes entries older than PENDING_TTL_MS from the Map.
 * Called on every access to prevent unbounded growth.
 */
function cleanupExpired(): void {
  const now = Date.now();
  for (const [key, entry] of pendingConfirmations) {
    if (now - entry.timestamp > PENDING_TTL_MS) {
      pendingConfirmations.delete(key);
    }
  }
}

/** Returns pending data if it exists and is not expired, or undefined. */
export function getPending(key: string): Record<string, unknown> | undefined {
  cleanupExpired();
  const entry = pendingConfirmations.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > PENDING_TTL_MS) {
    pendingConfirmations.delete(key);
    return undefined;
  }
  return entry.data;
}

/** Stores pending confirmation data with the current timestamp. */
export function setPending(key: string, data: Record<string, unknown>): void {
  cleanupExpired();
  pendingConfirmations.set(key, { data, timestamp: Date.now() });
}

/** Deletes a pending entry regardless of TTL. */
export function deletePending(key: string): void {
  pendingConfirmations.delete(key);
}

/** Clears all pending entries. Useful for tests. */
export function clearAllPending(): void {
  pendingConfirmations.clear();
}

/**
 * Visible for testing: returns the raw internal Map so tests
 * can manipulate timestamps directly to simulate TTL expiry.
 */
export function _getPendingMapForTesting(): Map<string, PendingEntry> {
  return pendingConfirmations;
}

// ── Config & display helpers ───────────────────────────────────────────────

export type ResolvedBnbIdentityConfig = BnbIdentityConfig & {
  networkWarning?: string;
};

export function loadConfig(runtime: IAgentRuntime): ResolvedBnbIdentityConfig {
  const { network, warning } = normalizeBnbNetwork(
    String(runtime.getSetting("BNB_NETWORK") ?? "bsc-testnet"),
  );

  return {
    privateKey: runtime.getSetting("BNB_PRIVATE_KEY")
      ? String(runtime.getSetting("BNB_PRIVATE_KEY"))
      : undefined,
    network,
    agentUriBase: runtime.getSetting("BNB_AGENT_URI_BASE")
      ? String(runtime.getSetting("BNB_AGENT_URI_BASE"))
      : undefined,
    gatewayPort: parseInt(
      String(runtime.getSetting("MILADY_GATEWAY_PORT") ?? "18789"),
      10,
    ),
    ...(warning ? { networkWarning: warning } : {}),
  };
}

export function resolveScanBase(network: string): string {
  return network === "bsc"
    ? "https://www.8004scan.io"
    : "https://testnet.8004scan.io";
}

export function bscscanTxUrl(network: string, txHash: string): string {
  const base =
    network === "bsc" ? "https://bscscan.com" : "https://testnet.bscscan.com";
  return `${base}/tx/${txHash}`;
}

export function networkLabelForDisplay(network: string): string {
  return network === "bsc"
    ? "BSC Mainnet 🔴 REAL MONEY"
    : `${network} (testnet)`;
}

export function userConfirmed(message: Memory): boolean {
  const userText = message.content?.text?.toLowerCase() ?? "";
  if (
    /\b(?:do not|don't|dont|not|cancel|stop|no)\s+(?:confirm|yes)\b/.test(
      userText,
    )
  ) {
    return false;
  }
  return /\bconfirm\b/.test(userText) || /\byes\b/.test(userText);
}

/**
 * Best-effort decode of an agentURI (data: URI or hosted JSON) back into
 * AgentMetadata. Returns null on any failure.
 */
export function decodeAgentMetadata(agentURI: string): AgentMetadata | null {
  try {
    if (agentURI.startsWith("data:application/json;base64,")) {
      const b64 = agentURI.slice("data:application/json;base64,".length);
      const json = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(json) as AgentMetadata;
    }
    // Hosted URIs would need a fetch; not worth blocking on here.
    return null;
  } catch {
    return null;
  }
}

// ── Pending key helpers ─────────────────────────────────────────────────────

export function registerPendingKey(agentId: string): string {
  return `bnb_identity_register_pending_${agentId}`;
}

export function updatePendingKey(agentId: string): string {
  return `bnb_identity_update_pending_${agentId}`;
}

// ── Network normalization ──────────────────────────────────────────────────

/** Supported and normalized networks for ERC-8004/BSC flows. */
const SUPPORTED_NETWORKS = new Set(["bsc", "bsc-testnet"]);

/**
 * Normalizes requested BNB network values and rejects unsupported values.
 * Also accepts common aliases (mainnet/testnet) to reduce operator mistakes.
 */
export function normalizeBnbNetwork(value: string): {
  network: string;
  warning?: string;
} {
  const normalized = value.trim().toLowerCase();
  if (SUPPORTED_NETWORKS.has(normalized)) {
    return { network: normalized };
  }

  if (
    normalized === "mainnet" ||
    normalized === "bnb" ||
    normalized === "bnb-mainnet"
  ) {
    return {
      network: "bsc",
      warning: `Normalized BNB_NETWORK "${value}" to "bsc" for compatibility.`,
    };
  }

  if (
    normalized === "testnet" ||
    normalized === "bsc-test" ||
    normalized === "bsctestnet" ||
    normalized === "bnb-testnet" ||
    normalized === "bnb_testnet"
  ) {
    return {
      network: "bsc-testnet",
      warning: `Normalized BNB_NETWORK "${value}" to "bsc-testnet" for compatibility.`,
    };
  }

  throw new Error(
    `Unsupported BNB_NETWORK "${value}". Supported values: bsc, bsc-testnet.`,
  );
}

// ── Text extraction ────────────────────────────────────────────────────────

/**
 * Extracts agentId when the message contains a resolvable agent reference.
 */
export function extractAgentIdFromText(text: string): string | undefined {
  const patterns = [
    /\b(?:agent\s*id|agentid)\s*(?:[:#]|is|=)?\s*(\d+)\b/i,
    /\blook\s*up\s*agent\s*(?:id\s*)?(\d+)\b/i,
    /\bresolve\s+agent\s*(?:id\s*)?(\d+)\b/i,
    /\bagent\s+(?:id\s*)?(?:is\s*)?#?(\d+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

// ── Plugin discovery ───────────────────────────────────────────────────────

/**
 * Reads installed plugin names from the runtime or falls back to plugins.json.
 */
export async function getInstalledPlugins(
  runtime: IAgentRuntime,
): Promise<string[]> {
  // ElizaOS runtime exposes plugins on the character config
  const characterPlugins: string[] =
    (runtime.character as unknown as { plugins?: string[] })?.plugins ?? [];
  if (characterPlugins.length > 0) return characterPlugins;

  // Fallback: read plugins.json from the Milady root
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");
    const pluginsPath = join(homedir(), ".milady", "plugins.json");
    const raw = await readFile(pluginsPath, "utf8");
    const data = JSON.parse(raw) as { plugins?: string[] };
    return data.plugins ?? [];
  } catch {
    return [];
  }
}
