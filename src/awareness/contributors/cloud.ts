/**
 * Cloud contributor — reports Eliza Cloud connection status.
 */
import type { AwarenessContributor } from "../../contracts/awareness";
import type { IAgentRuntime } from "@elizaos/core";

export const cloudContributor: AwarenessContributor = {
  id: "cloud",
  position: 70,
  cacheTtl: 60_000,
  invalidateOn: ["config-changed"],
  trusted: true,

  async summary(runtime: IAgentRuntime): Promise<string> {
    const elizaToken = runtime.getSetting?.("ELIZA_CLOUD_AUTH_TOKEN");
    const hyperToken = runtime.getSetting?.("HYPERSCAPE_AUTH_TOKEN");
    const connected = !!elizaToken || !!hyperToken;

    return connected ? "Cloud: connected" : "Cloud: disconnected";
  },
};
