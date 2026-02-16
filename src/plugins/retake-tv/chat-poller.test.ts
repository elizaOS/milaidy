/**
 * Unit tests for Retake chat polling behavior.
 *
 * Focuses on deduplication, new-viewer detection, lifecycle, and pruning.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPoller } from "./chat-poller.js";
import type { ChatMessage } from "./types.js";

type MockChatClient = {
  getChatHistory: ReturnType<typeof vi.fn>;
};

const toPollerClient = (client: MockChatClient): Parameters<ChatPoller["start"]>[0] =>
  client as Parameters<ChatPoller["start"]>[0];

const makeMessage = (
  id: string,
  walletAddress = `wallet-${id}`,
  text = `msg-${id}`,
): ChatMessage => ({
  _id: id,
  streamId: "stream-1",
  text,
  timestamp: "2026-02-16T00:00:00Z",
  author: {
    walletAddress,
    fusername: `viewer-${walletAddress}`,
    fid: 1,
    favatar: "https://example.com/avatar.png",
  },
});

describe("ChatPoller", () => {
  let client: MockChatClient;
  let poller: ChatPoller;

  beforeEach(() => {
    client = {
      getChatHistory: vi.fn(),
    };
    poller = new ChatPoller({ intervalMs: 10, limit: 100 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    poller.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("invokes message and viewer callbacks for new messages only", async () => {
    const onNewMessage = vi.fn();
    const onNewViewer = vi.fn();

    client.getChatHistory
      .mockResolvedValueOnce({
        comments: [makeMessage("1", "wallet-a"), makeMessage("2", "wallet-b")],
      })
      .mockResolvedValueOnce({
        comments: [makeMessage("1", "wallet-a"), makeMessage("3", "wallet-a"), makeMessage("2", "wallet-b")],
      });

    poller.start(toPollerClient(client), "viewer-user", {
      onNewMessage,
      onNewViewer,
    });

    await vi.advanceTimersByTimeAsync(25);

    expect(onNewMessage).toHaveBeenCalledTimes(3);
    expect(onNewViewer).toHaveBeenCalledTimes(2);
    expect(onNewViewer).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress: "wallet-a" }),
    );
    expect(onNewViewer).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress: "wallet-b" }),
    );
  });

  it("deduplicates messages by id across polls", async () => {
    const onNewMessage = vi.fn();

    client.getChatHistory
      .mockResolvedValueOnce({ comments: [makeMessage("a"), makeMessage("b")] })
      .mockResolvedValueOnce({
        comments: [makeMessage("a"), makeMessage("c")],
      })
      .mockResolvedValueOnce({ comments: [makeMessage("c"), makeMessage("d")] });

    poller.start(toPollerClient(client), "viewer-user", {
      onNewMessage,
    });

    await vi.advanceTimersByTimeAsync(35);

    expect(onNewMessage).toHaveBeenCalledTimes(4);
  });

  it("prunes seen message ids when large to cap memory", async () => {
    const messages = Array.from({ length: 2001 }, (_, i) =>
      makeMessage(`msg-${i}`),
    );
    client.getChatHistory.mockResolvedValueOnce({ comments: messages });

    poller.start(toPollerClient(client), "viewer-user", {});
    await vi.advanceTimersByTimeAsync(15);

    const state = poller as unknown as { seenMessageIds: Set<string> };
    expect(state.seenMessageIds.size).toBe(1000);
  });

  it("stops polling and reports stopped state", async () => {
    poller.start(toPollerClient(client), "viewer-user", {});
    expect(poller.isPolling).toBe(true);

    poller.stop();
    expect(poller.isPolling).toBe(false);
  });
});
