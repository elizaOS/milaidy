declare module "@elizaos/plugin-secrets-manager";
declare module "@elizaos/plugin-cua";
declare module "@elizaos/plugin-obsidian";
declare module "@elizaos/plugin-code";
declare module "@elizaos/plugin-xai";
declare module "@elizaos/plugin-deepseek";
declare module "@elizaos/plugin-mistral";
declare module "@elizaos/plugin-together";
declare module "@elizaos/plugin-claude-code-workbench";
declare module "@elizaos/plugin-pi-ai" {
  // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
  export const piAiPlugin: any;
  // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
  export const getPiCredentials: any;
  // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
  export const parsePiModelSpec: any;
  // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
  export const parseModelSpec: any;
  // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
  export const listPiAiModelOptions: any;
  // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
  export const createPiCredentialProvider: any;
  // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
  export const getPiModel: any;
  // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
  export const registerPiAiModelHandler: any;
  // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
  export const PI_AI_PLUGIN_NAME: any;
  // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
  export const DEFAULT_PI_MODEL_SPEC: any;
  export interface StreamEvent {
    // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
    [key: string]: any;
  }
}
declare module "@elizaos/plugin-agent-orchestrator" {
  // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
  export const createCodingAgentRouteHandler: any;
  // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
  export const getCoordinator: any;
  export interface SwarmEvent {
    // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
    [key: string]: any;
  }
  export interface PTYService {
    // biome-ignore lint/suspicious/noExplicitAny: shim for npm package without types
    [key: string]: any;
  }
}
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
