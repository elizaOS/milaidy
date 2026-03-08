import { describe, expect, it } from "vitest";
import { parseActionBlock } from "./parse-action-block";

describe("parseActionBlock", () => {
  it("returns null for empty/falsy input", () => {
    expect(parseActionBlock("")).toBeNull();
    expect(parseActionBlock(null as unknown as string)).toBeNull();
    expect(parseActionBlock(undefined as unknown as string)).toBeNull();
  });

  it("parses fenced ```json block with respond action + text response", () => {
    const input = `Here is my decision:

\`\`\`json
{
  "action": "respond",
  "response": "Yes, continue with the refactor.",
  "reasoning": "The agent is asking for confirmation to proceed."
}
\`\`\``;

    const result = parseActionBlock(input);
    expect(result).toEqual({
      action: "respond",
      response: "Yes, continue with the refactor.",
      reasoning: "The agent is asking for confirmation to proceed.",
    });
  });

  it("parses fenced ```json block with respond action + useKeys/keys", () => {
    const input = `The agent is showing a TUI menu. I need to press enter.

\`\`\`json
{
  "action": "respond",
  "useKeys": true,
  "keys": ["down", "enter"],
  "reasoning": "Selecting the second option from the TUI menu."
}
\`\`\``;

    const result = parseActionBlock(input);
    expect(result).toEqual({
      action: "respond",
      useKeys: true,
      keys: ["down", "enter"],
      reasoning: "Selecting the second option from the TUI menu.",
    });
  });

  it("parses bare JSON with escalate action", () => {
    const input = `{"action": "escalate", "reasoning": "The agent encountered an error I cannot resolve."}`;

    const result = parseActionBlock(input);
    expect(result).toEqual({
      action: "escalate",
      reasoning: "The agent encountered an error I cannot resolve.",
    });
  });

  it("parses bare JSON with nested objects", () => {
    const input = `Before acting, the coordinator emitted {"action":"escalate","reasoning":"The task failed validation.","context":{"detail":"missing field","retryable":false}} after inspecting the result.`;

    const result = parseActionBlock(input);
    expect(result).toEqual({
      action: "escalate",
      reasoning: "The task failed validation.",
    });
  });

  it('parses "ignore" action', () => {
    const input = `\`\`\`json
{"action": "ignore", "reasoning": "The agent is still working, no intervention needed."}
\`\`\``;

    const result = parseActionBlock(input);
    expect(result).toEqual({
      action: "ignore",
      reasoning: "The agent is still working, no intervention needed.",
    });
  });

  it('parses "complete" action', () => {
    const input = `\`\`\`json
{"action": "complete", "reasoning": "The task has been finished successfully."}
\`\`\``;

    const result = parseActionBlock(input);
    expect(result).toEqual({
      action: "complete",
      reasoning: "The task has been finished successfully.",
    });
  });

  it("returns null for invalid action type", () => {
    const input = `\`\`\`json
{"action": "destroy", "reasoning": "not a real action"}
\`\`\``;

    expect(parseActionBlock(input)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const input = `\`\`\`json
{"action": "respond", "response": broken json here
\`\`\``;

    expect(parseActionBlock(input)).toBeNull();
  });

  it("extracts JSON from surrounding natural language text", () => {
    const input = `I think the best course of action is to let the agent know to proceed.

{"action": "respond", "response": "Go ahead.", "reasoning": "Agent asked for permission."}

That should resolve the blocking prompt.`;

    const result = parseActionBlock(input);
    expect(result).toEqual({
      action: "respond",
      response: "Go ahead.",
      reasoning: "Agent asked for permission.",
    });
  });

  it("includes reasoning field when present", () => {
    const input = `\`\`\`json
{"action": "ignore", "reasoning": "The output is just a progress indicator."}
\`\`\``;

    const result = parseActionBlock(input);
    expect(result).not.toBeNull();
    expect(result?.reasoning).toBe("The output is just a progress indicator.");
  });

  it("defaults reasoning to empty string when missing", () => {
    const input = `\`\`\`json
{"action": "escalate"}
\`\`\``;

    const result = parseActionBlock(input);
    expect(result).toEqual({
      action: "escalate",
      reasoning: "",
    });
  });

  it("returns null for respond action missing both response and keys", () => {
    const input = `\`\`\`json
{"action": "respond", "reasoning": "No response content provided."}
\`\`\``;

    expect(parseActionBlock(input)).toBeNull();
  });

  it("coerces non-string keys to strings", () => {
    const input = `\`\`\`json
{"action": "respond", "useKeys": true, "keys": [1, 2, 3], "reasoning": "numeric keys"}
\`\`\``;

    const result = parseActionBlock(input);
    expect(result).not.toBeNull();
    expect(result?.keys).toEqual(["1", "2", "3"]);
  });

  it("returns null for text with no JSON at all", () => {
    expect(
      parseActionBlock("Just some plain text with no JSON blocks."),
    ).toBeNull();
  });

  it("does not greedily match across multiple JSON-like blocks", () => {
    const input = `Some text {"not": "an action"} and then {"action": "ignore", "reasoning": "test"} done.`;

    const result = parseActionBlock(input);
    expect(result).toEqual({
      action: "ignore",
      reasoning: "test",
    });
  });
});
