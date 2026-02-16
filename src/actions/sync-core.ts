import type { Action } from "@elizaos/core";
import { syncCore } from "../services/core-eject";

export const syncCoreAction: Action = {
  name: "SYNC_CORE",

  similes: ["UPDATE_CORE", "PULL_CORE_UPSTREAM", "SYNC_EJECTED_CORE"],

  description:
    "Sync an ejected @elizaos/core checkout with upstream and rebuild it.",

  validate: async () => true,

  handler: async () => {
    const result = await syncCore();
    if (!result.success) {
      const conflictText =
        result.conflicts.length > 0
          ? ` Conflicts: ${result.conflicts.join(", ")}`
          : "";
      return {
        text: `Failed to sync @elizaos/core: ${result.error ?? "unknown error"}.${conflictText}`,
        success: false,
        data: { ...result },
      };
    }

    return {
      text: `Synced @elizaos/core (${result.upstreamCommits} upstream commits).`,
      success: true,
      data: { ...result },
    };
  },
};
