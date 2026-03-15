/**
 * Echo Mode Tests
 *
 * Tests the echo-mode fallback behavior when @elizaos/core is not available.
 * In echo mode, message.send returns "[echo] {input}" and memories are
 * recorded in the snapshot manager.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  startTestServers,
  stopTestServers,
  jsonRpc,
  jsonRpcStream,
  type TestServerHandles,
} from "./helpers.js";

let handles: TestServerHandles | null = null;
let bridgePort: number;

beforeAll(async () => {
  handles = await startTestServers();
  bridgePort = handles.bridgePort;

  // Clear any existing state for clean tests
  await fetch(`http://localhost:${bridgePort}/api/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memories: [], config: {} }),
  });
});

afterAll(() => {
  stopTestServers(handles);
});

// ─── Echo Response Format ───────────────────────────────────────────────

describe("Echo Mode Responses", () => {
  test("echo mode responds with [echo] prefix", async () => {
    const result = await jsonRpc(bridgePort, "message.send", { text: "hello world" });
    expect(result.result.text).toBe("[echo] hello world");
  });

  test("echo mode handles empty text", async () => {
    const result = await jsonRpc(bridgePort, "message.send", { text: "" });
    expect(result.result.text).toBe("[echo] ");
  });

  test("echo mode preserves special characters", async () => {
    const specialText = "Hello! @user #channel $100 <script>alert('xss')</script>";
    const result = await jsonRpc(bridgePort, "message.send", { text: specialText });
    expect(result.result.text).toBe(`[echo] ${specialText}`);
  });

  test("echo mode handles unicode", async () => {
    const unicodeText = "こんにちは 🌍 café résumé";
    const result = await jsonRpc(bridgePort, "message.send", { text: unicodeText });
    expect(result.result.text).toBe(`[echo] ${unicodeText}`);
  });

  test("echo mode handles long text", async () => {
    const longText = "x".repeat(10000);
    const result = await jsonRpc(bridgePort, "message.send", { text: longText });
    expect(result.result.text).toBe(`[echo] ${longText}`);
    expect(result.result.text.length).toBe(10007); // "[echo] " = 7 chars
  });

  test("echo mode includes metadata timestamp", async () => {
    const before = Date.now();
    const result = await jsonRpc(bridgePort, "message.send", { text: "timing" });
    const after = Date.now();

    expect(result.result.metadata.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.result.metadata.timestamp).toBeLessThanOrEqual(after);
  });
});

// ─── Echo Mode Memory Recording ────────────────────────────────────────

describe("Echo Mode Memories", () => {
  test("echo mode stores user+assistant memory pair", async () => {
    // Clear state
    await fetch(`http://localhost:${bridgePort}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memories: [], config: {} }),
    });

    await jsonRpc(bridgePort, "message.send", { text: "test memory" });

    const captureRes = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    const snapshot = (await captureRes.json()) as Record<string, any>;

    expect(snapshot.memories).toHaveLength(2);

    // First entry should be user
    expect(snapshot.memories[0].role).toBe("user");
    expect(snapshot.memories[0].text).toBe("test memory");
    expect(snapshot.memories[0].timestamp).toBeGreaterThan(0);

    // Second entry should be assistant
    expect(snapshot.memories[1].role).toBe("assistant");
    expect(snapshot.memories[1].text).toBe("[echo] test memory");
    expect(snapshot.memories[1].timestamp).toBeGreaterThan(0);
  });

  test("multiple messages accumulate memories", async () => {
    // Clear state
    await fetch(`http://localhost:${bridgePort}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memories: [], config: {} }),
    });

    await jsonRpc(bridgePort, "message.send", { text: "first" });
    await jsonRpc(bridgePort, "message.send", { text: "second" });
    await jsonRpc(bridgePort, "message.send", { text: "third" });

    const captureRes = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    const snapshot = (await captureRes.json()) as Record<string, any>;

    // 3 messages × 2 entries each (user + assistant) = 6 memories
    expect(snapshot.memories).toHaveLength(6);

    // Verify order
    expect(snapshot.memories[0].text).toBe("first");
    expect(snapshot.memories[1].text).toBe("[echo] first");
    expect(snapshot.memories[2].text).toBe("second");
    expect(snapshot.memories[3].text).toBe("[echo] second");
    expect(snapshot.memories[4].text).toBe("third");
    expect(snapshot.memories[5].text).toBe("[echo] third");
  });

  test("streaming also stores memories", async () => {
    // Clear state
    await fetch(`http://localhost:${bridgePort}/api/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memories: [], config: {} }),
    });

    await jsonRpcStream(bridgePort, "message.send", { text: "stream memory" });

    const captureRes = await fetch(`http://localhost:${bridgePort}/api/snapshot`, {
      method: "POST",
    });
    const snapshot = (await captureRes.json()) as Record<string, any>;

    expect(snapshot.memories.length).toBeGreaterThanOrEqual(2);
    expect(snapshot.memories[0].role).toBe("user");
    expect(snapshot.memories[0].text).toBe("stream memory");
    expect(snapshot.memories[1].role).toBe("assistant");
    expect(snapshot.memories[1].text).toBe("[echo] stream memory");
  });
});

// ─── Echo Mode Streaming ────────────────────────────────────────────────

describe("Echo Mode Streaming", () => {
  test("streaming echo returns chunk with [echo] prefix", async () => {
    const events = await jsonRpcStream(bridgePort, "message.send", {
      text: "stream echo test",
    });

    const chunks = events.filter((e) => e.event === "chunk");
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    const fullText = chunks.map((c) => c.data.text).join("");
    expect(fullText).toBe("[echo] stream echo test");
  });

  test("streaming echo sends connected → chunk → done", async () => {
    const events = await jsonRpcStream(bridgePort, "message.send", {
      text: "flow test",
    });

    const eventNames = events.map((e) => e.event);

    // Verify event ordering
    const connectedIdx = eventNames.indexOf("connected");
    const lastChunkIdx = eventNames.lastIndexOf("chunk");
    const doneIdx = eventNames.indexOf("done");

    expect(connectedIdx).toBeGreaterThanOrEqual(0);
    expect(lastChunkIdx).toBeGreaterThan(connectedIdx);
    expect(doneIdx).toBeGreaterThan(lastChunkIdx);
  });
});

// ─── Echo Mode with Chat Modes ──────────────────────────────────────────

describe("Echo Mode Chat Modes", () => {
  test("simple mode produces echo response", async () => {
    const result = await jsonRpc(bridgePort, "message.send", {
      text: "simple mode",
      mode: "simple",
    });
    expect(result.result.text).toBe("[echo] simple mode");
  });

  test("power mode produces echo response", async () => {
    const result = await jsonRpc(bridgePort, "message.send", {
      text: "power mode",
      mode: "power",
    });
    expect(result.result.text).toBe("[echo] power mode");
  });

  test("different roomIds produce echo responses", async () => {
    const result1 = await jsonRpc(bridgePort, "message.send", {
      text: "room1",
      roomId: "room-a",
    });
    const result2 = await jsonRpc(bridgePort, "message.send", {
      text: "room2",
      roomId: "room-b",
    });

    expect(result1.result.text).toBe("[echo] room1");
    expect(result2.result.text).toBe("[echo] room2");
  });
});
