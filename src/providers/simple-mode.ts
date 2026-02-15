import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";

export type InteractionMode = "simple" | "power";

function resolveInteractionMode(message: Memory): InteractionMode {
  const simpleFlag = message.content?.simple;
  if (typeof simpleFlag === "boolean") {
    return simpleFlag ? "simple" : "power";
  }

  const modeValue = message.content?.mode;
  if (modeValue === "simple") return "simple";
  if (modeValue === "power") return "power";

  return "power";
}

export function createSimpleModeProvider(): Provider {
  return {
    name: "milaidySimpleMode",
    description:
      "Guides response behavior in simple mode; tools require power mode.",
    // Keep this always available so mode guidance is present even when
    // composeState is called with strict provider lists.
    alwaysRun: true,
    position: -50,
    async get(
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State,
    ): Promise<ProviderResult> {
      const mode = resolveInteractionMode(message);
      if (mode === "simple") {
        const text =
          "Interaction mode: SIMPLE. You can reply normally, but do not use tools/actions in SIMPLE mode. If a tool/action is needed, ask the user to switch to POWER mode.";
        return {
          text,
          values: {
            interactionMode: "simple",
            toolsAllowed: false,
          },
          data: {
            mode: "simple",
          },
        };
      }

      return {
        values: {
          interactionMode: "power",
          toolsAllowed: true,
        },
        data: {
          mode: "power",
        },
      };
    },
  };
}
