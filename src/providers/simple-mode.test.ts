import type { ChannelType, IAgentRuntime, Memory, State } from "@elizaos/core";
import { ChannelType as CT } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { createChannelProfileProvider } from "./simple-mode";

const runtime = {} as IAgentRuntime;
const state = {} as State;

function makeMessage(channelType?: ChannelType): Memory {
  return { content: { channelType } } as Memory;
}

describe("createChannelProfileProvider", () => {
  const provider = createChannelProfileProvider();

  it("has correct name and description", () => {
    expect(provider.name).toBe("miladyChannelProfile");
    expect(provider.description).toContain("channel-derived execution profile");
  });

  it("VOICE_DM returns voice_fast profile with compactContext=true", async () => {
    const result = await provider.get(runtime, makeMessage(CT.VOICE_DM), state);
    expect(result.values?.executionProfile).toBe("voice_fast");
    expect(result.values?.compactContext).toBe(true);
    expect(result.data?.profile).toBe("voice_fast");
  });

  it("VOICE_GROUP returns voice_fast profile", async () => {
    const result = await provider.get(
      runtime,
      makeMessage(CT.VOICE_GROUP),
      state,
    );
    expect(result.values?.executionProfile).toBe("voice_fast");
    expect(result.values?.compactContext).toBe(true);
  });

  it("GROUP returns group_compact profile with compactContext=true", async () => {
    const result = await provider.get(runtime, makeMessage(CT.GROUP), state);
    expect(result.values?.executionProfile).toBe("group_compact");
    expect(result.values?.compactContext).toBe(true);
    expect(result.data?.profile).toBe("group_compact");
  });

  it("DM returns default_full profile with compactContext=false", async () => {
    const result = await provider.get(runtime, makeMessage(CT.DM), state);
    expect(result.values?.executionProfile).toBe("default_full");
    expect(result.values?.compactContext).toBe(false);
  });

  it("missing channelType returns default_full profile", async () => {
    const result = await provider.get(runtime, makeMessage(undefined), state);
    expect(result.values?.executionProfile).toBe("default_full");
    expect(result.values?.compactContext).toBe(false);
    expect(result.data?.profile).toBe("default_full");
  });
});
