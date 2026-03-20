import { executeTradeAction } from "../actions/execute-trade.js";
import { transferTokenAction } from "../actions/transfer-token.js";
import { createElizaPlugin as createUpstreamElizaPlugin } from "@elizaos/autonomous/runtime/eliza-plugin";

export * from "@elizaos/autonomous/runtime/eliza-plugin";

/**
 * Extend upstream plugin actions with Milady wallet trading actions.
 * Keep this additive so upstream behavior remains unchanged.
 */
export function createElizaPlugin(
  ...args: Parameters<typeof createUpstreamElizaPlugin>
): ReturnType<typeof createUpstreamElizaPlugin> {
  const plugin = createUpstreamElizaPlugin(...args);
  const existing = new Set((plugin.actions ?? []).map((action) => action.name));
  const extras = [executeTradeAction, transferTokenAction].filter(
    (action) => !existing.has(action.name),
  );

  plugin.actions = [...(plugin.actions ?? []), ...extras];
  return plugin;
}
