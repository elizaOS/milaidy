import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  clearIdentity,
  patchIdentity,
  readIdentity,
  writeIdentity,
  clearNfa,
  patchNfa,
  readNfa,
  writeNfa,
} from "../src/store.js";
import type { IdentityRecord, NfaRecord } from "../src/types.js";

const mockRecord: IdentityRecord = {
  agentId: "42",
  network: "bsc-testnet",
  txHash: "0xdeadbeef",
  ownerAddress: "0xabc123",
  agentURI: "data:application/json;base64,eyJuYW1lIjoibWlsYSJ9",
  registeredAt: "2026-03-03T00:00:00.000Z",
  lastUpdatedAt: "2026-03-03T00:00:00.000Z",
};

describe("identity store", () => {
  beforeEach(async () => {
    await clearIdentity();
  });

  afterEach(async () => {
    await clearIdentity();
  });

  it("returns null when no identity file exists", async () => {
    const result = await readIdentity();
    expect(result).toBeNull();
  });

  it("writes and reads back an identity record", async () => {
    await writeIdentity(mockRecord);
    const result = await readIdentity();
    expect(result).not.toBeNull();
    expect(result?.agentId).toBe("42");
    expect(result?.network).toBe("bsc-testnet");
    expect(result?.txHash).toBe("0xdeadbeef");
  });

  it("overwrites an existing record on write", async () => {
    await writeIdentity(mockRecord);
    const updated: IdentityRecord = { ...mockRecord, agentId: "99" };
    await writeIdentity(updated);
    const result = await readIdentity();
    expect(result?.agentId).toBe("99");
  });

  it("patches specific fields while preserving others", async () => {
    await writeIdentity(mockRecord);
    const patched = await patchIdentity({
      agentURI: "ipfs://Qmnewuri",
    });
    expect(patched.agentURI).toBe("ipfs://Qmnewuri");
    expect(patched.agentId).toBe("42"); // unchanged
    expect(patched.network).toBe("bsc-testnet"); // unchanged
  });

  it("updates lastUpdatedAt on patch", async () => {
    await writeIdentity(mockRecord);
    const before = new Date(mockRecord.lastUpdatedAt).getTime();
    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 5));
    const patched = await patchIdentity({ agentURI: "ipfs://Qmnewuri" });
    const after = new Date(patched.lastUpdatedAt).getTime();
    expect(after).toBeGreaterThan(before);
  });

  it("throws on patchIdentity when no record exists", async () => {
    expect(patchIdentity({ agentURI: "ipfs://Qm" })).rejects.toThrow(
      "No identity record found",
    );
  });

  it("clearIdentity is idempotent — does not throw if file is missing", async () => {
    await clearIdentity(); // file already gone from beforeEach
    await expect(clearIdentity()).resolves.toBeUndefined();
  });
});

const mockNfa: NfaRecord = {
  tokenId: "1",
  network: "bsc-testnet",
  owner: "0xabc123",
  learningRoot: "0x" + "0".repeat(64),
  learningCount: 0,
  lastAnchoredAt: "2026-03-05T00:00:00.000Z",
  paused: false,
  mintTxHash: "0xdeadbeef",
};

describe("nfa store", () => {
  beforeEach(async () => {
    await clearNfa();
  });

  afterEach(async () => {
    await clearNfa();
  });

  it("returns null when no NFA file exists", async () => {
    const result = await readNfa();
    expect(result).toBeNull();
  });

  it("writes and reads back an NFA record", async () => {
    await writeNfa(mockNfa);
    const result = await readNfa();
    expect(result).not.toBeNull();
    expect(result?.tokenId).toBe("1");
    expect(result?.paused).toBe(false);
  });

  it("patches specific NFA fields while preserving others", async () => {
    await writeNfa(mockNfa);
    const patched = await patchNfa({
      learningRoot: "0x" + "a".repeat(64),
      learningCount: 5,
    });
    expect(patched.learningRoot).toBe("0x" + "a".repeat(64));
    expect(patched.learningCount).toBe(5);
    expect(patched.tokenId).toBe("1");
  });

  it("throws on patchNfa when no record exists", async () => {
    expect(patchNfa({ paused: true })).rejects.toThrow(
      "No NFA record found",
    );
  });

  it("clearNfa is idempotent", async () => {
    await clearNfa();
    await expect(clearNfa()).resolves.toBeUndefined();
  });
});
