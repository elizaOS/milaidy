/**
 * Type declarations for @elizaos/plugin-todo.
 *
 * The published package ships JS-only (no .d.ts). This declaration covers
 * the dynamic import in @elizaos/autonomous (server.ts / eliza.ts) that
 * TypeScript resolves through the Bun source export condition.
 *
 * TODO: remove once plugin-todo publishes its own declarations.
 */
declare module "@elizaos/plugin-todo" {
  import type { AgentRuntime, Plugin } from "@elizaos/core";

  export interface TodoDataService {
    getTodos(): Promise<unknown[]>;
    getTodo(id: string): Promise<unknown | null>;
    createTodo(data: Record<string, unknown>): Promise<unknown>;
    updateTodo(id: string, data: Record<string, unknown>): Promise<void>;
  }

  export function createTodoDataService(runtime: AgentRuntime): TodoDataService;

  const todoPlugin: Plugin;
  export default todoPlugin;
}
