import {
  ChannelType,
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
} from "@elizaos/core";

export type ChannelExecutionProfile =
  | "voice_fast"
  | "group_compact"
  | "default_full";

function resolveChannelProfile(message: Memory): ChannelExecutionProfile {
  const channelType = message.content?.channelType;
  if (
    channelType === ChannelType.VOICE_DM ||
    channelType === ChannelType.VOICE_GROUP
  ) {
    return "voice_fast";
  }
  if (channelType === ChannelType.GROUP) {
    return "group_compact";
  }
  return "default_full";
}

export function createChannelProfileProvider(): Provider {
  return {
    name: "miladyChannelProfile",
    description:
      "Injects channel-derived execution profile guidance (voice/group/default).",
    alwaysRun: true,
    position: -50,
    async get(
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State,
    ): Promise<ProviderResult> {
      const profile = resolveChannelProfile(message);

      if (profile === "voice_fast") {
        return {
          text: [
            "Execution profile: VOICE_FAST.",
            "Prioritize low latency and conversational flow.",
            "Keep tool/provider usage minimal and avoid unnecessary context expansion.",
          ].join(" "),
          values: {
            executionProfile: "voice_fast",
            compactContext: true,
          },
          data: {
            profile: "voice_fast",
          },
        };
      }

      if (profile === "group_compact") {
        return {
          text: [
            "Execution profile: GROUP_COMPACT.",
            "Keep responses concise and context usage focused on the active group thread.",
          ].join(" "),
          values: {
            executionProfile: "group_compact",
            compactContext: true,
          },
          data: {
            profile: "group_compact",
          },
        };
      }

      return {
        values: {
          executionProfile: "default_full",
          compactContext: false,
        },
        data: {
          profile: "default_full",
        },
      };
    },
  };
}
