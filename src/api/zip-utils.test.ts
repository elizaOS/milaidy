import { describe, expect, it } from "vitest";
import { createZipArchive } from "./zip-utils";

function listZipEntries(zip: Buffer): string[] {
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocdOffset = zip.lastIndexOf(eocdSignature);
  if (eocdOffset < 0) {
    throw new Error("EOCD record not found");
  }

  const totalEntries = zip.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = zip.readUInt32LE(eocdOffset + 16);
  const names: string[] = [];

  let cursor = centralDirOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    const signature = zip.readUInt32LE(cursor);
    if (signature !== 0x02014b50) {
      throw new Error(`Invalid central directory signature at ${cursor}`);
    }
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    names.push(zip.subarray(nameStart, nameEnd).toString("utf-8"));
    cursor = nameEnd + extraLength + commentLength;
  }
  return names;
}

describe("createZipArchive", () => {
  it("creates a valid zip with expected file entries", () => {
    const zip = createZipArchive([
      { name: "trajectory-1/summary.json", data: '{"ok":true}' },
      { name: "trajectory-1/llm-calls.json", data: "[]" },
      { name: "manifest.json", data: "{}" },
    ]);

    expect(zip.subarray(0, 2).toString("utf-8")).toBe("PK");
    const names = listZipEntries(zip);
    expect(names).toEqual([
      "trajectory-1/summary.json",
      "trajectory-1/llm-calls.json",
      "manifest.json",
    ]);
  });

  it("rejects unsafe names", () => {
    expect(() =>
      createZipArchive([{ name: "../escape.txt", data: "bad" }]),
    ).toThrow();
  });
});
