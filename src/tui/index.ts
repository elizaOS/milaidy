import process from "node:process";
import type { AgentRuntime } from "@elizaos/core";
import { Text } from "@elizaos/tui";
import type { Api, Model } from "@mariozechner/pi-ai";
import { registerPiAiModelHandler } from "../runtime/pi-ai-model-handler.js";
import { createPiCredentialProvider } from "../runtime/pi-credentials.js";
import {
  DEFAULT_PI_MODEL_SPEC,
  getPiModel,
  parseModelSpec,
} from "../utils/pi-ai.js";
import { ElizaTUIBridge } from "./eliza-tui-bridge.js";
import { MilaidyTUI } from "./tui-app.js";

export { registerPiAiModelHandler } from "../runtime/pi-ai-model-handler.js";
export { ElizaTUIBridge } from "./eliza-tui-bridge.js";
export { MilaidyTUI } from "./tui-app.js";

export interface LaunchTUIOptions {
  /** Override model, format: provider/modelId (e.g. anthropic/claude-sonnet-4-20250514) */
  modelOverride?: string;
}

export async function launchTUI(
  runtime: AgentRuntime,
  options: LaunchTUIOptions = {},
): Promise<void> {
  const piCreds = await createPiCredentialProvider();

  const modelSpec =
    options.modelOverride ??
    (await piCreds.getDefaultModelSpec()) ??
    DEFAULT_PI_MODEL_SPEC;

  const { provider, id } = parseModelSpec(modelSpec);

  const largeModel = getPiModel(provider, id);
  const smallModel = largeModel;

  const tui = new MilaidyTUI({ runtime });
  const bridge = new ElizaTUIBridge(runtime, tui);

  const controller = registerPiAiModelHandler(runtime, {
    largeModel,
    smallModel,
    onStreamEvent: (event) => bridge.onStreamEvent(event),
    getAbortSignal: () => bridge.getAbortSignal(),
    getApiKey: (p) => piCreds.getApiKey(p),
  });

  tui.getStatusBar().update({
    modelId: controller.getLargeModel().id,
    modelProvider: controller.getLargeModel().provider,
  });

  const switchModel = (model: Model<Api>): void => {
    controller.setLargeModel(model);
    controller.setSmallModel(model);

    tui.getStatusBar().update({
      modelId: model.id,
      modelProvider: model.provider,
    });

    if (!piCreds.hasCredentials(model.provider)) {
      tui.addToChatContainer(
        new Text(
          `Warning: no credentials found for provider "${model.provider}" (neither Milaidy env nor pi auth). ` +
            "Model calls may fail.",
          1,
          0,
        ),
      );
    }

    tui.addToChatContainer(
      new Text(`Switched model to ${model.provider}/${model.id}`, 1, 0),
    );
  };

  tui.setOnSubmit(async (text) => {
    if (text.startsWith("/")) {
      const [cmdRaw, ...args] = text.slice(1).trim().split(/\s+/);
      const cmd = (cmdRaw ?? "").toLowerCase();
      const argText = args.join(" ").trim();

      try {
        if (cmd === "model" || cmd === "models") {
          if (!argText) {
            tui.openModelSelector();
            return;
          }

          const { provider: p, id: m } = parseModelSpec(argText);
          const model = getPiModel(p, m);
          switchModel(model);
          return;
        }

        if (cmd === "help") {
          tui.addToChatContainer(
            new Text(
              [
                "Commands:",
                "  /model            open model selector",
                "  /model <p/id>     switch model (e.g. anthropic/claude-sonnet-4-20250514)",
                "  /clear            clear chat",
                "  /exit             quit",
              ].join("\n"),
              1,
              0,
            ),
          );
          return;
        }

        if (cmd === "clear") {
          tui.clearChat();
          return;
        }

        if (cmd === "exit" || cmd === "quit") {
          await tui.stop();
          await runtime.stop();
          process.exit(0);
        }

        // Unknown command
        tui.addToChatContainer(
          new Text(`Unknown command: /${cmd}. Try /help`, 1, 0),
        );
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        tui.addToChatContainer(new Text(`Command error: ${msg}`, 1, 0));
        return;
      }
    }

    await bridge.handleUserInput(text);
  });
  tui.setOnToggleToolExpand((expanded) =>
    bridge.setToolOutputExpanded(expanded),
  );

  tui.setOnCtrlC(() => {
    if (bridge.getIsProcessing()) {
      bridge.abortInFlight();
      return;
    }

    void (async () => {
      try {
        await tui.stop();
      } finally {
        await runtime.stop();
        process.exit(0);
      }
    })();
  });

  tui.setModelSelectorHandlers({
    getCurrentModel: () => controller.getLargeModel(),
    hasCredentials: (provider) => piCreds.hasCredentials(provider),
    onSelectModel: (model) => {
      try {
        switchModel(model);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        tui.addToChatContainer(new Text(`Model switch error: ${msg}`, 1, 0));
      }
    },
  });

  await bridge.initialize();
  await tui.start();
}
