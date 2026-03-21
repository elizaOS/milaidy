/**
 * Unit tests for api/memory-bounds.ts — bounded data structures for rate
 * limiting, conversation capping, log buffer eviction, and file caching.
 *
 * These utilities are used by server.ts and bug-report-routes.ts to prevent
 * unbounded memory growth from long-running agents.
 */

import { describe, expect, it } from "vitest";
import {
  evictOldestConversation,
  getOrReadCachedFile,
  pushWithBatchEvict,
  sweepExpiredEntries,
} from "./memory-bounds";

// ═════════════════════════════════════════════════════════════════════════
describe("memory-bounds", () => {
  // ── sweepExpiredEntries ───────────────────────────────────────────
  describe("sweepExpiredEntries", () => {
    it("skips sweep when under threshold", () => {
      const map = new Map([["a", { count: 1, resetAt: 100 }]]);
      sweepExpiredEntries(map, 200, 5);
      expect(map.size).toBe(1); // Not evicted — under threshold
    });

    it("evicts expired entries when over threshold", () => {
      const map = new Map([
        ["expired1", { count: 1, resetAt: 100 }],
        ["expired2", { count: 1, resetAt: 150 }],
        ["fresh", { count: 1, resetAt: 500 }],
      ]);
      sweepExpiredEntries(map, 200, 2); // threshold=2, map.size=3 > threshold
      expect(map.has("expired1")).toBe(false);
      expect(map.has("expired2")).toBe(false);
      expect(map.has("fresh")).toBe(true);
      expect(map.size).toBe(1);
    });

    it("does nothing when exactly at threshold", () => {
      const map = new Map([
        ["a", { count: 1, resetAt: 100 }],
        ["b", { count: 1, resetAt: 100 }],
      ]);
      sweepExpiredEntries(map, 200, 2); // size === threshold
      expect(map.size).toBe(2); // No eviction
    });

    it("handles empty map gracefully", () => {
      const map = new Map<string, { count: number; resetAt: number }>();
      sweepExpiredEntries(map, 200, 0);
      expect(map.size).toBe(0);
    });
  });

  // ── evictOldestConversation ───────────────────────────────────────
  describe("evictOldestConversation", () => {
    it("returns null when under cap", () => {
      const map = new Map([["a", { updatedAt: "2024-01-01T00:00:00Z" }]]);
      expect(evictOldestConversation(map, 5)).toBeNull();
      expect(map.size).toBe(1);
    });

    it("evicts oldest entry when over cap", () => {
      const map = new Map([
        ["old", { updatedAt: "2024-01-01T00:00:00Z" }],
        ["mid", { updatedAt: "2024-06-01T00:00:00Z" }],
        ["new", { updatedAt: "2024-12-01T00:00:00Z" }],
      ]);
      const evicted = evictOldestConversation(map, 2);
      expect(evicted).toBe("old");
      expect(map.has("old")).toBe(false);
      expect(map.size).toBe(2);
    });

    it("evicts from map with single entry over cap=0", () => {
      const map = new Map([["only", { updatedAt: "2024-01-01T00:00:00Z" }]]);
      const evicted = evictOldestConversation(map, 0);
      expect(evicted).toBe("only");
      expect(map.size).toBe(0);
    });

    it("returns null when empty", () => {
      const map = new Map<string, { updatedAt: string }>();
      expect(evictOldestConversation(map, 0)).toBeNull();
    });
  });

  // ── pushWithBatchEvict ───────────────────────────────────────────
  describe("pushWithBatchEvict", () => {
    it("pushes to buffer and returns length", () => {
      const buf: number[] = [1, 2, 3];
      const len = pushWithBatchEvict(buf, 4, 10, 5);
      expect(len).toBe(4);
      expect(buf).toEqual([1, 2, 3, 4]);
    });

    it("does not evict when at high water mark", () => {
      const buf = [1, 2, 3, 4, 5];
      pushWithBatchEvict(buf, 6, 6, 3); // 6 === highWater, no eviction
      expect(buf).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("evicts oldest entries when exceeding high water", () => {
      const buf = [1, 2, 3, 4, 5];
      pushWithBatchEvict(buf, 6, 5, 3); // len 6 > 5, evict 3 oldest
      expect(buf).toEqual([4, 5, 6]);
    });

    it("evicts all when evictCount >= buffer length", () => {
      const buf = [1, 2];
      pushWithBatchEvict(buf, 3, 2, 100);
      expect(buf).toEqual([]);
    });

    it("works with string buffers", () => {
      const buf: string[] = ["a", "b"];
      pushWithBatchEvict(buf, "c", 2, 1);
      expect(buf).toEqual(["b", "c"]);
    });
  });

  // ── getOrReadCachedFile ──────────────────────────────────────────
  describe("getOrReadCachedFile", () => {
    it("reads file on cache miss", () => {
      const cache = new Map<string, { body: Buffer; mtimeMs: number }>();
      const body = getOrReadCachedFile(
        cache,
        "/test.txt",
        1000,
        () => Buffer.from("hello"),
        10,
        1024,
      );
      expect(body.toString()).toBe("hello");
      expect(cache.has("/test.txt")).toBe(true);
    });

    it("returns cached value on cache hit", () => {
      const cache = new Map<string, { body: Buffer; mtimeMs: number }>();
      cache.set("/test.txt", {
        body: Buffer.from("cached"),
        mtimeMs: 1000,
      });
      let readCalled = false;
      const body = getOrReadCachedFile(
        cache,
        "/test.txt",
        1000,
        () => {
          readCalled = true;
          return Buffer.from("fresh");
        },
        10,
        1024,
      );
      expect(body.toString()).toBe("cached");
      expect(readCalled).toBe(false);
    });

    it("re-reads when mtime changes", () => {
      const cache = new Map<string, { body: Buffer; mtimeMs: number }>();
      cache.set("/test.txt", {
        body: Buffer.from("stale"),
        mtimeMs: 1000,
      });
      const body = getOrReadCachedFile(
        cache,
        "/test.txt",
        2000, // Different mtime
        () => Buffer.from("fresh"),
        10,
        1024,
      );
      expect(body.toString()).toBe("fresh");
    });

    it("does not cache files exceeding size limit", () => {
      const cache = new Map<string, { body: Buffer; mtimeMs: number }>();
      const largeBody = Buffer.alloc(2048);
      const body = getOrReadCachedFile(
        cache,
        "/big.bin",
        1000,
        () => largeBody,
        10,
        1024, // File is 2048, limit is 1024
      );
      expect(body.length).toBe(2048);
      expect(cache.has("/big.bin")).toBe(false);
    });

    it("evicts oldest cache entry when cache is full", () => {
      const cache = new Map<string, { body: Buffer; mtimeMs: number }>();
      cache.set("/a.txt", { body: Buffer.from("a"), mtimeMs: 1 });
      cache.set("/b.txt", { body: Buffer.from("b"), mtimeMs: 1 });

      getOrReadCachedFile(
        cache,
        "/c.txt",
        1,
        () => Buffer.from("c"),
        2, // maxEntries=2, cache already has 2
        1024,
      );

      expect(cache.has("/a.txt")).toBe(false); // oldest evicted
      expect(cache.has("/b.txt")).toBe(true);
      expect(cache.has("/c.txt")).toBe(true);
    });
  });
});
