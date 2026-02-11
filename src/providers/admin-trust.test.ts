import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { createAdminTrustProvider } from "./admin-trust.js";

type FakeWorld = {
  metadata?: {
    ownership?: { ownerId?: string };
    roles?: Record<string, string>;
  };
};

function createRuntime(
  room: { worldId?: string } | null,
  world: FakeWorld | null,
): IAgentRuntime {
  const runtimeSubset: Pick<IAgentRuntime, "getRoom" | "getWorld"> = {
    getRoom: async () => {
      if (!room) return null;
      return {
        id: "room-1",
        worldId: room.worldId ?? "",
      } as never;
    },
    getWorld: async () => {
      if (!world) return null;
      return {
        metadata: world.metadata ?? {},
      } as never;
    },
  };
  return runtimeSubset as IAgentRuntime;
}

describe("admin-trust provider", () => {
  const provider = createAdminTrustProvider();
  const state = {} as State;

  it("marks OWNER speaker as trusted admin", async () => {
    const runtime = createRuntime(
      { worldId: "world-1" },
      {
        metadata: {
          ownership: { ownerId: "admin-1" },
          roles: { "admin-1": "OWNER" },
        },
      },
    );
    const message = {
      roomId: "room-1",
      entityId: "admin-1",
    } as Memory;

    const result = await provider.get(runtime, message, state);
    const values = result.values as Record<string, string | boolean>;
    expect(values.trustedAdmin).toBe(true);
    expect(values.adminRole).toBe("OWNER");
  });

  it("does not trust non-owner speaker", async () => {
    const runtime = createRuntime(
      { worldId: "world-1" },
      {
        metadata: {
          ownership: { ownerId: "admin-1" },
          roles: { "admin-1": "OWNER" },
        },
      },
    );
    const message = {
      roomId: "room-1",
      entityId: "user-2",
    } as Memory;

    const result = await provider.get(runtime, message, state);
    const values = result.values as Record<string, string | boolean>;
    expect(values.trustedAdmin).toBe(false);
  });

  it("returns false when room is missing", async () => {
    const runtime = createRuntime(null, null);
    const message = {
      roomId: "room-1",
      entityId: "admin-1",
    } as Memory;

    const result = await provider.get(runtime, message, state);
    const values = result.values as Record<string, string | boolean>;
    expect(values.trustedAdmin).toBe(false);
  });
});
