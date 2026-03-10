import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parseLearningsMd,
  patchNfa,
  readNfa,
  writeNfa,
} from "../../packages/plugin-bnb-identity/src/index";
import { getLearningRoot } from "../../packages/plugin-bnb-identity/src/merkle-learning";
import {
  buildService,
  getNfaContractAddressError,
  type NfaRouteContext,
  readRequiredAddress,
  resolveAgentUri,
  resolvePrivateKey,
  validateMintOptions,
} from "./nfa-routes-shared";

const ZERO_LEARNING_ROOT = `0x${"0".repeat(64)}`;

export async function handleNfaWriteRoutes(
  ctx: NfaRouteContext,
): Promise<boolean> {
  const { method, pathname, error, nfaContractAddress, workspaceDir } = ctx;

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
        learningRoot: ZERO_LEARNING_ROOT,
        learningCount: 0,
        lastAnchoredAt: "",
        logicContract: undefined,
        paused: false,
        freeMint: result.freeMint,
        mintTxHash: result.txHash,
      });

      ctx.json(ctx.res, {
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

      ctx.json(ctx.res, {
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

      ctx.json(ctx.res, { success: true, txHash: result.txHash });
    } catch (err) {
      error(
        ctx.res,
        `Transfer failed: ${err instanceof Error ? err.message : "unknown"}`,
        500,
      );
    }
    return true;
  }

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

      ctx.json(ctx.res, {
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
      const result = nfa.paused
        ? await svc.unpauseNfa(nfa.tokenId)
        : await svc.pauseNfa(nfa.tokenId);

      await patchNfa({ paused: result.paused });

      ctx.json(ctx.res, {
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
