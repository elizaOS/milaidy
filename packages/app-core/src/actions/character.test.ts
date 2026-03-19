import { describe, expect, it } from "vitest";

import type { CharacterData } from "../api/client";
import {
  normalizeGeneratedMessageExamples,
  prepareDraftForSave,
} from "./character";

describe("prepareDraftForSave", () => {
  it("builds a strict payload and preserves message actions", () => {
    const draft = {
      name: "Sakuya",
      username: "sakuya-clockwork",
      system: "Act composed.",
      bio: " first line \n\n second line ",
      adjectives: ["precise", "", "calm"],
      topics: ["time", "", "duty"],
      postExamples: ["Mission report", ""],
      style: {
        all: ["Be exact"],
        chat: [],
        post: ["Stay brief"],
      },
      messageExamples: [
        {
          examples: [
            {
              name: "{{user1}}",
              content: {
                text: "status?",
                legacy: "remove",
              },
            },
            {
              name: "Sakuya",
              content: {
                text: "On track.",
                actions: ["REPORT_STATUS"],
                debug: true,
              },
            },
            {
              name: "",
              content: { text: "skip me" },
            },
            {
              name: "Sakuya",
              content: { text: "   " },
            },
          ],
        },
        { examples: [] },
      ],
      extraField: "drop me",
    } as unknown as CharacterData;

    expect(prepareDraftForSave(draft)).toEqual({
      name: "Sakuya",
      username: "sakuya-clockwork",
      system: "Act composed.",
      bio: ["first line", "second line"],
      adjectives: ["precise", "calm"],
      topics: ["time", "duty"],
      postExamples: ["Mission report"],
      style: {
        all: ["Be exact"],
        post: ["Stay brief"],
      },
      messageExamples: [
        {
          examples: [
            {
              name: "{{user1}}",
              content: { text: "status?" },
            },
            {
              name: "Sakuya",
              content: {
                text: "On track.",
                actions: ["REPORT_STATUS"],
              },
            },
          ],
        },
      ],
    });
  });

  it("omits empty collections and invalid message examples", () => {
    const draft = {
      bio: " \n ",
      adjectives: ["", " "],
      postExamples: [" "],
      style: {
        all: [],
        chat: [],
        post: [],
      },
      messageExamples: [
        {
          examples: [
            { name: "", content: { text: "missing speaker" } },
            { name: "User", content: { text: "   " } },
          ],
        },
      ],
    } as CharacterData;

    expect(prepareDraftForSave(draft)).toEqual({});
  });

  it("preserves array bios and populated style groups", () => {
    const draft: CharacterData = {
      name: "Reimu",
      bio: ["Line one", "Line two"],
      style: {
        chat: ["Stay direct"],
      },
    };

    expect(prepareDraftForSave(draft)).toEqual({
      name: "Reimu",
      username: "Reimu",
      bio: ["Line one", "Line two"],
      style: {
        chat: ["Stay direct"],
      },
    });
  });

  it("falls back username to name when no username is provided", () => {
    const draft: CharacterData = {
      name: "Marisa",
      username: "   ",
    };

    expect(prepareDraftForSave(draft)).toEqual({
      name: "Marisa",
      username: "Marisa",
    });
  });

  it("normalizes fenced chat example JSON into message example groups", () => {
    const generated = `\`\`\`json
[
  [
    { "user": "{{user1}}", "content": { "text": "hello there" } },
    { "role": "assistant", "content": { "text": "I am ready." } }
  ]
]
\`\`\``;

    expect(normalizeGeneratedMessageExamples(generated, "Milady")).toEqual([
      {
        examples: [
          { name: "{{user1}}", content: { text: "hello there" } },
          { name: "Milady", content: { text: "I am ready." } },
        ],
      },
    ]);
  });

  it("normalizes object-shaped messageExamples payloads", () => {
    const generated = {
      messageExamples: [
        {
          examples: [
            { name: "User", content: { text: "status?" } },
            { name: "{{agentName}}", content: { text: "On track." } },
          ],
        },
      ],
    };

    expect(normalizeGeneratedMessageExamples(generated, "Sakuya")).toEqual([
      {
        examples: [
          { name: "{{user1}}", content: { text: "status?" } },
          { name: "Sakuya", content: { text: "On track." } },
        ],
      },
    ]);
  });
});
