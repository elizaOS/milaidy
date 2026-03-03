import type { Action } from "@elizaos/core";
import { requestRestart } from "../runtime/restart";
import { reinjectCore } from "../services/core-eject";

export const reinjectCoreAction: Action = {
  name: "REINJECT_CORE",

  similes: ["UNEJECT_CORE", "RESTORE_CORE", "REMOVE_LOCAL_CORE"],

  description:
    "Remove ejected core source so runtime falls back to npm @elizaos/core.",

  validate: async () => true,

  handler: async () => {
    const result = await reinjectCore();
    if (!result.success) {
      return {
        text: `Failed to reinject @elizaos/core: ${result.error ?? "unknown error"}`,
        success: false,
      };
    }

    setTimeout(() => {
      requestRestart("Core reinjected");
    }, 1_000);

    return {
      text: "Removed ejected @elizaos/core. Restarting to load npm version.",
      success: true,
      data: { ...result },
    };
  },
};
