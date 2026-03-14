import { describe, expect, it } from "vitest";
import { computeStreamingDelta } from "./parsers";

describe("computeStreamingDelta", () => {
  it.each([
    {
      name: "returns empty for empty incoming text",
      existing: "hello",
      incoming: "",
      expected: "",
    },
    {
      name: "returns the full incoming text when nothing is accumulated yet",
      existing: "",
      incoming: "hello",
      expected: "hello",
    },
    {
      name: "returns empty when incoming matches the accumulated text",
      existing: "hello",
      incoming: "hello",
      expected: "",
    },
    {
      name: "returns only the new suffix when incoming extends existing",
      existing: "hello",
      incoming: "hello world",
      expected: " world",
    },
    {
      name: "returns empty when incoming is already a large suffix of existing",
      existing: "streaming",
      incoming: "aming",
      expected: "",
    },
    {
      name: "returns the incoming text when there is no overlap",
      existing: "hello",
      incoming: "world",
      expected: "world",
    },
    {
      name: "returns only the non-overlapping tail for partial suffix-prefix overlap",
      existing: "hello world",
      incoming: "world!",
      expected: "!",
    },
    {
      name: "keeps small chunks even if they duplicate the existing suffix",
      existing: "Hello",
      incoming: "llo",
      expected: "llo",
    },
  ])("$name", ({ existing, incoming, expected }) => {
    expect(computeStreamingDelta(existing, incoming)).toBe(expected);
  });
});
