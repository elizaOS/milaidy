import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(
    resolve(import.meta.dirname, "../../", relativePath),
    "utf8",
  );
}

describe("companion modal source regressions", () => {
  it("uses shared card/surface tokens for hardcoded in-modal companion panels", () => {
    const characterView = readSource("src/components/CharacterView.tsx");
    const inventoryView = readSource("src/components/InventoryView.tsx");
    const streamView = readSource("src/components/StreamView.tsx");

    expect(characterView).toContain("bg-[var(--card)]");
    expect(inventoryView).toContain("bg-[var(--card)]");
    expect(streamView).toContain("bg-[var(--surface)]");

    expect(characterView).not.toContain("bg-[rgba(255,255,255,0.04)]");
    expect(inventoryView).not.toContain("bg-[rgba(255,255,255,0.04)]");
    expect(streamView).not.toContain("bg-[rgba(255,255,255,0.03)]");
  });
});
