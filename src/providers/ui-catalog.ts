import {
  ChannelType,
  type IAgentRuntime,
  type Memory,
  type Provider,
  type State,
} from "@elizaos/core";
import { COMPONENT_CATALOG } from "../shared/ui-catalog-prompt";

export const uiCatalogProvider: Provider = {
  name: "uiCatalog",
  get: async (_runtime: IAgentRuntime, message: Memory, _state: State) => {
    const channelType = message.content?.channelType;
    const isAllowedChannel =
      channelType === ChannelType.DM ||
      channelType === ChannelType.API ||
      !channelType;
    if (!isAllowedChannel) {
      return { text: "" };
    }

    const catalogSummary = Object.entries(COMPONENT_CATALOG)
      .map(([name, meta]) => `- ${name}: ${meta.description}`)
      .join("\n");
    return { text: `Available UI Components:\n${catalogSummary}` };
  },
};
