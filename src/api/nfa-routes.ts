/**
 * API routes for BAP-578 NFA (Non-Fungible Agent) status and learnings.
 *
 *   GET /api/nfa/status    — NFA state composed with ERC-8004 identity
 *   GET /api/nfa/learnings — Parsed LEARNINGS.md with Merkle root
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  buildMerkleRoot,
  parseLearnings,
  sha256,
} from "@milady/plugin-bnb-identity";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

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
        merkleRoot: sha256(""),
        totalEntries: 0,
        source: null,
      });
      return true;
    }

    const entries = parseLearnings(markdown);
    const leafHashes = entries.map((e) => e.hash);
    const merkleRoot = buildMerkleRoot(leafHashes);

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
