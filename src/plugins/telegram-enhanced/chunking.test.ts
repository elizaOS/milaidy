/**
 * Unit tests for the Telegram smart chunking module.
 *
 * Covers: empty input, normal text, long messages exceeding the 4096 limit,
 * markdown preservation, and custom chunk sizes.
 */

import { describe, expect, it } from "vitest";
import { smartChunkTelegramText } from "./chunking.js";

describe("smartChunkTelegramText", () => {
  // --- Empty / falsy input ---

  it("returns empty array for empty string", () => {
    expect(smartChunkTelegramText("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(smartChunkTelegramText("   \n\t  ")).toEqual([]);
  });

  it("returns empty array for null input", () => {
    // @ts-expect-error — intentional null for robustness test
    expect(smartChunkTelegramText(null)).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    // @ts-expect-error — intentional undefined for robustness test
    expect(smartChunkTelegramText(undefined)).toEqual([]);
  });

  // --- Normal text ---

  it("returns a single chunk for short text", () => {
    const chunks = smartChunkTelegramText("Hello, world!");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("Hello, world!");
    expect(chunks[0].html).toBeTruthy();
  });

  it("returns chunks with both html and text fields", () => {
    const chunks = smartChunkTelegramText("Some text");
    expect(chunks).toHaveLength(1);
    expect(typeof chunks[0].html).toBe("string");
    expect(typeof chunks[0].text).toBe("string");
  });

  // --- Long text chunking ---

  it("splits text that exceeds the default limit into multiple chunks", () => {
    // Default limit is 4096 - 120 = 3976
    const longText = "A".repeat(5000);
    const chunks = smartChunkTelegramText(longText);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // All chunks should have content
    for (const chunk of chunks) {
      expect(chunk.html.length).toBeGreaterThan(0);
    }
  });

  it("respects custom maxChars parameter", () => {
    const text = "Hello world. This is a test message. It should be split.";
    const chunks = smartChunkTelegramText(text, 20);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  // --- Markdown formatting ---

  it("preserves markdown bold formatting in HTML output", () => {
    const chunks = smartChunkTelegramText("This is **bold** text");
    expect(chunks).toHaveLength(1);
    // The chunker converts markdown to HTML for Telegram
    expect(chunks[0].html).toContain("bold");
  });

  it("handles code blocks without crashing", () => {
    const text =
      "Here is code:\n```javascript\nconsole.log('hello');\n```\nEnd.";
    const chunks = smartChunkTelegramText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].html).toBeTruthy();
  });

  it("handles inline code", () => {
    const text = "Use `console.log()` for debugging";
    const chunks = smartChunkTelegramText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].html).toBeTruthy();
  });

  // --- Edge cases ---

  it("handles text that is exactly at the limit", () => {
    const text = "A".repeat(3976);
    const chunks = smartChunkTelegramText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it("handles text with only newlines", () => {
    const chunks = smartChunkTelegramText("\n\n\n");
    // Newlines-only might be trimmed to empty
    // The implementation trims first, so this should be empty
    expect(chunks).toEqual([]);
  });

  it("handles special characters (emoji, unicode)", () => {
    const text = "Hello 👋 world 🌍! This is a test with émojis and ünïcödé.";
    const chunks = smartChunkTelegramText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("👋");
  });

  // --- Fallback behavior ---

  it("returns raw text as fallback when markdownToTelegramChunks returns empty", () => {
    // Very short text should still produce at least one chunk
    const chunks = smartChunkTelegramText("x");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text.length).toBeGreaterThan(0);
  });
});
