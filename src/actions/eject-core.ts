import type { Action } from "@elizaos/core";
import { requestRestart } from "../runtime/restart";
import { ejectCore } from "../services/core-eject";

export const ejectCoreAction: Action = {
  name: "EJECT_CORE",

  similes: ["FORK_CORE", "CLONE_CORE", "EDIT_CORE_SOURCE"],

  description:
    "Clone ElizaOS core source locally so edits override npm @elizaos/core.",

  validate: async () => true,

  handler: async () => {
    const result = await ejectCore();
    if (!result.success) {
      return {
        text: `Failed to eject @elizaos/core: ${result.error ?? "unknown error"}`,
        success: false,
      };
    }

    setTimeout(() => {
      requestRestart("Core ejected");
    }, 1_000);

    return {
      text: `Ejected @elizaos/core to ${result.ejectedPath}. Restarting to load local source.`,
      success: true,
      data: { ...result },
    };
  },
};
