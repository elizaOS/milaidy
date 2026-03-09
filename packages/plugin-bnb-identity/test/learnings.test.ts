import { ethers } from "ethers";
import { parseLearningsMd } from "../src/learnings.js";
import { getLearningRoot } from "../src/merkle-learning.js";

describe("parseLearningsMd", () => {
  it("parses legacy action-style LEARNINGS blocks", () => {
    const raw = [
      "id: learn-1",
      "timestamp: 2026-01-01T00:00:00.000Z",
      "category: insight",
      "summary: Learned something useful",
      "detail: This came from the action flow.",
    ].join("\n");

    expect(parseLearningsMd(raw)).toEqual([
      {
        id: "learn-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        category: "insight",
        summary: "Learned something useful",
        contentHash: ethers.id("This came from the action flow."),
      },
    ]);
  });

  it("parses markdown identity sections without falling back to legacy hashing", () => {
    const raw = [
      "## [insight] — Markdown entry",
      "id: learn-1",
      "timestamp: 2026-01-01T00:00:00.000Z",
      "detail: This came from the UI flow.",
    ].join("\n");

    expect(parseLearningsMd(raw)).toEqual([
      {
        id: "learn-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        category: "insight",
        summary: "Markdown entry",
        contentHash: ethers.id("This came from the UI flow."),
      },
    ]);
  });

  it("keeps route and action Merkle roots aligned for equivalent entries", () => {
    const detail = "Unified parser keeps both anchor paths in sync.";
    const hash = ethers.id(detail);
    const legacy = [
      "id: learn-1",
      "timestamp: 2026-01-01T00:00:00.000Z",
      "category: insight",
      "summary: Unified parser",
      `detail: ${detail}`,
    ].join("\n");
    const markdown = [
      "## [insight] — Unified parser",
      "id: learn-1",
      "timestamp: 2026-01-01T00:00:00.000Z",
      `hash: ${hash}`,
    ].join("\n");

    expect(getLearningRoot(parseLearningsMd(legacy))).toBe(
      getLearningRoot(parseLearningsMd(markdown)),
    );
  });
});
