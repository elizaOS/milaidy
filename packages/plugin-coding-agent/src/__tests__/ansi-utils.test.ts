/**
 * ANSI utility function tests
 */

import { describe, expect, it } from "bun:test";
import { captureTaskResponse, stripAnsi } from "../services/ansi-utils.js";

describe("stripAnsi", () => {
  it("should replace cursor movement codes with spaces", () => {
    expect(stripAnsi("hello\x1b[5Cworld")).toBe("hello world");
  });

  it("should remove OSC sequences", () => {
    expect(stripAnsi("\x1b]0;my-title\x07visible")).toBe("visible");
  });

  it("should remove control characters", () => {
    expect(stripAnsi("clean\x00\x01\x02text")).toBe("cleantext");
  });

  it("should collapse long spaces to a single space", () => {
    expect(stripAnsi("a     b")).toBe("a b");
  });

  it("should preserve regular text", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("should handle mixed ANSI and text", () => {
    const input = "\x1b[32mhello\x1b[0m\x1b[5Cworld\x1b]0;t\x07";
    expect(stripAnsi(input)).toBe("hello world");
  });
});

describe("captureTaskResponse", () => {
  it("should return lines after the marker, stripped", () => {
    const buffers = new Map([
      ["s1", ["old", "old2", "\x1b[32mnew\x1b[0m line"]],
    ]);
    const markers = new Map([["s1", 2]]);

    expect(captureTaskResponse("s1", buffers, markers)).toBe("new line");
  });

  it("should delete the marker after capture", () => {
    const buffers = new Map([["s1", ["before", "after"]]]);
    const markers = new Map([["s1", 1]]);

    captureTaskResponse("s1", buffers, markers);
    expect(markers.has("s1")).toBe(false);
  });

  it("should return empty string when no buffer exists", () => {
    const buffers = new Map<string, string[]>();
    const markers = new Map([["s1", 0]]);

    expect(captureTaskResponse("s1", buffers, markers)).toBe("");
  });

  it("should return empty string when no marker exists", () => {
    const buffers = new Map([["s1", ["data"]]]);
    const markers = new Map<string, number>();

    expect(captureTaskResponse("s1", buffers, markers)).toBe("");
  });

  it("should return empty string when buffer after marker is empty", () => {
    const buffers = new Map([["s1", ["only-before"]]]);
    const markers = new Map([["s1", 1]]);

    expect(captureTaskResponse("s1", buffers, markers)).toBe("");
  });
});
