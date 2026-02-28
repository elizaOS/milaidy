/**
 * Permissions contributor — reports shell and OS permission states.
 */
import type { AwarenessContributor } from "../../contracts/awareness";
import type { IAgentRuntime } from "@elizaos/core";

export const permissionsContributor: AwarenessContributor = {
  id: "permissions",
  position: 20,
  cacheTtl: 120_000,
  invalidateOn: ["permission-changed"],
  trusted: true,

  async summary(runtime: IAgentRuntime): Promise<string> {
    const shellRaw = runtime.getSetting?.("SHELL_ENABLED");
    const shellEnabled = shellRaw === true || shellRaw === "true";
    const shellIcon = shellEnabled ? "\u2713" : "\u2717";

    const isDarwin =
      typeof process !== "undefined" && process.platform === "darwin";

    if (isDarwin) {
      return `Perms: shell${shellIcon} a11y? camera? mic? screen?`;
    }

    return `Perms: shell${shellIcon}`;
  },
};
