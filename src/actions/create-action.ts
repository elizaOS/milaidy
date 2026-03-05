/**
 * CREATE_ACTION action — lets the agent create new custom actions at runtime.
 * Gated on ENABLE_SELF_EVOLUTION character setting.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { loadMiladyConfig, saveMiladyConfig } from "../config/config";
import type { CustomActionDef, CustomActionHandler } from "../contracts/config";
import { registerCustomActionLive } from "../runtime/custom-actions";
import {
  validateCodeHandler,
  validateShellCommand,
} from "../services/creation-safety";
import {
  getLearningStore,
  isSelfEvolutionEnabled,
} from "../services/learning-store";

export const createActionAction: Action = {
  name: "CREATE_ACTION",
  similes: ["MAKE_ACTION", "ADD_ACTION", "DEFINE_ACTION"],
  description:
    "Create a new custom action at runtime. Supports http, shell, and code handler types. Requires ENABLE_SELF_EVOLUTION setting.",

  validate: async (runtime, message) => {
    const settings = runtime.character?.settings as
      | Record<string, unknown>
      | undefined;
    if (!isSelfEvolutionEnabled(settings)) return false;
    // Keyword gate — only show when relevant to save tokens
    const text = message.content?.text?.toLowerCase() ?? "";
    return [
      "create action",
      "make action",
      "add action",
      "define action",
      "new action",
    ].some((kw) => text.includes(kw));
  },

  handler: async (runtime, _message, _state, options) => {
    const settings = runtime.character?.settings as
      | Record<string, unknown>
      | undefined;
    if (!isSelfEvolutionEnabled(settings)) {
      return {
        text: "Self-evolution is disabled. Set ENABLE_SELF_EVOLUTION=true in character settings to enable.",
        success: false,
      };
    }

    const params = (options as HandlerOptions | undefined)?.parameters;
    const actionName =
      typeof params?.actionName === "string"
        ? params.actionName.trim().toUpperCase()
        : undefined;
    const actionDescription =
      typeof params?.actionDescription === "string"
        ? params.actionDescription.trim()
        : undefined;
    const handlerType =
      typeof params?.handlerType === "string"
        ? (params.handlerType.trim() as "http" | "shell" | "code")
        : undefined;
    const handlerConfigRaw =
      typeof params?.handlerConfig === "string"
        ? params.handlerConfig.trim()
        : undefined;
    const actionParametersRaw =
      typeof params?.actionParameters === "string"
        ? params.actionParameters.trim()
        : undefined;

    if (
      !actionName ||
      !actionDescription ||
      !handlerType ||
      !handlerConfigRaw
    ) {
      return {
        text: "actionName, actionDescription, handlerType, and handlerConfig are required.",
        success: false,
      };
    }

    if (!["http", "shell", "code"].includes(handlerType)) {
      return {
        text: "handlerType must be one of: http, shell, code",
        success: false,
      };
    }

    // Parse handler config
    let handlerConfig: Record<string, unknown>;
    try {
      handlerConfig = JSON.parse(handlerConfigRaw);
    } catch {
      return { text: "handlerConfig must be valid JSON.", success: false };
    }

    // Validate handler safety
    if (handlerType === "code") {
      const code =
        typeof handlerConfig.code === "string" ? handlerConfig.code : "";
      const validation = validateCodeHandler(code);
      if (!validation.valid) {
        return {
          text: `Code handler blocked: ${validation.reason}`,
          success: false,
        };
      }
    }

    if (handlerType === "shell") {
      const cmd =
        typeof handlerConfig.command === "string" ? handlerConfig.command : "";
      const validation = validateShellCommand(cmd);
      if (!validation.valid) {
        return {
          text: `Shell command blocked: ${validation.reason}`,
          success: false,
        };
      }
    }

    // Parse action parameters
    let actionParameters: Array<{
      name: string;
      description: string;
      required: boolean;
    }> = [];
    if (actionParametersRaw) {
      try {
        actionParameters = JSON.parse(actionParametersRaw);
      } catch {
        return {
          text: "actionParameters must be valid JSON array.",
          success: false,
        };
      }
    }

    // Build CustomActionDef
    const handler: CustomActionHandler = (() => {
      switch (handlerType) {
        case "http":
          return {
            type: "http" as const,
            method: String(handlerConfig.method ?? "GET"),
            url: String(handlerConfig.url ?? ""),
            headers: handlerConfig.headers as
              | Record<string, string>
              | undefined,
            bodyTemplate: handlerConfig.bodyTemplate as string | undefined,
          };
        case "shell":
          return {
            type: "shell" as const,
            command: String(handlerConfig.command ?? ""),
          };
        case "code":
          return {
            type: "code" as const,
            code: String(handlerConfig.code ?? ""),
          };
      }
    })();

    const now = new Date().toISOString();
    const def: CustomActionDef = {
      id: crypto.randomUUID(),
      name: actionName,
      description: actionDescription,
      parameters: actionParameters,
      handler,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    // Register live
    const action = registerCustomActionLive(def);
    if (!action) {
      return {
        text: "Failed to register action (runtime not ready).",
        success: false,
      };
    }

    // Persist to config
    try {
      const config = loadMiladyConfig();
      if (!config.customActions) config.customActions = [];
      config.customActions.push(def);
      saveMiladyConfig(config);
    } catch (err) {
      // Action is live but not persisted — warn
      return {
        text: `Action "${actionName}" registered live but failed to persist: ${err instanceof Error ? err.message : String(err)}`,
        success: true,
        data: {
          actionName: "CREATE_ACTION",
          registeredName: actionName,
          persisted: false,
        },
      };
    }

    // Record learning
    const store = getLearningStore();
    if (store) {
      store.record(
        "insight",
        `Created action: ${actionName}`,
        `Type: ${handlerType}, Params: ${actionParameters.map((p) => p.name).join(", ")}`,
        "action-creator",
      );
    }

    return {
      text: `Created and registered action "${actionName}" (${handlerType} handler).`,
      success: true,
      data: {
        actionName: "CREATE_ACTION",
        registeredName: actionName,
        handlerType,
        persisted: true,
      },
    };
  },

  parameters: [
    {
      name: "actionName",
      description: "Name for the action (SCREAMING_SNAKE_CASE)",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "actionDescription",
      description: "What this action does",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "handlerType",
      description: "Handler type: http, shell, or code",
      required: true,
      schema: { type: "string" as const, enum: ["http", "shell", "code"] },
    },
    {
      name: "handlerConfig",
      description:
        'Handler configuration as JSON (e.g. {"url":"...","method":"GET"} for http)',
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "actionParameters",
      description:
        'Action parameters as JSON array (e.g. [{"name":"query","description":"Search query","required":true}])',
      required: false,
      schema: { type: "string" as const },
    },
  ],
};
