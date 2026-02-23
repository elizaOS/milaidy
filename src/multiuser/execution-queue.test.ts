import { describe, expect, it } from "vitest";
import { InMemoryExecutionQueue } from "./execution-queue.js";

describe("InMemoryExecutionQueue", () => {
  it("enqueues and dequeues in FIFO order", () => {
    const queue = new InMemoryExecutionQueue<{ n: number }>();
    queue.enqueue({ id: "a", userId: "u1", payload: { n: 1 }, createdAt: 1 });
    queue.enqueue({ id: "b", userId: "u1", payload: { n: 2 }, createdAt: 2 });

    const first = queue.dequeue();
    const second = queue.dequeue();

    expect(first?.id).toBe("a");
    expect(second?.id).toBe("b");
  });

  it("prevents duplicate dedupe keys", () => {
    const queue = new InMemoryExecutionQueue();
    const ok = queue.enqueue({
      id: "a",
      userId: "u1",
      dedupeKey: "bet:1",
      payload: {},
      createdAt: 1,
    });
    const dupe = queue.enqueue({
      id: "b",
      userId: "u1",
      dedupeKey: "bet:1",
      payload: {},
      createdAt: 2,
    });

    expect(ok).toBe(true);
    expect(dupe).toBe(false);
  });

  it("enforces max queue size", () => {
    const queue = new InMemoryExecutionQueue({ maxQueued: 1 });
    const first = queue.enqueue({
      id: "a",
      userId: "u1",
      payload: {},
      createdAt: 1,
    });
    const second = queue.enqueue({
      id: "b",
      userId: "u1",
      payload: {},
      createdAt: 2,
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
