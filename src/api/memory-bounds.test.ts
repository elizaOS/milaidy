import { describe, expect, it } from "vitest";
import {
  evictOldestConversation,
  getOrReadCachedFile,
  pushWithBatchEvict,
  sweepExpiredEntries,
} from "./memory-bounds";

// ── sweepExpiredEntries ───────────────────────────────────────────────

describe("sweepExpiredEntries", () => {
  it("does nothing when map size is at or below threshold", () => {
    const map = new Map<string, { count: number; resetAt: number }>();
    for (let i = 0; i < 100; i++) {
      map.set(`ip-${i}`, { count: 1, resetAt: 0 }); // all expired
    }
    sweepExpiredEntries(map, Date.now(), 100);
    expect(map.size).toBe(100); // untouched — at threshold, not above
  });

  it("evicts only expired entries when map exceeds threshold", () => {
    const now = Date.now();
    const map = new Map<string, { count: number; resetAt: number }>();
    // 60 expired entries
    for (let i = 0; i < 60; i++) {
      map.set(`expired-${i}`, { count: 1, resetAt: now - 1000 });
    }
    // 50 valid entries
    for (let i = 0; i < 50; i++) {
      map.set(`valid-${i}`, { count: 1, resetAt: now + 60_000 });
    }
    expect(map.size).toBe(110); // above threshold of 100

    sweepExpiredEntries(map, now, 100);

    expect(map.size).toBe(50);
    // All valid entries remain
    for (let i = 0; i < 50; i++) {
      expect(map.has(`valid-${i}`)).toBe(true);
    }
    // All expired entries removed
    for (let i = 0; i < 60; i++) {
      expect(map.has(`expired-${i}`)).toBe(false);
    }
  });

  it("leaves valid entries untouched even when all are above threshold", () => {
    const now = Date.now();
    const map = new Map<string, { count: number; resetAt: number }>();
    for (let i = 0; i < 150; i++) {
      map.set(`ip-${i}`, { count: 1, resetAt: now + 60_000 }); // all valid
    }

    sweepExpiredEntries(map, now, 100);

    expect(map.size).toBe(150); // none expired, none removed
  });
});

// ── evictOldestConversation ───────────────────────────────────────────

describe("evictOldestConversation", () => {
  it("returns null and does not evict when map is at or below cap", () => {
    const map = new Map([
      ["a", { updatedAt: "2026-01-01T00:00:00Z" }],
      ["b", { updatedAt: "2026-01-02T00:00:00Z" }],
    ]);

    const evicted = evictOldestConversation(map, 2);
    expect(evicted).toBeNull();
    expect(map.size).toBe(2);
  });

  it("evicts the oldest entry by updatedAt when map exceeds cap", () => {
    const map = new Map([
      ["newest", { updatedAt: "2026-02-19T12:00:00Z" }],
      ["oldest", { updatedAt: "2025-01-01T00:00:00Z" }],
      ["middle", { updatedAt: "2026-01-15T06:00:00Z" }],
    ]);

    const evicted = evictOldestConversation(map, 2);
    expect(evicted).toBe("oldest");
    expect(map.size).toBe(2);
    expect(map.has("oldest")).toBe(false);
    expect(map.has("newest")).toBe(true);
    expect(map.has("middle")).toBe(true);
  });

  it("evicts one entry per call, bringing size back to cap", () => {
    const map = new Map([
      ["a", { updatedAt: "2026-01-01T00:00:00Z" }],
      ["b", { updatedAt: "2026-01-02T00:00:00Z" }],
      ["c", { updatedAt: "2026-01-03T00:00:00Z" }],
      ["d", { updatedAt: "2026-01-04T00:00:00Z" }],
    ]);

    evictOldestConversation(map, 3);
    expect(map.size).toBe(3);
    expect(map.has("a")).toBe(false); // oldest removed
  });
});

// ── pushWithBatchEvict ────────────────────────────────────────────────

describe("pushWithBatchEvict", () => {
  it("pushes without eviction when below high-water mark", () => {
    const buffer: number[] = [1, 2, 3];
    const len = pushWithBatchEvict(buffer, 4, 10, 3);
    expect(len).toBe(4);
    expect(buffer).toEqual([1, 2, 3, 4]);
  });

  it("evicts oldest entries when high-water mark is exceeded", () => {
    const buffer: number[] = [];
    // Fill to 1200
    for (let i = 0; i < 1200; i++) buffer.push(i);

    // Push one more — triggers eviction at >1200
    const len = pushWithBatchEvict(buffer, 1200, 1200, 200);

    expect(len).toBe(1001); // 1201 - 200
    expect(buffer[0]).toBe(200); // first 200 entries were removed
    expect(buffer[buffer.length - 1]).toBe(1200); // newly pushed entry
  });

  it("does not evict at exactly the high-water mark", () => {
    const buffer: number[] = [];
    for (let i = 0; i < 1199; i++) buffer.push(i);

    // Push to exactly 1200 — should NOT trigger eviction (> not >=)
    pushWithBatchEvict(buffer, 1199, 1200, 200);

    expect(buffer.length).toBe(1200);
    expect(buffer[0]).toBe(0); // nothing removed
  });

  it("handles evictCount larger than buffer length gracefully", () => {
    const buffer: number[] = [1, 2, 3];
    pushWithBatchEvict(buffer, 4, 3, 100); // evictCount > buffer.length
    // splice(0, 100) on a 4-element array just empties it
    expect(buffer.length).toBe(0);
  });
});

// ── getOrReadCachedFile ───────────────────────────────────────────────

describe("getOrReadCachedFile", () => {
  const makeReader = (content: string) => {
    let callCount = 0;
    const reader = (_p: string) => {
      callCount++;
      return Buffer.from(content);
    };
    return { reader, getCallCount: () => callCount };
  };

  it("reads from disk on cache miss and caches the result", () => {
    const cache = new Map<string, { body: Buffer; mtimeMs: number }>();
    const { reader, getCallCount } = makeReader("hello");

    const body = getOrReadCachedFile(cache, "/a.js", 100, reader, 50, 1024);
    expect(body.toString()).toBe("hello");
    expect(getCallCount()).toBe(1);
    expect(cache.size).toBe(1);

    // Second call with same mtime — cache hit
    const body2 = getOrReadCachedFile(cache, "/a.js", 100, reader, 50, 1024);
    expect(body2.toString()).toBe("hello");
    expect(getCallCount()).toBe(1); // no additional disk read
  });

  it("invalidates cache when mtime changes", () => {
    const cache = new Map<string, { body: Buffer; mtimeMs: number }>();
    const { reader, getCallCount } = makeReader("v1");

    getOrReadCachedFile(cache, "/a.js", 100, reader, 50, 1024);
    expect(getCallCount()).toBe(1);

    // Changed mtime — should re-read
    getOrReadCachedFile(cache, "/a.js", 200, reader, 50, 1024);
    expect(getCallCount()).toBe(2);
  });

  it("does not cache files exceeding the size limit", () => {
    const cache = new Map<string, { body: Buffer; mtimeMs: number }>();
    const bigContent = "x".repeat(1025); // exceeds 1024 limit
    const { reader, getCallCount } = makeReader(bigContent);

    getOrReadCachedFile(cache, "/big.js", 100, reader, 50, 1024);
    expect(cache.size).toBe(0); // not cached
    expect(getCallCount()).toBe(1);

    // Next call reads from disk again
    getOrReadCachedFile(cache, "/big.js", 100, reader, 50, 1024);
    expect(getCallCount()).toBe(2);
  });

  it("evicts the oldest entry when cache is at capacity", () => {
    const cache = new Map<string, { body: Buffer; mtimeMs: number }>();
    const { reader } = makeReader("data");

    // Fill cache to capacity (3 entries)
    getOrReadCachedFile(cache, "/a.js", 1, reader, 3, 1024);
    getOrReadCachedFile(cache, "/b.js", 1, reader, 3, 1024);
    getOrReadCachedFile(cache, "/c.js", 1, reader, 3, 1024);
    expect(cache.size).toBe(3);

    // Add a 4th — should evict /a.js (first inserted)
    getOrReadCachedFile(cache, "/d.js", 1, reader, 3, 1024);
    expect(cache.size).toBe(3);
    expect(cache.has("/a.js")).toBe(false);
    expect(cache.has("/d.js")).toBe(true);
  });
});
