import type { IAgentRuntime, Memory } from "@elizaos/core";
import {
  loadBnbIdentityConfig,
  type ResolvedBnbIdentityConfig,
} from "./config.js";
import { parseLearningsMd } from "./learnings.js";
import type { LearningLeaf } from "./types.js";

export { loadBnbIdentityConfig };
export type { ResolvedBnbIdentityConfig };

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

export function networkLabelForDisplay(network: string): string {
  return network === "bsc"
    ? "BSC Mainnet (REAL MONEY)"
    : `${network} (testnet)`;
}

/**
 * Extracts a 0x-prefixed Ethereum address from message text.
 */
export function extractAddress(text: string): string | undefined {
  const match = text.match(/\b(0x[0-9a-fA-F]{40})\b/);
  return match?.[1];
}

export async function readLearningEntries(
  runtime: IAgentRuntime,
): Promise<LearningLeaf[]> {
  const workspaceDir = String(
    runtime.getSetting("MILADY_WORKSPACE_DIR") ??
      runtime.getSetting("WORKSPACE_DIR") ??
      ".milady/workspace",
  );

  const { readFile } = await import("node:fs/promises");
  const { join, isAbsolute } = await import("node:path");
  const { homedir } = await import("node:os");

  const resolvedDir = isAbsolute(workspaceDir)
    ? workspaceDir
    : join(homedir(), workspaceDir);

  const learningsPath = join(resolvedDir, "LEARNINGS.md");

  let content: string;
  try {
    content = await readFile(learningsPath, "utf8");
  } catch {
    return [];
  }

  return parseLearningsMd(content);
}
