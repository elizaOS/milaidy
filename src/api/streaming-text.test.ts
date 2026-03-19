import { describe, expect, it } from "vitest";
import {
  computeStreamingDelta,
  mergeStreamingText,
  resolveStreamingUpdate,
} from "./streaming-text";

describe("mergeStreamingText", () => {
  it("appends plain deltas", () => {
    expect(mergeStreamingText("Hello", " world")).toBe("Hello world");
  });

  it("accepts cumulative snapshots", () => {
    expect(mergeStreamingText("Hello", "Hello world")).toBe("Hello world");
  });

  it("replaces revised full snapshots", () => {
    expect(mergeStreamingText("world", "Hello world")).toBe("Hello world");
  });

  it("replaces corrected snapshots that revise earlier words", () => {
    expect(mergeStreamingText("Hello wrld", "Hello world")).toBe("Hello world");
  });

  it("drops already-applied larger suffix fragments", () => {
    expect(mergeStreamingText("Hello world", "world")).toBe("Hello world");
  });

  it("drops repeated short suffix fragments already present", () => {
    expect(mergeStreamingText("abc", "bc")).toBe("abc");
  });
});

describe("resolveStreamingUpdate", () => {
  it("emits append chunks for monotonic growth", () => {
    expect(resolveStreamingUpdate("Hello", "Hello world")).toEqual({
      kind: "append",
      nextText: "Hello world",
      emittedText: " world",
    });
  });

  it("emits replacement snapshots for revised full text", () => {
    expect(resolveStreamingUpdate("world", "Hello world")).toEqual({
      kind: "replace",
      nextText: "Hello world",
      emittedText: "Hello world",
    });
  });

  it("emits replacement snapshots for corrected full text", () => {
    expect(resolveStreamingUpdate("Hello wrld", "Hello world")).toEqual({
      kind: "replace",
      nextText: "Hello world",
      emittedText: "Hello world",
    });
  });

  it("suppresses already-seen suffix fragments", () => {
    expect(resolveStreamingUpdate("Hello world", "world")).toEqual({
      kind: "noop",
      nextText: "Hello world",
      emittedText: "",
    });
  });
});

describe("computeStreamingDelta", () => {
  it("emits only appended text for cumulative snapshots", () => {
    expect(computeStreamingDelta("Hello", "Hello world")).toBe(" world");
  });

  it("suppresses repeated suffix fragments", () => {
    expect(computeStreamingDelta("Hello world", "world")).toBe("");
  });

  it("returns the new suffix for overlap-heavy chunks", () => {
    expect(computeStreamingDelta("prefix-xxxxworld", "world!yyy")).toBe("!yyy");
  });

  it("returns the full incoming text for non-overlapping replacements", () => {
    expect(computeStreamingDelta("world", "Hello world")).toBe("Hello world");
  });
});
