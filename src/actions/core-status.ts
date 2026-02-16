import type { Action } from "@elizaos/core";
import { getCoreStatus } from "../services/core-eject";

export const coreStatusAction: Action = {
  name: "CORE_STATUS",

  similes: ["CHECK_CORE_STATUS", "SHOW_CORE_STATUS", "CORE_EJECT_STATUS"],

  description:
    "Show whether @elizaos/core is running from npm or ejected source.",

  validate: async () => true,

  handler: async () => {
    const status = await getCoreStatus();

    if (!status.ejected) {
      return {
        text: `Using npm @elizaos/core v${status.version}.`,
        success: true,
        data: { ...status },
      };
    }

    const commit = status.commitHash
      ? status.commitHash.slice(0, 12)
      : "unknown";
    return {
      text: `Using ejected @elizaos/core v${status.version} at ${status.coreDistPath} (commit ${commit}).`,
      success: true,
      data: { ...status },
    };
  },
};
