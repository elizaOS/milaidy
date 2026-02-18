import { ChannelType } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  buildChatAttachments,
  buildUserMessages,
  normalizeChatImages,
  validateChatImages,
} from "../server";

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

    it("rejects invalid base64 content", () => {
      expect(
        validateChatImages([
          { data: "abc!123", mimeType: "image/png", name: "x.png" },
        ]),
      ).toMatch(/valid base64/i);
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

    it("rejects names longer than 255 chars", () => {
      const longName = `${"a".repeat(256)}.png`;
      expect(
        validateChatImages([
          { data: "aGVsbG8=", mimeType: "image/png", name: longName },
        ]),
      ).toMatch(/too long/i);
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
    const firstAttachment = attachments?.[0];
    expect(firstAttachment).toBeDefined();
    expect(firstAttachment).toMatchObject({
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
    const firstCompactAttachment = compactAttachments?.[0];
    expect(firstCompactAttachment).toBeDefined();
    expect(firstCompactAttachment).not.toHaveProperty("_data");
    expect(firstCompactAttachment).not.toHaveProperty("_mimeType");
    expect(firstCompactAttachment).toMatchObject({
      id: "img-0",
      url: "attachment:img-0",
      title: "photo.png",
    });
  });

  it("assigns sequential ids for multiple images", () => {
    const { attachments } = buildChatAttachments([img, img]);
    expect(attachments).toHaveLength(2);
    const firstAttachment = attachments?.[0];
    const secondAttachment = attachments?.[1];
    expect(firstAttachment?.id).toBe("img-0");
    expect(secondAttachment?.id).toBe("img-1");
    expect(firstAttachment?.url).toBe("attachment:img-0");
    expect(secondAttachment?.url).toBe("attachment:img-1");
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

describe("normalizeChatImages", () => {
  it("normalizes image mime types to lowercase", () => {
    const images = normalizeChatImages([
      { data: "aGVsbG8=", mimeType: "Image/PNG", name: "x.png" },
    ]);
    expect(images).toHaveLength(1);
    expect(images?.[0]?.mimeType).toBe("image/png");
  });
});

describe("buildUserMessages", () => {
  const userId = "00000000-0000-0000-0000-000000000001";
  const roomId = "00000000-0000-0000-0000-000000000002";

  it("keeps _data on in-memory message but strips it from persisted message", () => {
    const { userMessage, messageToStore } = buildUserMessages({
      images: [{ data: "aGVsbG8=", mimeType: "image/png", name: "photo.png" }],
      prompt: "upload this",
      userId: userId as never,
      roomId: roomId as never,
      channelType: ChannelType.DM,
    });

    expect(userMessage.content.attachments).toHaveLength(1);
    expect(userMessage.content.attachments?.[0]).toHaveProperty(
      "_data",
      "aGVsbG8=",
    );
    expect(userMessage.content.attachments?.[0]).toHaveProperty(
      "_mimeType",
      "image/png",
    );

    expect(messageToStore.content.attachments).toHaveLength(1);
    expect(messageToStore.content.attachments?.[0]).not.toHaveProperty("_data");
    expect(messageToStore.content.attachments?.[0]).not.toHaveProperty(
      "_mimeType",
    );
  });
});
