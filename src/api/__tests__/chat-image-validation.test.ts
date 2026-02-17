import { describe, expect, it } from "vitest";
import { validateChatImages } from "../server";

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
      expect(validateChatImages({ data: "x", mimeType: "image/png", name: "x.png" })).toBeNull();
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
      expect(validateChatImages([{ ...valid, mimeType: "image/jpeg" }])).toBeNull();
    });

    it("accepts image/gif", () => {
      expect(validateChatImages([{ ...valid, mimeType: "image/gif" }])).toBeNull();
    });

    it("accepts image/webp", () => {
      expect(validateChatImages([{ ...valid, mimeType: "image/webp" }])).toBeNull();
    });

    it("accepts image/png", () => {
      expect(validateChatImages([{ ...valid, mimeType: "image/png" }])).toBeNull();
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
        validateChatImages([{ data: "", mimeType: "image/png", name: "x.png" }]),
      ).toMatch(/data/);
    });

    it("rejects data URL prefix (data:image/...;base64,...)", () => {
      expect(
        validateChatImages([
          { data: "data:image/png;base64,abc", mimeType: "image/png", name: "x.png" },
        ]),
      ).toMatch(/raw base64/);
    });

    it("rejects non-string data", () => {
      expect(
        validateChatImages([{ data: 123, mimeType: "image/png", name: "x.png" }]),
      ).toMatch(/data/);
    });
  });

  describe("mimeType field", () => {
    it("rejects missing mimeType", () => {
      expect(validateChatImages([{ data: "abc", name: "x.png" }])).toMatch(/mimeType/);
    });

    it("rejects empty mimeType", () => {
      expect(validateChatImages([{ data: "abc", mimeType: "", name: "x.png" }])).toMatch(
        /mimeType/,
      );
    });

    it("rejects text/plain", () => {
      expect(
        validateChatImages([{ data: "abc", mimeType: "text/plain", name: "x.txt" }]),
      ).toMatch(/Unsupported image type/);
    });

    it("rejects image/svg+xml", () => {
      expect(
        validateChatImages([{ data: "abc", mimeType: "image/svg+xml", name: "x.svg" }]),
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
      expect(validateChatImages([{ data: "abc", mimeType: "image/png" }])).toMatch(/name/);
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
  });
});
