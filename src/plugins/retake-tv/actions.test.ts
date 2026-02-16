/**
 * Unit tests for retake-tv action handlers and validation guards.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getChatHistoryAction,
  registerAction,
  goLiveAction,
  sendChatAction,
  stopStreamAction,
  updateThumbnailAction,
  streamStatusAction,
} from "./actions.js";

vi.mock("./index.js", () => ({
  getRetakeClient: vi.fn(),
  getRetakeCredentials: vi.fn(),
  getStreamManager: vi.fn(),
  startChatPollerWithGreeting: vi.fn(),
  stopChatPoller: vi.fn(),
}));

import * as index from "./index.js";

const mockClient = () => ({
  register: vi.fn(),
  getRtmpCredentials: vi.fn(),
  startStream: vi.fn(),
  stopStream: vi.fn(),
  updateThumbnail: vi.fn(),
  sendChat: vi.fn(),
  getChatHistory: vi.fn(),
  getStreamStatus: vi.fn(),
});

const mockStreamManager = () => ({
  getState: vi.fn(),
  goLive: vi.fn(),
  shutdown: vi.fn(),
  captureThumbnail: vi.fn(),
});

describe("retake-tv action validate + handler behavior", () => {
  const getClient = vi.mocked(index.getRetakeClient);
  const getCredentials = vi.mocked(index.getRetakeCredentials);
  const getStreamManager = vi.mocked(index.getStreamManager);
  const startPoller = vi.mocked(index.startChatPollerWithGreeting);
  const stopPoller = vi.mocked(index.stopChatPoller);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("register action validate blocks when credentials already exist", async () => {
    getCredentials.mockReturnValue({} as never);
    expect(await registerAction.validate()).toBe(false);

    getCredentials.mockReturnValue(null);
    expect(await registerAction.validate()).toBe(true);
  });

  it("register action handler requires required parameters", async () => {
    const client = mockClient();
    client.register.mockResolvedValue({
      access_token: "tok-1",
      agent_id: "a1",
      userDbId: "u1",
      wallet_address: "wallet-1",
      token_address: "0xabc",
      token_ticker: "TTK",
    });
    getClient.mockReturnValue(client as never);
    const missingWalletResult = await registerAction.handler(
      null as never,
      null as never,
      null as never,
      { parameters: { agent_name: "Agent" } } as never,
    );

    expect(missingWalletResult.success).toBe(false);

    const ok = await registerAction.handler(
      null as never,
      null as never,
      null as never,
      {
        parameters: {
          agent_name: "Agent",
          wallet_address: "wallet-1",
        },
      } as never,
    );
    expect(client.register).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_name: "Agent",
        wallet_address: "wallet-1",
      }),
    );
    expect(ok.success).toBe(true);
  });

  it("go-live validate requires initialized client and non-live stream", async () => {
    const stream = mockStreamManager();
    getClient.mockReturnValue({} as never);
    getStreamManager.mockReturnValue(stream as never);
    stream.getState.mockReturnValue({ isStreaming: false, hasAudio: false });

    expect(await goLiveAction.validate()).toBe(true);

    stream.getState.mockReturnValue({ isStreaming: true, hasAudio: false });
    expect(await goLiveAction.validate()).toBe(false);
  });

  it("go-live handler starts stream pipeline and starts chat poller", async () => {
    const client = mockClient();
    const stream = mockStreamManager();

    client.getRtmpCredentials.mockResolvedValue({ url: "rtmp://example", key: "abc" });
    client.startStream.mockResolvedValue({
      success: true,
      token: {
        name: "token",
        ticker: "TTK",
        imageUrl: "https://example",
        tokenAddress: "0x123",
        tokenType: "mock",
      },
    });
    client.updateThumbnail.mockResolvedValue({ message: "ok", thumbnail_url: "u" });
    stream.captureThumbnail.mockReturnValue(Buffer.from("png"));
    stream.goLive.mockResolvedValue(undefined as never);
    getClient.mockReturnValue(client as never);
    getStreamManager.mockReturnValue(stream as never);
    getCredentials.mockReturnValue({ userDbId: "user-1" } as never);

    const res = await goLiveAction.handler();

    expect(stream.goLive).toHaveBeenCalledWith({
      url: "rtmp://example",
      key: "abc",
    });
    expect(startPoller).toHaveBeenCalledTimes(1);
    expect(client.updateThumbnail).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
  });

  it("send-chat handler requires content and destination", async () => {
    const client = mockClient();
    getClient.mockReturnValue(client as never);
    getCredentials.mockReturnValue(null);

    const missing = await sendChatAction.handler(
      null as never,
      null as never,
      null as never,
      { parameters: {} } as never,
    );
    expect(missing.success).toBe(false);

    getCredentials.mockReturnValue({
      userDbId: "u-1",
      access_token: "",
      agent_id: "",
      wallet_address: "",
      token_address: "",
      token_ticker: "",
    } as never);

    const result = await sendChatAction.handler(
      null as never,
      null as never,
      null as never,
      {
        parameters: {
          destination_user_id: "d-1",
          message: "  hey there  ",
        },
      } as never,
    );

    expect(client.sendChat).toHaveBeenCalledWith("d-1", "hey there");
    expect(result.success).toBe(true);
  });

  it("stop stream action is gated by active stream state", async () => {
    const stream = mockStreamManager();
    getStreamManager.mockReturnValue(stream as never);
    getClient.mockReturnValue(mockClient() as never);

    stream.getState.mockReturnValue({ isStreaming: true, hasAudio: false });
    expect(await stopStreamAction.validate()).toBe(true);

    stream.getState.mockReturnValue({ isStreaming: false, hasAudio: false });
    expect(await stopStreamAction.validate()).toBe(false);
  });

  it("update thumbnail action returns failure when capture fails", async () => {
    const client = mockClient();
    const stream = mockStreamManager();
    stream.captureThumbnail.mockReturnValue(null);
    getClient.mockReturnValue(client as never);
    getStreamManager.mockReturnValue(stream as never);

    const result = await updateThumbnailAction.handler();
    expect(result.success).toBe(false);
  });

  it("stream status action tolerates API failure", async () => {
    const client = mockClient();
    const stream = mockStreamManager();
    stream.getState.mockReturnValue({
      isStreaming: false,
      hasAudio: false,
    });
    client.getStreamStatus.mockRejectedValue(new Error("offline"));
    getClient.mockReturnValue(client as never);
    getStreamManager.mockReturnValue(stream as never);

    const result = await streamStatusAction.handler();
    expect(result.success).toBe(true);
    expect(result.text).toContain("API unreachable");
  });

  it("getChatHistory action defaults limit to 20 on invalid input", async () => {
    const client = mockClient();
    client.getChatHistory.mockResolvedValue({
      comments: [
        {
          _id: "1",
          streamId: "stream-1",
          text: "hello",
          timestamp: "2026-02-16T00:00:00Z",
          author: {
            walletAddress: "w1",
            fusername: "a",
            fid: 1,
            favatar: "x",
          },
        },
      ],
    });
    getClient.mockReturnValue(client as never);
    getCredentials.mockReturnValue({ userDbId: "u1" } as never);

    const result = await getChatHistoryAction.handler(
      null as never,
      null as never,
      null as never,
      { parameters: { limit: "not-a-number" } } as never,
    );

    expect(client.getChatHistory).toHaveBeenCalledWith("u1", { limit: 20 });
    expect(result.success).toBe(true);
  });

  it("stop stream handler calls shutdown and notifies API", async () => {
    const client = mockClient();
    const stream = mockStreamManager();
    stream.getState.mockReturnValue({ isStreaming: true, hasAudio: false });
    client.stopStream.mockResolvedValue({
      status: "ok",
      duration_seconds: 90,
      viewers: 5,
    });

    getClient.mockReturnValue(client as never);
    getStreamManager.mockReturnValue(stream as never);

    const result = await stopStreamAction.handler();

    expect(stopPoller).toHaveBeenCalledTimes(1);
    expect(stream.shutdown).toHaveBeenCalledTimes(1);
    expect(client.stopStream).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.text).toContain("1m 30s");
  });
});
