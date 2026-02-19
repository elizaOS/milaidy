import {
  ChannelType,
  createMessageMemory,
  runWithRequestContext,
  stringToUuid,
  type AgentRuntime,
  type ActionParameters,
  type HandlerOptions,
  type Memory,
  type UUID,
} from "@elizaos/core";
import { MultiUserError, type ExecutionBackend } from "./service.js";

function ensureActionParameters(
  input: Record<string, unknown> | undefined,
): ActionParameters {
  if (!input) return {};
  // Strip undefined/functions/symbols. This also ensures nested structures are JSON-safe.
  return JSON.parse(JSON.stringify(input)) as ActionParameters;
}

export function createElizaExecutionBackend(args: {
  getRuntime: () => AgentRuntime | null;
  getEntitySettings: (
    userId: string,
  ) => Map<string, string | boolean | number | null>;
}): ExecutionBackend {
  return async ({ userId, executionJobId, integrationId, action, params }) => {
    const runtime = args.getRuntime();
    if (!runtime) {
      throw new MultiUserError(
        "Agent runtime is not running",
        503,
        "RUNTIME_NOT_RUNNING",
      );
    }

    const roomId = stringToUuid(`v2-actions-room:${userId}`);
    const worldId = stringToUuid(`v2-actions-world:${userId}`);
    await runtime.ensureConnection({
      entityId: userId as UUID,
      roomId,
      worldId,
      userName: "User",
      source: "v2_actions",
      channelId: `v2-actions:${userId}`,
      // Avoid core "settings onboarding" provider paths that assume server ownership.
      type: ChannelType.SELF,
    });

    const message: Memory = createMessageMemory({
      id: stringToUuid(`v2-actions-msg:${executionJobId}`),
      entityId: userId as UUID,
      roomId,
      content: {
        text: `Execute action "${action}" for integration "${integrationId}".`,
        source: "v2_actions",
        channelType: ChannelType.SELF,
      },
    });

    const entitySettings = args.getEntitySettings(userId);

    return await runWithRequestContext(
      {
        entityId: userId as UUID,
        agentId: runtime.agentId,
        entitySettings,
        requestStartTime: Date.now(),
      },
      async () => {
        const state = await runtime.composeState(message, [
          "RECENT_MESSAGES",
          "ACTION_STATE",
        ]);
        const targetAction = runtime.actions.find((a) => a.name === action);
        if (!targetAction) {
          throw new MultiUserError(
            `Unknown action: ${action}`,
            404,
            "ACTION_NOT_FOUND",
          );
        }

        const allowed = await targetAction.validate(runtime, message, state);
        if (!allowed) {
          throw new MultiUserError(
            "Action rejected by validator",
            403,
            "ACTION_FORBIDDEN",
          );
        }

        const handlerOptions: HandlerOptions = {
          parameters: ensureActionParameters(
            params as Record<string, unknown> | undefined,
          ),
        };

        const result = await targetAction.handler(
          runtime,
          message,
          state,
          handlerOptions,
        );
        const success = result?.success ?? true;
        if (result?.cleanup) {
          await result.cleanup();
        }

        if (!success) {
          const errText =
            typeof result?.text === "string" && result.text.trim()
              ? result.text.trim()
              : "Action failed";
          throw new MultiUserError(errText, 502, "ACTION_FAILED");
        }

        const out: Record<string, unknown> = {
          simulated: false,
          integrationId,
          action,
          success: true,
        };
        if (typeof result?.text === "string" && result.text.trim())
          out.message = result.text.trim();
        if (result?.data && typeof result.data === "object")
          out.data = result.data as Record<string, unknown>;
        if (result?.values && typeof result.values === "object")
          out.values = result.values as Record<string, unknown>;
        return out;
      },
    );
  };
}
