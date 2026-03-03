/**
 * Unit tests for the CharacterSchema Zod validation.
 *
 * Verifies that the character section of MiladyConfig is properly
 * validated: correct shapes pass, invalid shapes are rejected,
 * and edge cases are handled.
 */
import { describe, expect, it } from "vitest";
import { CharacterSchema } from "./zod-schema";

describe("CharacterSchema", () => {
  it("accepts undefined (character is optional)", () => {
    const result = CharacterSchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  it("accepts an empty object", () => {
    const result = CharacterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a valid minimal character", () => {
    const result = CharacterSchema.safeParse({
      name: "Luna",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a fully populated character", () => {
    const result = CharacterSchema.safeParse({
      name: "FullAgent",
      username: "full_agent",
      bio: "A test agent.",
      system: "You are a test agent.",
      adjectives: ["curious", "witty"],
      topics: ["AI", "testing"],
      style: {
        all: ["Be concise."],
        chat: ["Be casual."],
        post: ["Be punchy."],
      },
      messageExamples: [
        {
          examples: [
            { name: "User", content: { text: "Hello" } },
            { name: "Agent", content: { text: "Hi!", actions: ["greet"] } },
          ],
        },
      ],
      postExamples: ["Test post."],
    });
    expect(result.success).toBe(true);
  });

  it("accepts bio as a string array", () => {
    const result = CharacterSchema.safeParse({
      bio: ["Point one.", "Point two."],
    });
    expect(result.success).toBe(true);
  });

  it("accepts bio as a single string", () => {
    const result = CharacterSchema.safeParse({
      bio: "A single bio string.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects name that is empty string", () => {
    const result = CharacterSchema.safeParse({
      name: "",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.includes("name"))).toBe(
      true,
    );
  });

  it("rejects name longer than 100 characters", () => {
    const result = CharacterSchema.safeParse({
      name: "A".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects username longer than 50 characters", () => {
    const result = CharacterSchema.safeParse({
      username: "U".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects system prompt longer than 10000 characters", () => {
    const result = CharacterSchema.safeParse({
      system: "X".repeat(10001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects adjective that is empty string", () => {
    const result = CharacterSchema.safeParse({
      adjectives: ["valid", ""],
    });
    expect(result.success).toBe(false);
  });

  it("rejects adjective longer than 100 characters", () => {
    const result = CharacterSchema.safeParse({
      adjectives: ["A".repeat(101)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects topic that is empty string", () => {
    const result = CharacterSchema.safeParse({
      topics: ["valid", ""],
    });
    expect(result.success).toBe(false);
  });

  it("rejects topic longer than 200 characters", () => {
    const result = CharacterSchema.safeParse({
      topics: ["T".repeat(201)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields in style (strict mode)", () => {
    const result = CharacterSchema.safeParse({
      style: {
        all: ["ok"],
        unknown_field: ["not allowed"],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields at top level (strict mode)", () => {
    const result = CharacterSchema.safeParse({
      name: "Test",
      unknownField: "not allowed",
    });
    expect(result.success).toBe(false);
  });

  it("rejects messageExamples with empty examples array", () => {
    const result = CharacterSchema.safeParse({
      messageExamples: [{ examples: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects messageExample with empty name", () => {
    const result = CharacterSchema.safeParse({
      messageExamples: [
        {
          examples: [{ name: "", content: { text: "hello" } }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects messageExample with empty content text", () => {
    const result = CharacterSchema.safeParse({
      messageExamples: [
        {
          examples: [{ name: "User", content: { text: "" } }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string types for name", () => {
    const result = CharacterSchema.safeParse({
      name: 42,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-array types for adjectives", () => {
    const result = CharacterSchema.safeParse({
      adjectives: "not-an-array",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-array types for topics", () => {
    const result = CharacterSchema.safeParse({
      topics: "not-an-array",
    });
    expect(result.success).toBe(false);
  });

  it("accepts style with only partial fields", () => {
    const result = CharacterSchema.safeParse({
      style: {
        chat: ["Be friendly."],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts message examples with actions", () => {
    const result = CharacterSchema.safeParse({
      messageExamples: [
        {
          examples: [
            {
              name: "Agent",
              content: { text: "Done!", actions: ["complete", "notify"] },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
