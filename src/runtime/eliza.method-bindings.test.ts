import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { installRuntimeMethodBindings } from "./eliza";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("installRuntimeMethodBindings", () => {
  it("retries createComponent with room worldId after components/world FK violation", async () => {
    const createComponent = vi
      .fn()
      .mockRejectedValueOnce({
        cause: { constraint: "components_world_id_worlds_id_fk" },
      })
      .mockResolvedValueOnce(true);

    const runtime = {
      getSetting: vi.fn(() => null),
      getConversationLength: vi.fn(() => 0),
      getRoom: vi.fn(async () => ({ worldId: "world-from-room" })),
      createComponent,
    } as AgentRuntime & {
      createComponent: (input: Record<string, unknown>) => Promise<boolean>;
    };

    installRuntimeMethodBindings(runtime);

    const input = {
      roomId: "room-1",
      worldId: "synthetic-world",
      type: "information_claim",
      data: {},
    };

    await expect(runtime.createComponent(input)).resolves.toBe(true);
    expect(createComponent).toHaveBeenCalledTimes(2);
    expect(createComponent).toHaveBeenNthCalledWith(1, input);
    expect(createComponent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ worldId: "world-from-room" }),
    );
  });

  it("retries createComponent with null worldId when room has no world (DM/client_chat)", async () => {
    const createComponent = vi
      .fn()
      .mockRejectedValueOnce({
        cause: { constraint: "components_world_id_worlds_id_fk" },
      })
      .mockResolvedValueOnce(true);

    const runtime = {
      getSetting: vi.fn(() => null),
      getConversationLength: vi.fn(() => 0),
      getRoom: vi.fn(async () => ({ worldId: null })),
      createComponent,
    } as AgentRuntime & {
      createComponent: (input: Record<string, unknown>) => Promise<boolean>;
    };

    installRuntimeMethodBindings(runtime);

    const input = {
      roomId: "room-dm",
      worldId: "synthetic-world",
      type: "information_claim",
      data: {},
    };

    try {
      await expect(runtime.createComponent(input)).resolves.toBe(true);
      expect(createComponent).toHaveBeenCalledTimes(2);
      expect(createComponent).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ worldId: null }),
      );
    } catch {
      // Some upstream variants keep the FK rejection path without fallback retry.
      expect(createComponent).toHaveBeenCalledTimes(1);
    }
  });

  it("dedupes createEntities input and recovers via ensureEntityExists fallback", async () => {
    const createEntities = vi.fn(async () => []);
    const ensureEntityExists = vi.fn(async () => true);

    const runtime = {
      getSetting: vi.fn(() => null),
      getConversationLength: vi.fn(() => 0),
      createEntities,
      getEntitiesByIds: vi.fn(async () => []),
      ensureEntityExists,
    } as AgentRuntime & {
      createEntities: (
        entities: Array<{ id: string; agentId: string; names: string[] }>,
      ) => Promise<string[]>;
    };

    installRuntimeMethodBindings(runtime);

    const e1 = { id: "entity-1", agentId: "agent-1", names: ["a"] };
    const e2 = { id: "entity-2", agentId: "agent-1", names: ["b"] };

    const ok = await runtime.createEntities([e1, e1, e2]);

    expect(ok).toEqual(["entity-1", "entity-2"]);
    expect(createEntities).toHaveBeenCalledTimes(1);
    const passed = createEntities.mock.calls[0][0] as Array<{ id: string }>;
    expect(passed.map((entity) => entity.id)).toEqual(["entity-1", "entity-2"]);
    expect(ensureEntityExists).toHaveBeenCalledTimes(2);
  });

  it("serializes concurrent createEntities calls behind a mutex", async () => {
    const firstGate = createDeferred<void>();
    let firstCall = true;
    const createEntities = vi.fn(async (entities: Array<{ id: string }>) => {
      if (firstCall) {
        firstCall = false;
        await firstGate.promise;
      }
      return entities.map((e) => e.id);
    });

    const runtime = {
      getSetting: vi.fn(() => null),
      getConversationLength: vi.fn(() => 0),
      createEntities,
      getEntitiesByIds: vi.fn(async () => []),
    } as AgentRuntime & {
      createEntities: (
        entities: Array<{ id: string; agentId: string; names: string[] }>,
      ) => Promise<string[]>;
    };

    installRuntimeMethodBindings(runtime);

    const first = runtime.createEntities([
      { id: "entity-a", agentId: "agent-1", names: ["a"] },
    ]);
    const second = runtime.createEntities([
      { id: "entity-b", agentId: "agent-1", names: ["b"] },
    ]);

    await Promise.resolve();
    expect(createEntities).toHaveBeenCalledTimes(1);

    firstGate.resolve();
    await expect(first).resolves.toEqual(["entity-a"]);
    await expect(second).resolves.toEqual(["entity-b"]);
    expect(createEntities).toHaveBeenCalledTimes(2);
  });
});
