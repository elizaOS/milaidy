import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@elizaos/core";
import {
  BnbIdentityService,
  parseLearningsMd,
  readIdentity,
  readNfa,
} from "../../packages/plugin-bnb-identity/src/index";
import type { NfaInfo } from "../../packages/plugin-bnb-identity/src/types";
import {
  type NfaLearningsResponse,
  type NfaRouteContext,
  type NfaStatusResponse,
  resolveNfaRpcUrl,
} from "./nfa-routes-shared";

export async function handleNfaReadRoutes(
  ctx: NfaRouteContext,
): Promise<boolean> {
  const { method, pathname, json, error, nfaContractAddress, workspaceDir } =
    ctx;

  if (method === "GET" && pathname === "/api/nfa/status") {
    try {
      const [identity, nfa] = await Promise.all([readIdentity(), readNfa()]);

      let onChain: NfaInfo | null = null;
      if (nfa && nfaContractAddress) {
        try {
          const svc = new BnbIdentityService(null, {
            network: nfa.network || "bsc",
            gatewayPort: 0,
            nfaContractAddress,
            rpcUrl: resolveNfaRpcUrl(),
          });
          onChain = await svc.getNfaInfo(nfa.tokenId);
        } catch (err) {
          logger.warn(
            `[nfa-routes] on-chain query failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      const contractAddress =
        typeof nfaContractAddress === "string" && nfaContractAddress.trim()
          ? nfaContractAddress.trim()
          : null;
      json(ctx.res, {
        identity,
        nfa,
        onChain,
        contractAddress,
      } satisfies NfaStatusResponse);
    } catch (err) {
      error(
        ctx.res,
        `Failed to read NFA status: ${err instanceof Error ? err.message : "unknown"}`,
        500,
      );
    }
    return true;
  }

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
