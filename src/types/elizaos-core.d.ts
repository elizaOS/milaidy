/**
 * Ambient module declaration for @elizaos/core.
 *
 * The alpha-tagged npm package ships without type declarations.
 * This stub prevents TS2307/TS2709 errors until the upstream package
 * publishes proper .d.ts files. Delete this file when it does.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "@elizaos/core" {
  // Types used via `import type { ... }`
  export interface Action {
    name: string;
    description?: string;
    validate?: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<boolean>;
    handler?: (runtime: IAgentRuntime, message: Memory, state?: State, options?: HandlerOptions) => Promise<any>;
    examples?: ActionExample[][];
    [key: string]: any;
  }
  export interface ActionResult {
    [key: string]: any;
  }
  export interface ActionExample {
    [key: string]: any;
  }
  export interface ActionParameter {
    [key: string]: any;
  }
  export interface ActionParameters {
    [key: string]: any;
  }
  export interface HandlerOptions {
    [key: string]: any;
  }
  export interface HandlerCallback {
    (...args: any[]): any;
  }
  export interface IAgentRuntime {
    character: any;
    getService(name: string): any;
    registerPlugin(plugin: any): Promise<void>;
    initialize(): Promise<void>;
    stop(): Promise<void>;
    [key: string]: any;
  }
  export interface Memory {
    [key: string]: any;
  }
  export interface State {
    [key: string]: any;
  }
  export interface Content {
    [key: string]: any;
  }
  export interface Media {
    [key: string]: any;
  }
  export interface Task {
    [key: string]: any;
  }
  export interface Room {
    [key: string]: any;
  }
  export interface Plugin {
    name: string;
    description?: string;
    [key: string]: any;
  }
  export interface Provider {
    [key: string]: any;
  }
  export interface ProviderResult {
    [key: string]: any;
  }
  export interface ServiceClass {
    new (...args: any[]): any;
    [key: string]: any;
  }
  export interface TargetInfo {
    [key: string]: any;
  }
  export interface GenerateTextParams {
    [key: string]: any;
  }
  export interface TokenUsage {
    [key: string]: any;
  }
  export interface JsonValue {}
  export interface ActionEventPayload {
    [key: string]: any;
  }

  export interface TextStreamResult {
    [key: string]: any;
  }
  export interface ActionEventPayloadLike {
    [key: string]: any;
  }
  export interface AgentEventServiceLike {
    [key: string]: any;
  }

  export type UUID = string;
  export const EventType: Record<string, string>;

  // Values used via `import { ... }`
  export const logger: any;
  export const elizaLogger: any;
  export const ChannelType: any;
  export const ContentType: any;
  export const ModelType: any;
  export function stringToUuid(str: string): UUID;
  export function createMessageMemory(opts: any): any;
  export function mergeCharacterDefaults(character: any, defaults: any): any;
  export function addLogListener(listener: any): any;
  export function createUniqueUuid(...args: any[]): UUID;

  // Classes
  export class AgentRuntime implements IAgentRuntime {
    character: any;
    agentId: UUID;
    getService(name: string): any;
    getRoom(id: UUID): any;
    adapter: any;
    registerPlugin(plugin: any): Promise<void>;
    initialize(): Promise<void>;
    stop(): Promise<void>;
    updateAgent(config: any): Promise<void>;
    [key: string]: any;
  }
  export class Service {
    static start(runtime: any): Promise<any>;
    constructor(...args: any[]);
    [key: string]: any;
  }
  export class AgentEventService extends Service {}
  export class AutonomyService extends Service {}
}
