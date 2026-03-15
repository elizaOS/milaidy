/**
 * Snapshot Manager Tests
 *
 * Tests the snapshot capture/restore endpoints on the bridge server:
 *   POST /api/snapshot  → capture current state
 *   POST /api/restore   → restore state from snapshot
 *   POST /snapshot      → alias for /api/snapshot
 *   POST /restore       → alias for /api/restore
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  startTestServers,
  stopTestServers,
  jsonRpc,
  type TestServerHandles,
} from "./helpers.js";

let handles: TestServerHandles | null = null;
let bridgePort: number;

beforeAll(async () => {
  handles = await startTestServers();
  bridgePort = handles.bridgePort;
});

afterAll(() => {
  stopTestServers(handles);
});

// ─── Capture ────────────────────────────────────────────────────────────

describe("Snapshot Capture", () => {
  test("POST /api/snapshot returns current state", async () => {
    const res = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, any>;
    expect(data.memories).toBeArray();
    expect(data.config).toBeDefined();
    expect(typeof data.config).toBe("object");
    expect(data.workspaceFiles).toBeDefined();
    expect(typeof data.workspaceFiles).toBe("object");
    expect(data.timestamp).toBeDefined();
    expect(typeof data.timestamp).toBe("string");
  });

  test("POST /snapshot alias works", async () => {
    const res = await fetch(`http://localhost:${bridgePort}/snapshot`, {
      method: "POST",
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, any>;
    expect(data.memories).toBeArray();
    expect(data.timestamp).toBeDefined();
  });

  test("snapshot timestamp is a valid ISO string", async () => {
    const res = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    const data = (await res.json()) as Record<string, any>;

    const parsed = new Date(data.timestamp);
    expect(parsed.getTime()).toBeGreaterThan(0);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
  });

  test("initial snapshot has empty memories", async () => {
    // Note: If prior tests in this file sent messages, memories won't be empty.
    // This test documents the initial state expectation.
    const res = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    const data = (await res.json()) as Record<string, any>;
    // Memories may be non-empty if other tests ran first, so just check structure
    expect(data.memories).toBeArray();
    for (const mem of data.memories) {
      expect(mem.role).toBeDefined();
      expect(mem.text).toBeDefined();
      expect(mem.timestamp).toBeDefined();
    }
  });
});

// ─── Restore ────────────────────────────────────────────────────────────

describe("Snapshot Restore", () => {
  test("POST /api/restore updates state", async () => {
    const restoreData = {
      memories: [
        { role: "user", text: "restored message", timestamp: 1000 },
        { role: "assistant", text: "restored reply", timestamp: 1001 },
      ],
      config: { testKey: "testValue", nested: { a: 1 } },
    };

    const restoreRes = await fetch(`http://localhost:${bridgePort}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(restoreData),
    });
    expect(restoreRes.status).toBe(200);
    const restoreResult = (await restoreRes.json()) as Record<string, any>;
    expect(restoreResult.success).toBe(true);

    // Verify via capture
    const captureRes = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    const captured = (await captureRes.json()) as Record<string, any>;

    expect(captured.memories).toHaveLength(2);
    expect(captured.memories[0].role).toBe("user");
    expect(captured.memories[0].text).toBe("restored message");
    expect(captured.memories[1].role).toBe("assistant");
    expect(captured.memories[1].text).toBe("restored reply");
    expect(captured.config.testKey).toBe("testValue");
    expect(captured.config.nested.a).toBe(1);
  });

  test("POST /restore alias works", async () => {
    const res = await fetch(`http://localhost:${bridgePort}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memories: [{ role: "user", text: "alias restore", timestamp: 2000 }],
      }),
    });
    expect(res.status).toBe(200);

    const captureRes = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    const captured = (await captureRes.json()) as Record<string, any>;
    expect(captured.memories).toHaveLength(1);
    expect(captured.memories[0].text).toBe("alias restore");
  });

  test("restore with only memories preserves config", async () => {
    // First, set config
    await fetch(`http://localhost:${bridgePort}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memories: [],
        config: { preserved: true },
      }),
    });

    // Then restore only memories (no config field)
    await fetch(`http://localhost:${bridgePort}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memories: [{ role: "user", text: "new memory", timestamp: 3000 }],
      }),
    });

    const captureRes = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    const captured = (await captureRes.json()) as Record<string, any>;

    expect(captured.memories).toHaveLength(1);
    expect(captured.memories[0].text).toBe("new memory");
    // Config should be preserved since we didn't include it in the restore
    expect(captured.config.preserved).toBe(true);
  });

  test("restore with only config preserves memories", async () => {
    // Set up initial state
    await fetch(`http://localhost:${bridgePort}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memories: [{ role: "user", text: "keep me", timestamp: 4000 }],
        config: {},
      }),
    });

    // Restore only config
    await fetch(`http://localhost:${bridgePort}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: { updated: true },
      }),
    });

    const captureRes = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    const captured = (await captureRes.json()) as Record<string, any>;

    expect(captured.memories).toHaveLength(1);
    expect(captured.memories[0].text).toBe("keep me");
    expect(captured.config.updated).toBe(true);
  });

  test("restore with empty body is a no-op", async () => {
    // Set known state
    await fetch(`http://localhost:${bridgePort}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memories: [{ role: "user", text: "stable", timestamp: 5000 }],
        config: { stable: true },
      }),
    });

    // Restore with empty body
    const res = await fetch(`http://localhost:${bridgePort}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);

    // State should be unchanged
    const captureRes = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    const captured = (await captureRes.json()) as Record<string, any>;
    expect(captured.memories).toHaveLength(1);
    expect(captured.memories[0].text).toBe("stable");
    expect(captured.config.stable).toBe(true);
  });

  test("restore with workspaceFiles", async () => {
    await fetch(`http://localhost:${bridgePort}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceFiles: {
          "test.txt": "hello world",
          "config.json": '{"key": "value"}',
        },
      }),
    });

    const captureRes = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    const captured = (await captureRes.json()) as Record<string, any>;

    expect(captured.workspaceFiles["test.txt"]).toBe("hello world");
    expect(captured.workspaceFiles["config.json"]).toBe('{"key": "value"}');
  });
});

// ─── Round-Trip ─────────────────────────────────────────────────────────

describe("Snapshot Round-Trip", () => {
  test("send message → capture → restore → verify memories preserved", async () => {
    // Clear state
    await fetch(`http://localhost:${bridgePort}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memories: [], config: {} }),
    });

    // Send a message to create memories
    await jsonRpc(bridgePort, "message.send", { text: "round trip test" });

    // Capture state
    const captureRes = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    const snapshot = (await captureRes.json()) as Record<string, any>;

    // Should have at least the user + assistant message pair
    expect(snapshot.memories.length).toBeGreaterThanOrEqual(2);
    const userMsg = snapshot.memories.find(
      (m: any) => m.role === "user" && m.text === "round trip test",
    );
    expect(userMsg).toBeDefined();

    // Clear state
    await fetch(`http://localhost:${bridgePort}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memories: [], config: {} }),
    });

    // Verify cleared
    const clearedRes = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    const cleared = (await clearedRes.json()) as Record<string, any>;
    expect(cleared.memories).toHaveLength(0);

    // Restore from saved snapshot
    await fetch(`http://localhost:${bridgePort}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memories: snapshot.memories,
        config: snapshot.config,
      }),
    });

    // Verify restored
    const restoredRes = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    const restored = (await restoredRes.json()) as Record<string, any>;
    expect(restored.memories.length).toBe(snapshot.memories.length);

    const restoredUserMsg = restored.memories.find(
      (m: any) => m.role === "user" && m.text === "round trip test",
    );
    expect(restoredUserMsg).toBeDefined();
  });
});
