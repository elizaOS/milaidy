import type { GenerateTextParams, IAgentRuntime, Plugin } from "@elizaos/core";
import { ModelType } from "@elizaos/core";
import { describe, expect, it } from "vitest";

// mock-plugin.ts is gitignored (local-only benchmarking helper).
// Skip the suite when the file is absent.
let mockPlugin: Plugin | undefined;
try {
  const mod = await import("./mock-plugin");
  mockPlugin = mod.mockPlugin;
} catch {
  // file does not exist in CI — tests will be skipped below
}

function getPromptResult(prompt: string): Promise<string> {
  const model = mockPlugin?.models?.[ModelType.TEXT_LARGE];
  if (!model) {
    throw new Error("mock TEXT_LARGE model handler is missing");
  }
  return model(
    {} as IAgentRuntime,
    { prompt } as GenerateTextParams,
  ) as Promise<string>;
}

describe.skipIf(!mockPlugin)("benchmark mock plugin", () => {
  it("returns canonical single-shot XML with required fields", async () => {
    const xml = await getPromptResult(
      [
        "initial code: 11111111-1111-1111-1111-111111111111",
        "<task>Generate dialog and actions for the character TestAgent.</task>",
        "middle code: 22222222-2222-2222-2222-222222222222",
        "end code: 33333333-3333-3333-3333-333333333333",
      ].join("\n"),
    );

    expect(xml).toContain("<response>");
    expect(xml).toContain("<thought>");
    expect(xml).toContain("<actions>BENCHMARK_ACTION</actions>");
    expect(xml).toContain("<text>Executed CLICK(10,10)</text>");
    expect(xml).toContain(
      "<one_initial_code>11111111-1111-1111-1111-111111111111</one_initial_code>",
    );
    expect(xml).toContain(
      "<one_middle_code>22222222-2222-2222-2222-222222222222</one_middle_code>",
    );
    expect(xml).toContain(
      "<one_end_code>33333333-3333-3333-3333-333333333333</one_end_code>",
    );
  });

  it("returns RESPOND for shouldRespond prompts", async () => {
    const xml = await getPromptResult(
      [
        "<task>Decide on behalf of TestAgent whether they should respond.</task>",
        "<action>RESPOND | IGNORE | STOP</action>",
      ].join("\n"),
    );

    expect(xml).toContain("<action>RESPOND</action>");
  });

  it("returns finish signal for multi-step decision prompts", async () => {
    const xml = await getPromptResult(
      [
        "<task>Determine the next step the assistant should take in this conversation.</task>",
        "<isFinish>true | false</isFinish>",
      ].join("\n"),
    );

    expect(xml).toContain("<isFinish>true</isFinish>");
  });
});
