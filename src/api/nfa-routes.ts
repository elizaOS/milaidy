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
  BnbIdentityService,
  parseLearningsMd,
  patchNfa,
  readIdentity,
  readNfa,
  writeNfa,
} from "../../packages/plugin-bnb-identity/src/index";
import { getLearningRoot } from "../../packages/plugin-bnb-identity/src/merkle-learning";
import type {
  IdentityRecord,
  LearningLeaf,
  NfaInfo,
  NfaRecord,
} from "../../packages/plugin-bnb-identity/src/types";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

export interface NfaRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "json" | "error"> {
  /** BAP-578 contract address from env, or undefined. */
  nfaContractAddress?: string;
  /** Workspace directory for reading LEARNINGS.md. */
  workspaceDir: string;
  /** Read the JSON request body. */
  readJsonBody: () => Promise<Record<string, unknown> | null>;
}

export interface NfaStatusResponse {
  identity: IdentityRecord | null;
  nfa: NfaRecord | null;
  onChain: NfaInfo | null;
  contractAddress: string | null;
}

export interface NfaLearningsResponse {
  entries: LearningLeaf[];
  root: string;
  count: number;
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const VAULT_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

export async function handleNfaRoutes(ctx: NfaRouteContext): Promise<boolean> {
  const { method, pathname, json, error, nfaContractAddress, workspaceDir } =
    ctx;

  // ── GET /api/nfa/status ─────────────────────────────────────────────
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

  // ── POST /api/nfa/mint ───────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/nfa/mint") {
    try {
      const contractAddressError =
        getNfaContractAddressError(nfaContractAddress);
      if (contractAddressError) {
        error(ctx.res, contractAddressError, 400);
        return true;
      }
      const body = (await ctx.readJsonBody()) ?? {};
      const privateKey = resolvePrivateKey(body);
      const agentURI = await resolveAgentUri(body);
      const mintOptions = validateMintOptions(body);
      if ("error" in mintOptions) {
        error(ctx.res, mintOptions.error, 400);
        return true;
      }

      const svc = buildService(
        privateKey,
        nfaContractAddress,
        body.network as string | undefined,
      );

      const result = await svc.mintNfa(agentURI, mintOptions);

      await writeNfa({
        tokenId: result.tokenId,
        network: result.network,
        owner: result.owner,
        learningRoot: "",
        learningCount: 0,
        lastAnchoredAt: "",
        logicContract: undefined,
        paused: false,
        freeMint: result.freeMint,
        mintTxHash: result.txHash,
      });

      json(ctx.res, {
        success: true,
        txHash: result.txHash,
        tokenId: result.tokenId,
        freeMint: result.freeMint,
      });
    } catch (err) {
      error(
        ctx.res,
        `Mint failed: ${err instanceof Error ? err.message : "unknown"}`,
        500,
      );
    }
    return true;
  }

  // ── POST /api/nfa/anchor ──────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/nfa/anchor") {
    try {
      const contractAddressError =
        getNfaContractAddressError(nfaContractAddress);
      if (contractAddressError) {
        error(ctx.res, contractAddressError, 400);
        return true;
      }
      const body = (await ctx.readJsonBody()) ?? {};
      const privateKey = resolvePrivateKey(body);
      const nfa = await readNfa();

      if (!nfa) {
        error(ctx.res, "No NFA record found. Mint first.", 400);
        return true;
      }

      const learningsPath = join(workspaceDir, "LEARNINGS.md");
      let raw: string;
      try {
        raw = await readFile(learningsPath, "utf8");
      } catch {
        error(ctx.res, "LEARNINGS.md not found in workspace", 400);
        return true;
      }

      const entries = parseLearningsMd(raw);
      const newRoot = getLearningRoot(entries);

      const svc = buildService(privateKey, nfaContractAddress, nfa.network);
      const result = await svc.updateLearningRoot(nfa.tokenId, newRoot);

      await patchNfa({
        learningRoot: newRoot,
        learningCount: entries.length,
        lastAnchoredAt: new Date().toISOString(),
      });

      json(ctx.res, {
        success: true,
        txHash: result.txHash,
        previousRoot: result.previousRoot,
        newRoot: result.newRoot,
        entryCount: entries.length,
      });
    } catch (err) {
      error(
        ctx.res,
        `Anchor failed: ${err instanceof Error ? err.message : "unknown"}`,
        500,
      );
    }
    return true;
  }

  // ── POST /api/nfa/transfer ────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/nfa/transfer") {
    try {
      const contractAddressError =
        getNfaContractAddressError(nfaContractAddress);
      if (contractAddressError) {
        error(ctx.res, contractAddressError, 400);
        return true;
      }
      const body = (await ctx.readJsonBody()) ?? {};
      const privateKey = resolvePrivateKey(body);
      const to = readRequiredAddress(body, "to");
      if ("error" in to) {
        error(ctx.res, to.error, 400);
        return true;
      }

      const nfa = await readNfa();
      if (!nfa) {
        error(ctx.res, "No NFA record found. Mint first.", 400);
        return true;
      }

      if (nfa.freeMint) {
        error(ctx.res, "Free-minted NFAs are non-transferable.", 400);
        return true;
      }

      const svc = buildService(privateKey, nfaContractAddress, nfa.network);
      const result = await svc.transferNfa(nfa.tokenId, to.value);

      await patchNfa({ owner: to.value });

      json(ctx.res, { success: true, txHash: result.txHash });
    } catch (err) {
      error(
        ctx.res,
        `Transfer failed: ${err instanceof Error ? err.message : "unknown"}`,
        500,
      );
    }
    return true;
  }

  // ── POST /api/nfa/upgrade-logic ───────────────────────────────────────
  if (method === "POST" && pathname === "/api/nfa/upgrade-logic") {
    try {
      const contractAddressError =
        getNfaContractAddressError(nfaContractAddress);
      if (contractAddressError) {
        error(ctx.res, contractAddressError, 400);
        return true;
      }
      const body = (await ctx.readJsonBody()) ?? {};
      const privateKey = resolvePrivateKey(body);
      const newLogicAddress = readRequiredAddress(body, "newLogicAddress");
      if ("error" in newLogicAddress) {
        error(ctx.res, newLogicAddress.error, 400);
        return true;
      }

      const nfa = await readNfa();
      if (!nfa) {
        error(ctx.res, "No NFA record found. Mint first.", 400);
        return true;
      }

      const svc = buildService(privateKey, nfaContractAddress, nfa.network);
      const result = await svc.upgradeLogic(nfa.tokenId, newLogicAddress.value);

      await patchNfa({ logicContract: newLogicAddress.value });

      json(ctx.res, {
        success: true,
        txHash: result.txHash,
        previousLogic: result.previousLogic,
        newLogic: result.newLogic,
      });
    } catch (err) {
      error(
        ctx.res,
        `Upgrade failed: ${err instanceof Error ? err.message : "unknown"}`,
        500,
      );
    }
    return true;
  }

  // ── POST /api/nfa/pause ───────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/nfa/pause") {
    try {
      const contractAddressError =
        getNfaContractAddressError(nfaContractAddress);
      if (contractAddressError) {
        error(ctx.res, contractAddressError, 400);
        return true;
      }
      const body = (await ctx.readJsonBody()) ?? {};
      const privateKey = resolvePrivateKey(body);
      const nfa = await readNfa();

      if (!nfa) {
        error(ctx.res, "No NFA record found. Mint first.", 400);
        return true;
      }

      const svc = buildService(privateKey, nfaContractAddress, nfa.network);

      // Toggle based on current state
      const result = nfa.paused
        ? await svc.unpauseNfa(nfa.tokenId)
        : await svc.pauseNfa(nfa.tokenId);

      await patchNfa({ paused: result.paused });

      json(ctx.res, {
        success: true,
        txHash: result.txHash,
        paused: result.paused,
      });
    } catch (err) {
      error(
        ctx.res,
        `Pause toggle failed: ${err instanceof Error ? err.message : "unknown"}`,
        500,
      );
    }
    return true;
  }

  return false;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Resolve which private key to use based on body.useWalletKey. */
function resolvePrivateKey(body: Record<string, unknown>): string {
  if (body.useWalletKey) {
    const key = process.env.EVM_PRIVATE_KEY;
    if (!key) throw new Error("EVM_PRIVATE_KEY not set");
    return key;
  }
  const key = process.env.BNB_PRIVATE_KEY;
  if (!key) throw new Error("BNB_PRIVATE_KEY not set");
  return key;
}

/** Build a BnbIdentityService for route-level usage. */
function buildService(
  privateKey: string,
  nfaContractAddress: string | undefined,
  network?: string,
): BnbIdentityService {
  return new BnbIdentityService(null, {
    privateKey,
    network: network || "bsc",
    gatewayPort: 0,
    nfaContractAddress,
    rpcUrl: resolveNfaRpcUrl(),
  });
}

function resolveNfaRpcUrl(): string | undefined {
  const rpcUrl =
    process.env.BSC_RPC_URL?.trim() || process.env.BNB_RPC_URL?.trim();
  return rpcUrl || undefined;
}

function readRequiredAddress(
  body: Record<string, unknown>,
  key: string,
): { value: string } | { error: string } {
  const raw = body[key];
  if (typeof raw !== "string" || !raw.trim()) {
    return { error: `Missing required field: ${key}` };
  }

  const value = raw.trim();
  if (!ADDRESS_RE.test(value)) {
    return { error: `${key} must be a 0x-prefixed 40-byte hex address.` };
  }

  return { value };
}

function readOptionalString(
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
): { value: string } | { error: string } {
  const raw = body[key];
  if (raw === undefined || raw === null) {
    return { value: "" };
  }

  if (typeof raw !== "string") {
    return { error: `${key} must be a string.` };
  }

  const value = raw.trim();
  if (value.length > maxLength) {
    return { error: `${key} must be at most ${maxLength} characters.` };
  }

  return { value };
}

function validateMintOptions(body: Record<string, unknown>):
  | {
      persona: string;
      experience: string;
      voiceHash: string;
      animationURI: string;
      vaultURI: string;
      vaultHash: string;
    }
  | { error: string } {
  const persona = readOptionalString(body, "persona", 280);
  if ("error" in persona) return persona;

  const experience = readOptionalString(body, "experience", 500);
  if ("error" in experience) return experience;

  const voiceHash = readOptionalString(body, "voiceHash", 128);
  if ("error" in voiceHash) return voiceHash;

  const animationURI = readOptionalString(body, "animationURI", 2048);
  if ("error" in animationURI) return animationURI;

  const vaultURI = readOptionalString(body, "vaultURI", 2048);
  if ("error" in vaultURI) return vaultURI;

  const vaultHash = readOptionalString(body, "vaultHash", 66);
  if ("error" in vaultHash) return vaultHash;
  if (vaultHash.value && !VAULT_HASH_RE.test(vaultHash.value)) {
    return { error: "vaultHash must be a 0x-prefixed 32-byte hex string." };
  }

  return {
    persona: persona.value,
    experience: experience.value,
    voiceHash: voiceHash.value,
    animationURI: animationURI.value,
    vaultURI: vaultURI.value,
    vaultHash: vaultHash.value || `0x${"0".repeat(64)}`,
  };
}

function getNfaContractAddressError(
  nfaContractAddress: string | undefined,
): string | null {
  if (typeof nfaContractAddress === "string" && nfaContractAddress.trim()) {
    return null;
  }
  return (
    "BAP578_CONTRACT_ADDRESS is not configured. " +
    "Set env.BAP578_CONTRACT_ADDRESS in ~/.milady/milady.json and restart Milady."
  );
}

/** Resolve agentURI from request, identity store, or safe data: URI fallback. */
async function resolveAgentUri(body: Record<string, unknown>): Promise<string> {
  const requestUri =
    typeof body.agentURI === "string" ? body.agentURI.trim() : "";
  if (requestUri) return requestUri;

  const identity = await readIdentity();
  const storedUri = identity?.agentURI?.trim();
  if (storedUri) return storedUri;

  const fallbackMetadata = {
    name: "Milady",
    description:
      "Milady local AI agent metadata used as fallback URI for BAP-578 minting.",
    version: "0.1.0",
    created: new Date().toISOString(),
    services: [],
    capabilities: ["local-execution", "privacy-preserving"],
    platforms: ["webchat"],
  };
  const encoded = Buffer.from(
    JSON.stringify(fallbackMetadata),
    "utf8",
  ).toString("base64");
  return `data:application/json;base64,${encoded}`;
}
