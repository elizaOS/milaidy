import type { Room } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  createSessionKeyProvider,
  resolveSessionKeyFromRoom,
} from "./session-bridge";

// Room.type uses string values that mirror ChannelType constants.
// The source falls back to { DM: "DM", SELF: "SELF", GROUP: "GROUP" } when
// @elizaos/core does not export ChannelType, so we use string literals here.

/** Build a partial Room with only the fields the resolver reads. */
function room(partial: Partial<Room>): Room {
  return { id: "room-0", ...partial } as Room;
}

describe("resolveSessionKeyFromRoom", () => {
  it("DM room type returns agent:{agentId}:main", () => {
    expect(
      resolveSessionKeyFromRoom(
        "agent-42",
        room({ id: "room-1", type: "DM", source: "telegram" }),
      ),
    ).toBe("agent:agent-42:main");
  });

  it("SELF room type returns agent:{agentId}:main", () => {
    expect(
      resolveSessionKeyFromRoom(
        "agent-42",
        room({ id: "room-2", type: "SELF", source: "discord" }),
      ),
    ).toBe("agent:agent-42:main");
  });

  it("GROUP room type returns agent:{agentId}:{channel}:group:{id}", () => {
    expect(
      resolveSessionKeyFromRoom(
        "agent-42",
        room({
          id: "room-3",
          type: "GROUP",
          source: "discord",
          channelId: "chan-99",
        }),
      ),
    ).toBe("agent:agent-42:discord:group:chan-99");
  });

  it("non-DM non-GROUP room returns agent:{agentId}:{channel}:channel:{id}", () => {
    expect(
      resolveSessionKeyFromRoom(
        "agent-42",
        room({
          id: "room-4",
          type: "CHANNEL",
          source: "slack",
          channelId: "chan-55",
        }),
      ),
    ).toBe("agent:agent-42:slack:channel:chan-55");
  });

  it("thread metadata appends :thread:{threadId}", () => {
    expect(
      resolveSessionKeyFromRoom(
        "agent-42",
        room({
          id: "room-5",
          type: "CHANNEL",
          source: "slack",
          channelId: "chan-55",
        }),
        { threadId: "thread-7" },
      ),
    ).toBe("agent:agent-42:slack:channel:chan-55:thread:thread-7");
  });

  it("missing source falls back to 'unknown' channel", () => {
    expect(
      resolveSessionKeyFromRoom(
        "agent-42",
        room({ id: "room-6", type: "CHANNEL", channelId: "chan-10" }),
      ),
    ).toBe("agent:agent-42:unknown:channel:chan-10");
  });

  it("meta.groupId overrides room.channelId for the id segment", () => {
    expect(
      resolveSessionKeyFromRoom(
        "agent-42",
        room({
          id: "room-7",
          type: "GROUP",
          source: "discord",
          channelId: "chan-original",
        }),
        { groupId: "group-override" },
      ),
    ).toBe("agent:agent-42:discord:group:group-override");
  });

  it("meta.channel overrides room.source for the channel name segment", () => {
    expect(
      resolveSessionKeyFromRoom(
        "agent-42",
        room({
          id: "room-8",
          type: "CHANNEL",
          source: "slack",
          channelId: "chan-20",
        }),
        { channel: "telegram" },
      ),
    ).toBe("agent:agent-42:telegram:channel:chan-20");
  });
});

describe("createSessionKeyProvider", () => {
  it("returns a valid Provider shape with name, description, and get function", () => {
    const provider = createSessionKeyProvider();
    expect(provider).toHaveProperty("name");
    expect(provider).toHaveProperty("description");
    expect(typeof provider.get).toBe("function");
  });

  it("provider name is 'miladySessionKey'", () => {
    const provider = createSessionKeyProvider();
    expect(provider.name).toBe("miladySessionKey");
  });
});
