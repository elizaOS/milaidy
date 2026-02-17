import { describe, expect, it } from "vitest";
import {
  extractAnthropicSystemAndLastUser,
  extractCompatTextContent,
  extractOpenAiSystemAndLastUser,
  resolveCompatRoomKey,
} from "./compat-utils";

describe("extractCompatTextContent", () => {
  it("returns string content directly", () => {
    expect(extractCompatTextContent("hello")).toBe("hello");
  });

  it("extracts concatenated text parts", () => {
    expect(
      extractCompatTextContent([
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ]),
    ).toBe("ab");
  });

  it("ignores non-text parts", () => {
    expect(
      extractCompatTextContent([
        { type: "image_url", image_url: { url: "https://example.com/x.png" } },
        { type: "text", text: "ok" },
      ]),
    ).toBe("ok");
  });

  it("extracts object .text string", () => {
    expect(extractCompatTextContent({ text: "hello" })).toBe("hello");
  });
});

describe("extractOpenAiSystemAndLastUser", () => {
  it("returns null when messages is not an array", () => {
    expect(extractOpenAiSystemAndLastUser({})).toBeNull();
  });

  it("returns null when there is no user message", () => {
    expect(
      extractOpenAiSystemAndLastUser([{ role: "system", content: "x" }]),
    ).toBeNull();
  });

  it("extracts joined system and last user", () => {
    expect(
      extractOpenAiSystemAndLastUser([
        { role: "system", content: "s1" },
        { role: "developer", content: "s2" },
        { role: "user", content: "u1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "u2" },
      ]),
    ).toEqual({ system: "s1\n\ns2", user: "u2" });
  });
});

describe("extractAnthropicSystemAndLastUser", () => {
  it("returns null when messages is not an array", () => {
    expect(
      extractAnthropicSystemAndLastUser({ system: "x", messages: {} }),
    ).toBeNull();
  });

  it("returns null when no user message exists", () => {
    expect(
      extractAnthropicSystemAndLastUser({
        system: "x",
        messages: [{ role: "assistant", content: "a" }],
      }),
    ).toBeNull();
  });

  it("extracts system and last user", () => {
    expect(
      extractAnthropicSystemAndLastUser({
        system: "sys",
        messages: [
          { role: "user", content: "u1" },
          { role: "assistant", content: "a1" },
          { role: "user", content: "u2" },
        ],
      }),
    ).toEqual({ system: "sys", user: "u2" });
  });
});

describe("resolveCompatRoomKey", () => {
  it("prefers OpenAI user field", () => {
    expect(resolveCompatRoomKey({ user: "alice" })).toBe("alice");
  });

  it("uses metadata conversation_id", () => {
    expect(resolveCompatRoomKey({ metadata: { conversation_id: "c1" } })).toBe(
      "c1",
    );
  });

  it("uses metadata user_id", () => {
    expect(resolveCompatRoomKey({ metadata: { user_id: "u1" } })).toBe("u1");
  });

  it("falls back when nothing is provided", () => {
    expect(resolveCompatRoomKey({})).toBe("default");
    expect(resolveCompatRoomKey({}, "x")).toBe("x");
  });
});
