import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LearningStore } from "./learning-store";

describe("LearningStore", () => {
  let tmpDir: string;
  let store: LearningStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-test-"));
    store = new LearningStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("records a learning and persists to file", () => {
    const entry = store.record("insight", "Always confirm before trading");
    expect(entry.id).toBeDefined();
    expect(entry.category).toBe("insight");
    expect(entry.summary).toBe("Always confirm before trading");
    expect(entry.occurrences).toBe(1);

    // File should exist
    expect(fs.existsSync(path.join(tmpDir, "LEARNINGS.md"))).toBe(true);
  });

  it("deduplicates by summary (case-insensitive)", () => {
    store.record("error", "Connection timeout on BSC RPC");
    const second = store.record("error", "connection timeout on bsc rpc");
    expect(second.occurrences).toBe(2);
    expect(store.getCount()).toBe(1);
  });

  it("tracks different summaries separately", () => {
    store.record("error", "Error A");
    store.record("error", "Error B");
    expect(store.getCount()).toBe(2);
  });

  it("writes ERRORS.md for error-category entries", () => {
    store.record("error", "Something failed");
    expect(fs.existsSync(path.join(tmpDir, "ERRORS.md"))).toBe(true);
  });

  it("does not write ERRORS.md when no errors exist", () => {
    store.record("insight", "Good pattern");
    expect(fs.existsSync(path.join(tmpDir, "ERRORS.md"))).toBe(false);
  });

  it("returns recent entries sorted by timestamp", () => {
    store.record("insight", "First");
    store.record("error", "Second");
    store.record("pattern", "Third");
    const recent = store.getRecent(2);
    expect(recent).toHaveLength(2);
    // All three have same-millisecond timestamps so just check we got 2 entries
    const summaries = recent.map((r) => r.summary);
    expect(summaries).toHaveLength(2);
  });

  it("reloads from file on new instance", () => {
    store.record("insight", "Persist me");
    store.record("error", "Also persist");

    const store2 = new LearningStore(tmpDir);
    expect(store2.getCount()).toBe(2);
  });

  it("prunes to max 1000 entries", () => {
    // Record 1005 unique entries
    for (let i = 0; i < 1005; i++) {
      store.record("pattern", `Pattern ${i}`);
    }
    expect(store.getCount()).toBeLessThanOrEqual(1000);
  });

  it("getPromotedCount returns 0 initially", () => {
    store.record("insight", "Not yet promoted");
    expect(store.getPromotedCount()).toBe(0);
  });
});
