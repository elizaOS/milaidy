import { type IAgentRuntime, ModelType } from "@elizaos/core";
import { getProviders } from "@mariozechner/pi-ai";
import { createPiAiHandler } from "./pi-ai-model-handler-stream.js";
import type {
  PiAiConfig,
  PiAiModelHandlerController,
} from "./pi-ai-model-handler-types.js";

export type {
  PiAiConfig,
  PiAiModelHandlerController,
  StreamEvent,
  StreamEventCallback,
} from "./pi-ai-model-handler-types.js";

/**
 * Register pi-ai as the model provider for an ElizaOS runtime.
 *
 * Returns a controller that can be used to switch models without re-registering handlers.
 */
export function registerPiAiModelHandler(
  runtime: IAgentRuntime,
  config: PiAiConfig,
): PiAiModelHandlerController {
  let largeModel = config.largeModel;
  let smallModel = config.smallModel;

  const providerName = config.providerName ?? "pi-ai";
  const priority = config.priority ?? 1000;

  const handlerConfig = {
    onStreamEvent: config.onStreamEvent,
    getAbortSignal: config.getAbortSignal,
    getApiKey: config.getApiKey,
    returnTextStreamResult: config.returnTextStreamResult,
    forceStreaming: config.forceStreaming,
  };

  const largeHandler = createPiAiHandler(() => largeModel, handlerConfig);
  const smallHandler = createPiAiHandler(() => smallModel, handlerConfig);

  const aliases = new Set<string>([
    providerName,
    ...(config.providerAliases ?? []),
    // Also register under all known pi-ai provider names so ElizaOS calls like
    // runtime.useModel(..., provider="anthropic") still route through pi-ai.
    ...getProviders(),
  ]);

  for (const alias of aliases) {
    runtime.registerModel(ModelType.TEXT_LARGE, largeHandler, alias, priority);
    runtime.registerModel(ModelType.TEXT_SMALL, smallHandler, alias, priority);

    // Also cover reasoning model types used by some prompt pipelines.
    runtime.registerModel(
      ModelType.TEXT_REASONING_LARGE,
      largeHandler,
      alias,
      priority,
    );
    runtime.registerModel(
      ModelType.TEXT_REASONING_SMALL,
      smallHandler,
      alias,
      priority,
    );
  }

  return {
    getLargeModel: () => largeModel,
    setLargeModel: (model) => {
      largeModel = model;
    },
    getSmallModel: () => smallModel,
    setSmallModel: (model) => {
      smallModel = model;
    },
  };
}
