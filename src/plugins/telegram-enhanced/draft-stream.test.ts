import { describe, expect, it, vi } from "vitest";
import {
  DraftStreamer,
  simulateSentenceStream,
  splitIntoSentenceChunks,
} from "./draft-stream.js";

describe("telegram enhanced draft streaming", () => {
  it("splits sentence chunks for progressive updates", () => {
    expect(splitIntoSentenceChunks("")).toEqual([]);
    expect(splitIntoSentenceChunks("hello")).toEqual(["hello"]);

    const chunks = splitIntoSentenceChunks("Hello. World!");
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.join("")).toContain("Hello.");
    expect(chunks.join("")).toContain("World!");
  });

  it("simulates sentence streaming in order", async () => {
    const updates: string[] = [];

    await simulateSentenceStream(
      "Hello. World!",
      (currentText) => {
        updates.push(currentText);
      },
      0,
    );

    expect(updates).toEqual(["Hello. ", "Hello. World!"]);
  });

  it("flushes and finalizes a draft message", async () => {
    const sendMessage = vi
      .fn<
        (
          chatId: number,
          text: string,
          extra?: Record<
            string,
            string | number | boolean | object | null | undefined
          >,
        ) => Promise<object | boolean | null | undefined>
      >()
      .mockResolvedValueOnce({ message_id: 42, text: "init" });
    const editMessageText = vi
      .fn<
        (
          chatId: number,
          messageId: number,
          inlineMessageId: undefined,
          text: string,
          extra?: Record<
            string,
            string | number | boolean | object | null | undefined
          >,
        ) => Promise<object | boolean | null | undefined>
      >()
      .mockResolvedValue({ message_id: 42, text: "final" });

    const streamer = new DraftStreamer({
      chatId: 123,
      telegram: {
        sendMessage,
        editMessageText,
      },
      editIntervalMs: 0,
    });

    streamer.update("Hello");
    await streamer.flush();
    const finalized = await streamer.finalize("Hello world");

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(editMessageText.mock.calls.length).toBeGreaterThanOrEqual(2);
    const lastEditCall =
      editMessageText.mock.calls[editMessageText.mock.calls.length - 1];
    expect(lastEditCall?.[3]).toContain("Hello world");
    expect(lastEditCall?.[3]).not.toContain("▌");
    expect(finalized[0]?.message_id).toBe(42);
  });

  it("falls back to sendMessage when edit fails", async () => {
    const sendMessage = vi
      .fn<
        (
          chatId: number,
          text: string,
          extra?: Record<
            string,
            string | number | boolean | object | null | undefined
          >,
        ) => Promise<object | boolean | null | undefined>
      >()
      .mockResolvedValueOnce({ message_id: 1, text: "init" })
      .mockResolvedValueOnce({ message_id: 2, text: "replacement" });
    const editMessageText = vi
      .fn<
        (
          chatId: number,
          messageId: number,
          inlineMessageId: undefined,
          text: string,
          extra?: Record<
            string,
            string | number | boolean | object | null | undefined
          >,
        ) => Promise<object | boolean | null | undefined>
      >()
      .mockRejectedValue(new Error("edit failed"));

    const streamer = new DraftStreamer({
      chatId: 123,
      telegram: {
        sendMessage,
        editMessageText,
      },
      editIntervalMs: 0,
    });

    streamer.update("fallback message");
    await streamer.flush();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[1]?.[1]).toContain("fallback message");
  });

  it("ignores 'message is not modified' edit errors", async () => {
    const sendMessage = vi
      .fn<
        (
          chatId: number,
          text: string,
          extra?: Record<
            string,
            string | number | boolean | object | null | undefined
          >,
        ) => Promise<object | boolean | null | undefined>
      >()
      .mockResolvedValue({ message_id: 1, text: "init" });
    const editMessageText = vi
      .fn<
        (
          chatId: number,
          messageId: number,
          inlineMessageId: undefined,
          text: string,
          extra?: Record<
            string,
            string | number | boolean | object | null | undefined
          >,
        ) => Promise<object | boolean | null | undefined>
      >()
      .mockRejectedValue(new Error("message is not modified"));

    const streamer = new DraftStreamer({
      chatId: 123,
      telegram: {
        sendMessage,
        editMessageText,
      },
      editIntervalMs: 0,
    });

    streamer.update("same text");
    await streamer.flush();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(editMessageText).toHaveBeenCalledTimes(1);
  });
});
