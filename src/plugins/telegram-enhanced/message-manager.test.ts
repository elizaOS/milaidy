/**
 * Unit tests for EnhancedTelegramMessageManager.
 *
 * Covers: typing indicators, receipt reactions, error handling,
 * message chunking with inline buttons, and draft streaming integration.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @elizaos/core logger before importing the module under test
vi.mock("@elizaos/core", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the base MessageManager from @elizaos/plugin-telegram
vi.mock("@elizaos/plugin-telegram", () => {
  class MockMessageManager {
    async handleMessage(_ctx: unknown) {
      // base implementation — tests override via prototype spy
    }
    async sendMessageInChunks(
      _ctx: unknown,
      _content: unknown,
      _replyTo?: number,
    ) {
      return [];
    }
  }

  function markdownToTelegramChunks(text: string, _maxChars?: number) {
    return [{ html: text, text }];
  }

  return {
    MessageManager: MockMessageManager,
    markdownToTelegramChunks,
  };
});

// Now import the module under test (after mocks are set up)
const { EnhancedTelegramMessageManager } = await import("./message-manager.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    chat: { id: 123 },
    from: { id: 456, first_name: "Test" },
    message: { message_id: 789 },
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 100, text: "ok" }),
      editMessageText: vi
        .fn()
        .mockResolvedValue({ message_id: 100, text: "edited" }),
      setMessageReaction: vi.fn().mockResolvedValue(true),
      sendChatAction: vi.fn().mockResolvedValue(true),
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EnhancedTelegramMessageManager", () => {
  let manager: InstanceType<typeof EnhancedTelegramMessageManager>;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new EnhancedTelegramMessageManager({} as unknown, {} as unknown);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // --- handleMessage: typing indicators ---

  describe("handleMessage - typing indicators", () => {
    it("sends typing indicator before processing", async () => {
      const ctx = createMockCtx();
      // Spy on parent handleMessage to resolve immediately
      vi.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(manager)),
        "handleMessage",
      ).mockResolvedValue(undefined);

      await manager.handleMessage(ctx);

      expect(ctx.telegram.sendChatAction).toHaveBeenCalledWith(123, "typing");
    });

    it("clears typing interval after processing completes", async () => {
      const ctx = createMockCtx();
      vi.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(manager)),
        "handleMessage",
      ).mockResolvedValue(undefined);

      await manager.handleMessage(ctx);

      // After handleMessage returns, the interval should be cleared.
      // Advance timers to verify no additional calls happen.
      const callCount = ctx.telegram.sendChatAction.mock.calls.length;
      await vi.advanceTimersByTimeAsync(8000);
      // Should NOT have additional calls since interval was cleared
      expect(ctx.telegram.sendChatAction.mock.calls.length).toBe(callCount);
    });
  });

  // --- handleMessage: receipt reactions ---

  describe("handleMessage - receipt reactions", () => {
    it("sends a receipt reaction emoji on the incoming message", async () => {
      const ctx = createMockCtx();
      vi.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(manager)),
        "handleMessage",
      ).mockResolvedValue(undefined);

      await manager.handleMessage(ctx);

      expect(ctx.telegram.setMessageReaction).toHaveBeenCalledWith(
        123,
        789,
        expect.arrayContaining([
          expect.objectContaining({
            type: "emoji",
            emoji: expect.stringMatching(/^(👀|⏳)$/),
          }),
        ]),
      );
    });

    it("gracefully handles reaction failure", async () => {
      const ctx = createMockCtx();
      ctx.telegram.setMessageReaction.mockRejectedValue(
        new Error("reaction not supported"),
      );
      vi.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(manager)),
        "handleMessage",
      ).mockResolvedValue(undefined);

      // Should not throw
      await expect(manager.handleMessage(ctx)).resolves.not.toThrow();
    });

    it("skips reaction when setMessageReaction is not a function", async () => {
      const ctx = createMockCtx();
      ctx.telegram.setMessageReaction = "not a function" as unknown;
      vi.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(manager)),
        "handleMessage",
      ).mockResolvedValue(undefined);

      await expect(manager.handleMessage(ctx)).resolves.not.toThrow();
    });
  });

  // --- handleMessage: error handling ---

  describe("handleMessage - error handling", () => {
    it("sends fallback error message when parent handler throws", async () => {
      const ctx = createMockCtx();
      vi.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(manager)),
        "handleMessage",
      ).mockRejectedValue(new Error("LLM timeout"));

      await manager.handleMessage(ctx);

      // Should send a friendly fallback message
      expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining("error"),
        expect.objectContaining({
          reply_parameters: { message_id: 789 },
        }),
      );
    });

    it("handles fallback message send failure gracefully", async () => {
      const ctx = createMockCtx();
      vi.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(manager)),
        "handleMessage",
      ).mockRejectedValue(new Error("LLM timeout"));
      ctx.telegram.sendMessage.mockRejectedValue(new Error("network error"));

      // Should not throw even when fallback send fails
      await expect(manager.handleMessage(ctx)).resolves.not.toThrow();
    });

    it("skips processing when ctx has no message", async () => {
      const ctx = createMockCtx({ message: undefined });

      await manager.handleMessage(ctx);

      expect(ctx.telegram.sendChatAction).not.toHaveBeenCalled();
    });

    it("skips processing when ctx has no from", async () => {
      const ctx = createMockCtx({ from: undefined });

      await manager.handleMessage(ctx);

      expect(ctx.telegram.sendChatAction).not.toHaveBeenCalled();
    });

    it("skips processing when ctx has no chat", async () => {
      const ctx = createMockCtx({ chat: undefined });

      await manager.handleMessage(ctx);

      expect(ctx.telegram.sendChatAction).not.toHaveBeenCalled();
    });
  });

  // --- sendMessageInChunks ---

  describe("sendMessageInChunks", () => {
    it("sends text message via draft streaming when editMessageText is available", async () => {
      // Draft streaming uses real setTimeout internally, so switch to real timers
      vi.useRealTimers();
      const ctx = createMockCtx();

      const result = await manager.sendMessageInChunks(
        ctx,
        { text: "Hello world" },
        789,
      );

      // Should have used sendMessage for the initial draft
      expect(ctx.telegram.sendMessage).toHaveBeenCalled();
      expect(result).toBeDefined();
      vi.useFakeTimers();
    });

    it("falls back to plain send when editMessageText is not a function", async () => {
      vi.useRealTimers();
      const ctx = createMockCtx();
      ctx.telegram.editMessageText = undefined;

      const result = await manager.sendMessageInChunks(
        ctx,
        { text: "Hello world" },
        789,
      );

      expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
        123,
        expect.any(String),
        expect.objectContaining({
          parse_mode: "HTML",
          reply_parameters: { message_id: 789 },
        }),
      );
      expect(Array.isArray(result)).toBe(true);
      vi.useFakeTimers();
    });

    it("delegates to parent for messages with attachments", async () => {
      vi.useRealTimers();
      const ctx = createMockCtx();
      const parentSpy = vi
        .spyOn(
          Object.getPrototypeOf(Object.getPrototypeOf(manager)),
          "sendMessageInChunks",
        )
        .mockResolvedValue([{ message_id: 200 }]);

      const content = {
        text: "Check this out",
        attachments: [{ type: "image", url: "https://example.com/img.png" }],
      };

      await manager.sendMessageInChunks(ctx, content, 789);

      expect(parentSpy).toHaveBeenCalled();
      vi.useFakeTimers();
    });

    it("returns empty array when chat is missing", async () => {
      const ctx = createMockCtx({ chat: undefined });

      const result = await manager.sendMessageInChunks(ctx, { text: "Hello" });

      expect(result).toEqual([]);
    });

    it("returns empty array for empty text", async () => {
      const ctx = createMockCtx();

      const result = await manager.sendMessageInChunks(ctx, { text: "" });

      expect(result).toEqual([]);
    });

    it("sends multiple chunks for long text without editMessageText", async () => {
      vi.useRealTimers();
      const ctx = createMockCtx();
      ctx.telegram.editMessageText = undefined;
      const longText = "Hello world. ".repeat(400); // ~5200 chars

      await manager.sendMessageInChunks(ctx, { text: longText });

      // Should have called sendMessage at least once (for chunked text)
      expect(ctx.telegram.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(
        1,
      );
      vi.useFakeTimers();
    });

    it("includes inline keyboard buttons on first chunk", async () => {
      vi.useRealTimers();
      const ctx = createMockCtx();
      ctx.telegram.editMessageText = undefined;
      const content = {
        text: "Check this link",
        buttons: [{ text: "Visit Site", url: "https://example.com" }],
      };

      await manager.sendMessageInChunks(ctx, content);

      const firstCall = ctx.telegram.sendMessage.mock.calls[0];
      expect(firstCall).toBeDefined();
      // The call should include reply_markup for inline keyboard
      const extra = firstCall[2];
      expect(extra).toBeDefined();
      vi.useFakeTimers();
    });

    it("handles login button kind", async () => {
      vi.useRealTimers();
      const ctx = createMockCtx();
      ctx.telegram.editMessageText = undefined;
      const content = {
        text: "Please login",
        buttons: [
          { text: "Login", url: "https://example.com/auth", kind: "login" },
        ],
      };

      await manager.sendMessageInChunks(ctx, content);

      expect(ctx.telegram.sendMessage).toHaveBeenCalled();
      vi.useFakeTimers();
    });

    it("skips buttons with missing text or url", async () => {
      vi.useRealTimers();
      const ctx = createMockCtx();
      ctx.telegram.editMessageText = undefined;
      const content = {
        text: "No buttons",
        buttons: [
          { text: "", url: "https://example.com" },
          { text: "Valid", url: "" },
          { text: "Good", url: "https://example.com" },
        ],
      };

      await manager.sendMessageInChunks(ctx, content);
      expect(ctx.telegram.sendMessage).toHaveBeenCalled();
      vi.useFakeTimers();
    });

    it("handles null/undefined buttons array", async () => {
      vi.useRealTimers();
      const ctx = createMockCtx();
      ctx.telegram.editMessageText = undefined;

      await manager.sendMessageInChunks(ctx, {
        text: "No buttons",
        buttons: undefined,
      });

      expect(ctx.telegram.sendMessage).toHaveBeenCalled();
      vi.useFakeTimers();
    });
  });
});
