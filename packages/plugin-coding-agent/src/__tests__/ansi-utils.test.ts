/**
 * ANSI utility function tests
 */

import { describe, expect, it } from "bun:test";

const { captureTaskResponse, cleanForChat, extractDevServerUrl, stripAnsi } =
  await import("../services/ansi-utils.js");

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

describe("cleanForChat", () => {
  it("should strip orphaned ANSI SGR fragments", () => {
    const input = "[38;2;153;153;153mhello world";
    expect(cleanForChat(input)).toBe("hello world");
  });

  it("should strip Claude Code prompt character", () => {
    const input = "\u276F some prompt text";
    expect(cleanForChat(input)).toBe("some prompt text");
  });

  it("should filter git diff stat status lines", () => {
    const input = "Important output\n13 files +0 -0\nMore important output";
    expect(cleanForChat(input)).toBe("Important output\nMore important output");
  });

  it("should filter brew upgrade notice", () => {
    const input =
      "Real content\nUpdate available! Run: brew upgrade claude-code\nMore content";
    expect(cleanForChat(input)).toBe("Real content\nMore content");
  });

  it("should filter ctrl shortcut hints", () => {
    const input =
      "Real content\nctrl+o to expand\nctrl+t to hide tasks\nMore content";
    expect(cleanForChat(input)).toBe("Real content\nMore content");
  });

  it("should filter collapsed output indicators", () => {
    const input = "Real content\n+352 lines (ctrl+o to expand)\nMore content";
    expect(cleanForChat(input)).toBe("Real content\nMore content");
  });

  it("should filter file write summaries", () => {
    const input =
      "Real content\nWrote 362 lines to test_garden.py\nMore content";
    expect(cleanForChat(input)).toBe("Real content\nMore content");
  });

  it("should filter combined status bar line", () => {
    const input =
      "13 files +0 -0 esc to interrupt Update available! Run: brew upgrade claude-code";
    expect(cleanForChat(input)).toBe("");
  });

  it("should preserve legitimate content", () => {
    const input = "PR is up! https://github.com/org/repo/pull/121";
    expect(cleanForChat(input)).toBe(
      "PR is up! https://github.com/org/repo/pull/121",
    );
  });

  it("should strip TUI decorative characters while preserving text", () => {
    const input = "\u2714 Create garden & farming system (garden.py)";
    expect(cleanForChat(input)).toBe(
      "Create garden & farming system (garden.py)",
    );
  });

  it("should filter loading/thinking lines", () => {
    const input = "Real content\nthinking...\nMore content";
    expect(cleanForChat(input)).toBe("Real content\nMore content");
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

describe("extractDevServerUrl", () => {
  it("extracts http://localhost with port", () => {
    expect(extractDevServerUrl("Server running at http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });

  it("extracts https://localhost with port", () => {
    expect(extractDevServerUrl("  https://localhost:4200/")).toBe(
      "https://localhost:4200/",
    );
  });

  it("extracts 127.0.0.1 URLs", () => {
    expect(extractDevServerUrl("Listening on http://127.0.0.1:8080")).toBe(
      "http://127.0.0.1:8080",
    );
  });

  it("extracts 0.0.0.0 URLs", () => {
    expect(extractDevServerUrl("Local: http://0.0.0.0:5173/app")).toBe(
      "http://0.0.0.0:5173/app",
    );
  });

  it("returns null when no dev server URL is present", () => {
    expect(extractDevServerUrl("Just some terminal output")).toBeNull();
  });

  it("returns null for non-local URLs", () => {
    expect(extractDevServerUrl("Visit https://example.com:3000")).toBeNull();
  });

  it("handles ANSI codes in output", () => {
    expect(extractDevServerUrl("\x1b[32m  http://localhost:3000\x1b[0m")).toBe(
      "http://localhost:3000",
    );
  });

  it("extracts the first URL when multiple are present", () => {
    const input =
      "Local: http://localhost:3000\nNetwork: http://192.168.1.5:3000";
    expect(extractDevServerUrl(input)).toBe("http://localhost:3000");
  });
});
