/**
 * API routes for BAP-578 NFA (Non-Fungible Agent) status and learnings.
 *
 *   GET /api/nfa/status    — NFA state composed with ERC-8004 identity
 *   GET /api/nfa/learnings — Parsed LEARNINGS.md with Merkle root
 *
 * Uses @elizaos/plugin-bnb-identity when available (workspace or installed).
 * If the plugin is missing, /api/nfa/status still works; /api/nfa/learnings
 * returns empty entries and a fallback empty Merkle root.
 *
 * WHY optional plugin: Core and CI can build/test without the plugin; the API
 * stays usable and we avoid hard dependency on a workspace package that may
 * not be present in all environments.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

/** Empty-string SHA-256 hex for when the plugin is unavailable. */
function emptyMerkleRoot(): string {
  return createHash("sha256").update("", "utf8").digest("hex");
}

type NfaPlugin = {
  buildMerkleRoot: (leafHashes: string[]) => string;
  parseLearnings: (markdown: string) => Array<{ hash: string }>;
  sha256: (data: string) => string;
};

/** Cached plugin module or null if unavailable. Undefined = not yet loaded. */
let nfaPlugin: NfaPlugin | null | undefined;

/**
 * Load @elizaos/plugin-bnb-identity once and cache. Returns null if the package
 * is missing or doesn't export the required functions. WHY dynamic import:
 * keeps the dependency optional so core works without the plugin installed.
 */
async function getNfaPlugin(): Promise<NfaPlugin | null> {
  if (nfaPlugin !== undefined) return nfaPlugin;
  try {
    // WHY variable: Vite's import-analysis plugin resolves string-literal
    // dynamic imports at transform time, failing if the package's dist/
    // isn't built. Using a variable makes the specifier opaque to Vite so
    // the try/catch can handle a missing module at runtime.
    const pkgName = "@elizaos/plugin-bnb-identity";
    const mod = await import(/* @vite-ignore */ pkgName);
    nfaPlugin =
      typeof mod?.buildMerkleRoot === "function" &&
      typeof mod?.parseLearnings === "function" &&
      typeof mod?.sha256 === "function"
        ? {
            buildMerkleRoot: mod.buildMerkleRoot,
            parseLearnings: mod.parseLearnings,
            sha256: mod.sha256,
          }
        : null;
  } catch {
    nfaPlugin = null;
  }
  return nfaPlugin;
}

export interface NfaRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "json" | "error"> {}

interface NfaRecord {
  tokenId: string;
  contractAddress: string;
  network: string;
  ownerAddress: string;
  mintTxHash: string;
  merkleRoot: string;
  mintedAt: string;
  lastUpdatedAt: string;
}

interface IdentityRecord {
  agentId: string;
  network: string;
  txHash: string;
  ownerAddress: string;
  agentURI: string;
  registeredAt: string;
  lastUpdatedAt: string;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function handleNfaRoutes(ctx: NfaRouteContext): Promise<boolean> {
  const { res, method, pathname, json } = ctx;

  // ── GET /api/nfa/status ──────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/nfa/status") {
    const miladyDir = join(homedir(), ".milady");
    const [nfaRecord, identityRecord] = await Promise.all([
      readJsonFile<NfaRecord>(join(miladyDir, "bap578-nfa.json")),
      readJsonFile<IdentityRecord>(join(miladyDir, "bnb-identity.json")),
    ]);

    const bscscanBase =
      (nfaRecord?.network ?? identityRecord?.network ?? "bsc-testnet") === "bsc"
        ? "https://bscscan.com"
        : "https://testnet.bscscan.com";

    json(res, {
      nfa: nfaRecord
        ? {
            tokenId: nfaRecord.tokenId,
            contractAddress: nfaRecord.contractAddress,
            network: nfaRecord.network,
            ownerAddress: nfaRecord.ownerAddress,
            merkleRoot: nfaRecord.merkleRoot,
            mintTxHash: nfaRecord.mintTxHash,
            mintedAt: nfaRecord.mintedAt,
            lastUpdatedAt: nfaRecord.lastUpdatedAt,
            bscscanUrl: `${bscscanBase}/tx/${nfaRecord.mintTxHash}`,
          }
        : null,
      identity: identityRecord
        ? {
            agentId: identityRecord.agentId,
            network: identityRecord.network,
            ownerAddress: identityRecord.ownerAddress,
            agentURI: identityRecord.agentURI,
            registeredAt: identityRecord.registeredAt,
            scanUrl: `https://${identityRecord.network === "bsc" ? "www" : "testnet"}.8004scan.io/agent/${identityRecord.agentId}`,
          }
        : null,
      configured: !!(nfaRecord || identityRecord),
    });
    return true;
  }

  // ── GET /api/nfa/learnings ───────────────────────────────────────────
  if (method === "GET" && pathname === "/api/nfa/learnings") {
    const learningsPaths = [
      join(homedir(), ".milady", "LEARNINGS.md"),
      join(process.cwd(), "LEARNINGS.md"),
    ];

    let markdown: string | null = null;
    let resolvedSource: string | null = null;
    for (const p of learningsPaths) {
      try {
        markdown = await readFile(p, "utf8");
        resolvedSource = p;
        break;
      } catch {}
    }

    if (!markdown) {
      json(res, {
        entries: [],
        merkleRoot: emptyMerkleRoot(),
        totalEntries: 0,
        source: null,
      });
      return true;
    }

    const plugin = await getNfaPlugin();
    if (!plugin) {
      json(res, {
        entries: [],
        merkleRoot: emptyMerkleRoot(),
        totalEntries: 0,
        source: null,
      });
      return true;
    }

    const entries = plugin.parseLearnings(markdown);
    const leafHashes = entries.map((e) => e.hash);
    const merkleRoot = plugin.buildMerkleRoot(leafHashes);

    json(res, {
      entries,
      merkleRoot,
      totalEntries: entries.length,
      source: resolvedSource,
    });
    return true;
  }

  return false;
}
