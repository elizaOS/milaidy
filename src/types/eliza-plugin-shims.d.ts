declare module "@elizaos/plugin-secrets-manager";
declare module "@elizaos/plugin-cua";
declare module "@elizaos/plugin-obsidian";
declare module "@elizaos/plugin-code";
declare module "@elizaos/plugin-xai";
declare module "@elizaos/plugin-deepseek";
declare module "@elizaos/plugin-mistral";
declare module "@elizaos/plugin-together";
declare module "@elizaos/plugin-claude-code-workbench";

declare module "@elizaos/plugin-coding-agent" {
  import type { Plugin } from "@elizaos/core";
  // biome-ignore lint/suspicious/noExplicitAny: local workspace plugin
  export const createCodingAgentRouteHandler: any;
  // biome-ignore lint/suspicious/noExplicitAny: local workspace plugin
  export const getCoordinator: any;
  export const codingAgentPlugin: Plugin;
  export default codingAgentPlugin;
  export interface SwarmEvent {
    // biome-ignore lint/suspicious/noExplicitAny: local workspace plugin
    [key: string]: any;
  }
  export interface PTYService {
    // biome-ignore lint/suspicious/noExplicitAny: local workspace plugin
    [key: string]: any;
  }
}
