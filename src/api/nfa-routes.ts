/**
 * NFA (BAP-578) + ERC-8004 Identity API routes.
 *
 * GET /api/nfa/status   — combined identity + NFA + on-chain state
 * GET /api/nfa/learnings — parsed learning entries + Merkle root
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@elizaos/core";
import {
  readIdentity,
  readNfa,
  BnbIdentityService,
} from "../../packages/plugin-bnb-identity/src/index";
import type {
  IdentityRecord,
  NfaRecord,
  NfaInfo,
  LearningLeaf,
} from "../../packages/plugin-bnb-identity/src/types";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

export interface NfaRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "json" | "error"> {
  /** BAP-578 contract address from env, or undefined. */
  nfaContractAddress?: string;
  /** Workspace directory for reading LEARNINGS.md. */
  workspaceDir: string;
}

export interface NfaStatusResponse {
  identity: IdentityRecord | null;
  nfa: NfaRecord | null;
  onChain: NfaInfo | null;
}

export interface NfaLearningsResponse {
  entries: LearningLeaf[];
  root: string;
  count: number;
}

export async function handleNfaRoutes(
  ctx: NfaRouteContext,
): Promise<boolean> {
  const { method, pathname, json, error, nfaContractAddress, workspaceDir } =
    ctx;

  // ── GET /api/nfa/status ─────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/nfa/status") {
    try {
      const [identity, nfa] = await Promise.all([
        readIdentity(),
        readNfa(),
      ]);

      let onChain: NfaInfo | null = null;
      if (nfa && nfaContractAddress) {
        try {
          const svc = new BnbIdentityService(null as never, {
            network: nfa.network || "bsc",
            gatewayPort: 0,
            nfaContractAddress,
          });
          onChain = await svc.getNfaInfo(nfa.tokenId);
        } catch (err) {
          logger.warn(
            `[nfa-routes] on-chain query failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      json(ctx.res, { identity, nfa, onChain } satisfies NfaStatusResponse);
    } catch (err) {
      error(
        ctx.res,
        `Failed to read NFA status: ${err instanceof Error ? err.message : "unknown"}`,
        500,
      );
    }
    return true;
  }

  // ── GET /api/nfa/learnings ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/nfa/learnings") {
    try {
      const learningsPath = join(workspaceDir, "LEARNINGS.md");
      let raw: string;
      try {
        raw = await readFile(learningsPath, "utf8");
      } catch {
        json(ctx.res, {
          entries: [],
          root: "",
          count: 0,
        } satisfies NfaLearningsResponse);
        return true;
      }

      const entries = parseLearningsMd(raw);
      const nfa = await readNfa();
      json(ctx.res, {
        entries,
        root: nfa?.learningRoot ?? "",
        count: entries.length,
      } satisfies NfaLearningsResponse);
    } catch (err) {
      error(
        ctx.res,
        `Failed to read learnings: ${err instanceof Error ? err.message : "unknown"}`,
        500,
      );
    }
    return true;
  }

  return false;
}

/** Parse LEARNINGS.md into structured entries. */
function parseLearningsMd(raw: string): LearningLeaf[] {
  const entries: LearningLeaf[] = [];
  const lines = raw.split("\n");
  let current: Partial<LearningLeaf> | null = null;

  for (const line of lines) {
    // Entry header: ## [category] — summary
    const headerMatch = line.match(
      /^##\s+\[(\w+)]\s*[—–-]\s*(.+)$/,
    );
    if (headerMatch) {
      if (current?.id) entries.push(current as LearningLeaf);
      current = {
        category: headerMatch[1] as LearningLeaf["category"],
        summary: headerMatch[2].trim(),
        id: "",
        timestamp: "",
        contentHash: "",
      };
      continue;
    }

    if (!current) continue;

    // Metadata lines: `id: ...`, `timestamp: ...`, `hash: ...`
    const idMatch = line.match(/^id:\s*(.+)$/i);
    if (idMatch) {
      current.id = idMatch[1].trim();
      continue;
    }
    const tsMatch = line.match(/^timestamp:\s*(.+)$/i);
    if (tsMatch) {
      current.timestamp = tsMatch[1].trim();
      continue;
    }
    const hashMatch = line.match(/^hash:\s*(.+)$/i);
    if (hashMatch) {
      current.contentHash = hashMatch[1].trim();
      continue;
    }
  }
  if (current?.id) entries.push(current as LearningLeaf);
  return entries;
}
