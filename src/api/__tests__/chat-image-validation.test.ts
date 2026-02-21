import { ChannelType } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  buildChatAttachments,
  buildUserMessages,
  countChatAttachmentsMissingPayload,
  validateChatImages,
} from "../server";

type UUID = `${string}-${string}-${string}-${string}-${string}`;

describe("validateChatImages", () => {
  describe("absence / empty", () => {
    it("returns null for undefined", () => {
      expect(validateChatImages(undefined)).toBeNull();
    });

    it("returns null for null", () => {
      expect(validateChatImages(null)).toBeNull();
    });

    it("returns null for empty array", () => {
      expect(validateChatImages([])).toBeNull();
    });

    it("returns null for non-array (object)", () => {
      expect(
        validateChatImages({ data: "x", mimeType: "image/png", name: "x.png" }),
      ).toBeNull();
    });
  });

  describe("valid images", () => {
    const valid = {
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
      mimeType: "image/png",
      name: "test.png",
    };

    it("accepts a single valid image", () => {
      expect(validateChatImages([valid])).toBeNull();
    });

    it("accepts up to 4 images", () => {
      expect(validateChatImages([valid, valid, valid, valid])).toBeNull();
    });

    it("accepts image/jpeg", () => {
      expect(
        validateChatImages([{ ...valid, mimeType: "image/jpeg" }]),
      ).toBeNull();
    });

    it("accepts image/gif", () => {
      expect(
        validateChatImages([{ ...valid, mimeType: "image/gif" }]),
      ).toBeNull();
    });

    it("accepts image/webp", () => {
      expect(
        validateChatImages([{ ...valid, mimeType: "image/webp" }]),
      ).toBeNull();
    });

    it("accepts image/png", () => {
      expect(
        validateChatImages([{ ...valid, mimeType: "image/png" }]),
      ).toBeNull();
    });
  });

  describe("count limit", () => {
    const valid = { data: "abc", mimeType: "image/png", name: "x.png" };

    it("rejects more than 4 images", () => {
      const err = validateChatImages([valid, valid, valid, valid, valid]);
      expect(err).toMatch(/Too many images/);
    });
  });

  describe("item shape", () => {
    it("rejects a non-object item", () => {
      expect(validateChatImages(["string"])).toMatch(/object/);
    });

    it("rejects a null item", () => {
      expect(validateChatImages([null])).toMatch(/object/);
    });
  });

  describe("data field", () => {
    it("rejects missing data", () => {
      expect(
        validateChatImages([{ mimeType: "image/png", name: "x.png" }]),
      ).toMatch(/data/);
    });

    it("rejects empty data string", () => {
      expect(
        validateChatImages([
          { data: "", mimeType: "image/png", name: "x.png" },
        ]),
      ).toMatch(/data/);
    });

    it("rejects data URL prefix (data:image/...;base64,...)", () => {
      expect(
        validateChatImages([
          {
            data: "data:image/png;base64,abc",
            mimeType: "image/png",
            name: "x.png",
          },
        ]),
      ).toMatch(/raw base64/);
    });

    it("rejects data exceeding 5 MB", () => {
      const oversized = "a".repeat(5 * 1_048_576 + 1);
      expect(
        validateChatImages([
          { data: oversized, mimeType: "image/png", name: "x.png" },
        ]),
      ).toMatch(/too large/i);
    });

    it("accepts data exactly at the 5 MB limit", () => {
      const atLimit = "a".repeat(5 * 1_048_576);
      expect(
        validateChatImages([
          { data: atLimit, mimeType: "image/png", name: "x.png" },
        ]),
      ).toBeNull();
    });

    it("rejects non-string data", () => {
      expect(
        validateChatImages([
          { data: 123, mimeType: "image/png", name: "x.png" },
        ]),
      ).toMatch(/data/);
    });

    it("rejects malformed base64 (invalid characters)", () => {
      expect(
        validateChatImages([
          { data: "abc!@#$%", mimeType: "image/png", name: "x.png" },
        ]),
      ).toMatch(/invalid base64/i);
    });

    it("accepts valid base64 with padding", () => {
      expect(
        validateChatImages([
          { data: "aGVsbG8=", mimeType: "image/png", name: "x.png" },
        ]),
      ).toBeNull();
    });
  });

  describe("mimeType field", () => {
    it("rejects missing mimeType", () => {
      expect(validateChatImages([{ data: "abc", name: "x.png" }])).toMatch(
        /mimeType/,
      );
    });

    it("rejects empty mimeType", () => {
      expect(
        validateChatImages([{ data: "abc", mimeType: "", name: "x.png" }]),
      ).toMatch(/mimeType/);
    });

    it("rejects text/plain", () => {
      expect(
        validateChatImages([
          { data: "abc", mimeType: "text/plain", name: "x.txt" },
        ]),
      ).toMatch(/Unsupported image type/);
    });

    it("rejects image/svg+xml", () => {
      expect(
        validateChatImages([
          { data: "abc", mimeType: "image/svg+xml", name: "x.svg" },
        ]),
      ).toMatch(/Unsupported image type/);
    });

    it("rejects application/octet-stream", () => {
      expect(
        validateChatImages([
          { data: "abc", mimeType: "application/octet-stream", name: "x.bin" },
        ]),
      ).toMatch(/Unsupported image type/);
    });

    it("accepts mixed-case mimeType (Image/PNG) — case-insensitive allowlist", () => {
      expect(
        validateChatImages([
          { data: "abc", mimeType: "Image/PNG", name: "x.png" },
        ]),
      ).toBeNull();
    });

    it("accepts mixed-case mimeType (IMAGE/JPEG)", () => {
      expect(
        validateChatImages([
          { data: "abc", mimeType: "IMAGE/JPEG", name: "x.jpg" },
        ]),
      ).toBeNull();
    });
  });

  describe("name field", () => {
    it("rejects missing name", () => {
      expect(
        validateChatImages([{ data: "abc", mimeType: "image/png" }]),
      ).toMatch(/name/);
    });

    it("rejects empty name", () => {
      expect(
        validateChatImages([{ data: "abc", mimeType: "image/png", name: "" }]),
      ).toMatch(/name/);
    });

    it("rejects non-string name", () => {
      expect(
        validateChatImages([{ data: "abc", mimeType: "image/png", name: 42 }]),
      ).toMatch(/name/);
    });

    it("rejects name exceeding 255 characters", () => {
      const longName = `${"a".repeat(256)}.png`;
      expect(
        validateChatImages([
          { data: "abc", mimeType: "image/png", name: longName },
        ]),
      ).toMatch(/name/);
    });

    it("accepts name at exactly 255 characters", () => {
      const maxName = "a".repeat(255);
      expect(
        validateChatImages([
          { data: "abc", mimeType: "image/png", name: maxName },
        ]),
      ).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// buildChatAttachments
// ---------------------------------------------------------------------------

describe("buildChatAttachments", () => {
  const img = { data: "abc123", mimeType: "image/png", name: "photo.png" };

  it("returns undefined for both when images is undefined", () => {
    const { attachments, compactAttachments } = buildChatAttachments(undefined);
    expect(attachments).toBeUndefined();
    expect(compactAttachments).toBeUndefined();
  });

  it("returns undefined for both when images is empty", () => {
    const { attachments, compactAttachments } = buildChatAttachments([]);
    expect(attachments).toBeUndefined();
    expect(compactAttachments).toBeUndefined();
  });

  it("builds in-memory attachments with the correct shape", () => {
    const { attachments } = buildChatAttachments([img]);
    expect(attachments).toHaveLength(1);
    expect(attachments?.[0]).toMatchObject({
      id: "img-0",
      url: "attachment:img-0",
      title: "photo.png",
      source: "client_chat",
      _data: "abc123",
      _mimeType: "image/png",
    });
  });

  it("strips _data and _mimeType from compactAttachments", () => {
    const { compactAttachments } = buildChatAttachments([img]);
    expect(compactAttachments).toHaveLength(1);
    expect(compactAttachments?.[0]).not.toHaveProperty("_data");
    expect(compactAttachments?.[0]).not.toHaveProperty("_mimeType");
    expect(compactAttachments?.[0]).toMatchObject({
      id: "img-0",
      url: "attachment:img-0",
      title: "photo.png",
    });
  });

  it("assigns sequential ids for multiple images", () => {
    const { attachments } = buildChatAttachments([img, img]);
    expect(attachments?.[0]?.id).toBe("img-0");
    expect(attachments?.[1]?.id).toBe("img-1");
    expect(attachments?.[0]?.url).toBe("attachment:img-0");
    expect(attachments?.[1]?.url).toBe("attachment:img-1");
  });

  it("produces matching lengths for attachments and compactAttachments", () => {
    const { attachments, compactAttachments } = buildChatAttachments([
      img,
      img,
      img,
    ]);
    expect(attachments).toHaveLength(3);
    expect(compactAttachments).toHaveLength(3);
  });
});

describe("countChatAttachmentsMissingPayload", () => {
  it("returns 0 for non-array inputs", () => {
    expect(countChatAttachmentsMissingPayload(undefined)).toBe(0);
    expect(countChatAttachmentsMissingPayload(null)).toBe(0);
    expect(countChatAttachmentsMissingPayload({})).toBe(0);
  });

  it("counts attachments missing _data or _mimeType", () => {
    const count = countChatAttachmentsMissingPayload([
      { _data: "abc", _mimeType: "image/png" },
      { _data: "abc" },
      { _mimeType: "image/png" },
      {},
    ]);

    expect(count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// buildUserMessages
// ---------------------------------------------------------------------------

describe("buildUserMessages", () => {
  const TEST_USER_ID = "00000000-0000-0000-0000-000000000001" as UUID;
  const TEST_ROOM_ID = "00000000-0000-0000-0000-000000000002" as UUID;
  const img = { data: "abc123", mimeType: "image/png", name: "photo.png" };

  const baseParams = {
    prompt: "hello world",
    userId: TEST_USER_ID,
    roomId: TEST_ROOM_ID,
    channelType: ChannelType.DM,
  };

  it("userMessage.content.attachments carries _data when images provided", () => {
    const { userMessage } = buildUserMessages({ ...baseParams, images: [img] });
    const atts = userMessage.content.attachments as Array<
      Record<string, unknown>
    >;
    expect(atts).toHaveLength(1);
    expect(atts[0]._data).toBe("abc123");
    expect(atts[0]._mimeType).toBe("image/png");
  });

  it("messageToStore.content.attachments strips _data and _mimeType", () => {
    const { messageToStore } = buildUserMessages({
      ...baseParams,
      images: [img],
    });
    const atts = messageToStore.content.attachments as Array<
      Record<string, unknown>
    >;
    expect(atts).toHaveLength(1);
    expect(atts[0]).not.toHaveProperty("_data");
    expect(atts[0]).not.toHaveProperty("_mimeType");
  });

  it("userMessage and messageToStore share the same id", () => {
    const { userMessage, messageToStore } = buildUserMessages({
      ...baseParams,
      images: [img],
    });
    expect(userMessage.id).toBe(messageToStore.id);
  });

  it("messageToStore is the same reference as userMessage when no images", () => {
    const { userMessage, messageToStore } = buildUserMessages({
      ...baseParams,
      images: undefined,
    });
    expect(messageToStore).toBe(userMessage);
  });

  it("sets prompt text on userMessage", () => {
    const { userMessage } = buildUserMessages({
      ...baseParams,
      images: undefined,
    });
    expect(userMessage.content.text).toBe("hello world");
  });

  it("sets prompt text on messageToStore when images provided", () => {
    const { messageToStore } = buildUserMessages({
      ...baseParams,
      images: [img],
    });
    expect(messageToStore.content.text).toBe("hello world");
  });

  it("compactAttachments retain url and title but drop raw data", () => {
    const { messageToStore } = buildUserMessages({
      ...baseParams,
      images: [img],
    });
    const att = (
      messageToStore.content.attachments as Array<Record<string, unknown>>
    )[0];
    expect(att.url).toBe("attachment:img-0");
    expect(att.title).toBe("photo.png");
    expect(att).not.toHaveProperty("_data");
  });
});
