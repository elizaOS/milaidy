import { describe, expect, it } from "vitest";
import { normalizeCharacterMessageExamples } from "./character-message-examples";

describe("normalizeCharacterMessageExamples", () => {
  it("normalizes legacy array-of-array examples into grouped examples", () => {
    expect(
      normalizeCharacterMessageExamples(
        [
          [
            { user: "{{user1}}", content: { text: "hello" } },
            { user: "{{agentName}}", content: { text: "hi" } },
          ],
        ],
        "Sakuya",
      ),
    ).toEqual([
      {
        examples: [
          { name: "{{user1}}", content: { text: "hello" } },
          { name: "Sakuya", content: { text: "hi" } },
        ],
      },
    ]);
  });

  it("normalizes generated JSON strings in the saved schema", () => {
    expect(
      normalizeCharacterMessageExamples(
        JSON.stringify({
          messageExamples: [
            {
              examples: [
                { name: "user", content: { text: "status?" } },
                { name: "assistant", content: { text: "on track" } },
              ],
            },
          ],
        }),
        "Milady",
      ),
    ).toEqual([
      {
        examples: [
          { name: "{{user1}}", content: { text: "status?" } },
          { name: "Milady", content: { text: "on track" } },
        ],
      },
    ]);
  });

  it("preserves action arrays while normalizing names", () => {
    expect(
      normalizeCharacterMessageExamples(
        [
          {
            examples: [
              {
                name: "assistant",
                content: { text: "done", actions: ["complete", "notify"] },
              },
            ],
          },
        ],
        "Reimu",
      ),
    ).toEqual([
      {
        examples: [
          {
            name: "Reimu",
            content: { text: "done", actions: ["complete", "notify"] },
          },
        ],
      },
    ]);
  });
});
