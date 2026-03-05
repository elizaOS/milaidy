import { afterEach, describe, expect, it } from "bun:test";
import {
  readNfaRecord,
  writeNfaRecord,
  patchNfaRecord,
  clearNfaRecord,
} from "../src/store";
import type { NfaRecord } from "../src/types";

const SAMPLE_RECORD: NfaRecord = {
  tokenId: "42",
  contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
  network: "bsc-testnet",
  ownerAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  mintTxHash: "0xdeadbeef",
  merkleRoot: "abc123",
  mintedAt: "2025-01-15T00:00:00.000Z",
  lastUpdatedAt: "2025-01-15T00:00:00.000Z",
};

afterEach(async () => {
  await clearNfaRecord();
});

describe("store", () => {
  it("returns null when no record exists", async () => {
    expect(await readNfaRecord()).toBeNull();
  });

  it("writes and reads a record", async () => {
    await writeNfaRecord(SAMPLE_RECORD);
    const read = await readNfaRecord();
    expect(read).toEqual(SAMPLE_RECORD);
  });

  it("patches an existing record", async () => {
    await writeNfaRecord(SAMPLE_RECORD);
    const patched = await patchNfaRecord({ merkleRoot: "newroot" });
    expect(patched.merkleRoot).toBe("newroot");
    expect(patched.tokenId).toBe("42");
    // lastUpdatedAt should change
    expect(patched.lastUpdatedAt).not.toBe(SAMPLE_RECORD.lastUpdatedAt);
  });

  it("throws when patching without existing record", async () => {
    await expect(patchNfaRecord({ merkleRoot: "x" })).rejects.toThrow(
      "No NFA record found"
    );
  });

  it("clears the record", async () => {
    await writeNfaRecord(SAMPLE_RECORD);
    await clearNfaRecord();
    expect(await readNfaRecord()).toBeNull();
  });
});
