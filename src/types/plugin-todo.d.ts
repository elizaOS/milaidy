declare module "@elizaos/plugin-todo" {
  import type { AgentRuntime } from "@elizaos/core";

  type TodoDataService = Record<string, unknown>;

  export function createTodoDataService(
    runtime: AgentRuntime,
  ): TodoDataService | null | undefined;
}
