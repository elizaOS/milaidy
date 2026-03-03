import type { AgentRuntime, UUID } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { persistConversationRoomTitle } from "./server";

const conversation = {
  id: "conv-1",
  title: "Renamed Conversation",
  roomId: "00000000-0000-0000-0000-000000000001" as UUID,
};

describe("persistConversationRoomTitle", () => {
  it("returns false when runtime is missing", async () => {
    const updated = await persistConversationRoomTitle(null, conversation);
    expect(updated).toBe(false);
  });

  it("returns false when room cannot be found", async () => {
    const runtime = {
      getRoom: vi.fn().mockResolvedValue(null),
      adapter: {},
    } as unknown as Pick<AgentRuntime, "getRoom" | "adapter">;

    const updated = await persistConversationRoomTitle(runtime, conversation);

    expect(updated).toBe(false);
    expect(runtime.getRoom).toHaveBeenCalledWith(conversation.roomId);
  });

  it("returns false when room already has the same title", async () => {
    const runtime = {
      getRoom: vi.fn().mockResolvedValue({
        id: conversation.roomId,
        name: conversation.title,
      }),
      adapter: { updateRoom: vi.fn() },
    } as unknown as Pick<AgentRuntime, "getRoom" | "adapter">;

    const updated = await persistConversationRoomTitle(runtime, conversation);

    expect(updated).toBe(false);
    expect(runtime.adapter.updateRoom).not.toHaveBeenCalled();
  });

  it("returns false when adapter cannot update rooms", async () => {
    const runtime = {
      getRoom: vi.fn().mockResolvedValue({
        id: conversation.roomId,
        name: "Old title",
      }),
      adapter: {},
    } as unknown as Pick<AgentRuntime, "getRoom" | "adapter">;

    const updated = await persistConversationRoomTitle(runtime, conversation);

    expect(updated).toBe(false);
  });

  it("updates the room name when title changed", async () => {
    const updateRoom = vi.fn().mockResolvedValue(undefined);
    const runtime = {
      getRoom: vi.fn().mockResolvedValue({
        id: conversation.roomId,
        name: "Old title",
      }),
      adapter: { updateRoom },
    } as unknown as Pick<AgentRuntime, "getRoom" | "adapter">;

    const updated = await persistConversationRoomTitle(runtime, conversation);

    expect(updated).toBe(true);
    expect(updateRoom).toHaveBeenCalledWith({
      id: conversation.roomId,
      name: conversation.title,
    });
  });
});
