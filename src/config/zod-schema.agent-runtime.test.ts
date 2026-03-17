import { describe, expect, it } from "vitest";
import { AgentEntrySchema } from "./zod-schema.agent-runtime";

describe("AgentEntrySchema", () => {
  it("accepts persisted character metadata fields", () => {
    const result = AgentEntrySchema.safeParse({
      id: "main",
      default: true,
      name: "Sakuya",
      username: "sakuya-clockwork",
      bio: ["precise", "calm"],
      system: "Keep everything orderly.",
      adjectives: ["precise", "calm"],
      topics: ["time", "duty"],
      style: {
        all: ["Be exact"],
        chat: ["Stay calm"],
        post: ["Be clear"],
      },
      postExamples: ["Mission remains on schedule."],
      postExamples_zhCN: ["任务仍按计划进行。"],
      messageExamples: [
        {
          examples: [
            { name: "{{user1}}", content: { text: "status?" } },
            {
              name: "Sakuya",
              content: { text: "On track.", actions: ["REPORT_STATUS"] },
            },
          ],
        },
        [
          { user: "{{user1}}", content: { text: "hello" } },
          { user: "Sakuya", content: { text: "acknowledged" } },
        ],
      ],
    });

    expect(result.success).toBe(true);
  });
});
