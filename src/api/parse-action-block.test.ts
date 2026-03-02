import { describe, expect, it } from "vitest";

// ── Type definition (from @elizaos/plugin-agent-orchestrator) ───────────
interface CoordinationLLMResponse {
  action: "respond" | "escalate" | "ignore" | "complete";
  response?: string;
  useKeys?: boolean;
  keys?: string[];
  reasoning: string;
}

// Copied from server.ts for unit testing
function parseActionBlock(text: string): CoordinationLLMResponse | null {
  if (!text) return null;
  // Try fenced ```json block first, then bare JSON with "action" key
  const fenced = text.match(/```(?:json)?\s*\n?(\{[\s\S]*?\})\s*\n?```/);
  const jsonStr = fenced?.[1] ?? text.match(/\{[\s\S]*"action"[\s\S]*\}/)?.[0];
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (!["respond", "escalate", "ignore", "complete"].includes(parsed.action))
      return null;
    const result: CoordinationLLMResponse = {
      action: parsed.action,
      reasoning: parsed.reasoning || "",
    };
    if (parsed.action === "respond") {
      if (parsed.useKeys && Array.isArray(parsed.keys)) {
        result.useKeys = true;
        result.keys = parsed.keys.map(String);
      } else if (typeof parsed.response === "string") {
        result.response = parsed.response;
      } else return null;
    }
    return result;
  } catch {
    return null;
  }
}

// ── Tests ───────────────────────────────────────────────────────────────

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
});
