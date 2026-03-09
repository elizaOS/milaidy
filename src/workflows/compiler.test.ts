import { describe, expect, it } from "vitest";
import {
  compileWorkflow,
  evaluateExpression,
  interpolate,
  parseDuration,
  WorkflowCompilationError,
} from "./compiler";
import type { WorkflowContext, WorkflowDef } from "./types";

function makeCtx(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    trigger: {},
    results: {},
    _last: null,
    runId: "test-run",
    workflowId: "test-wf",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// interpolate
// ---------------------------------------------------------------------------

describe("interpolate", () => {
  it("replaces {{_last}} with last value", () => {
    const ctx = makeCtx({ _last: "hello" });
    expect(interpolate("say: {{_last}}", ctx)).toBe("say: hello");
  });

  it("replaces {{trigger.field}}", () => {
    const ctx = makeCtx({ trigger: { name: "Alice" } });
    expect(interpolate("hi {{trigger.name}}", ctx)).toBe("hi Alice");
  });

  it("resolves {{nodeId.field}}", () => {
    const ctx = makeCtx({
      results: { step1: { status: 200 } },
    });
    expect(interpolate("status: {{step1.status}}", ctx)).toBe("status: 200");
  });

  it("handles missing values gracefully", () => {
    const ctx = makeCtx();
    expect(interpolate("{{missing.field}}", ctx)).toBe("");
  });

  it("serializes objects", () => {
    const ctx = makeCtx({ _last: { a: 1 } });
    expect(interpolate("{{_last}}", ctx)).toBe('{"a":1}');
  });

  it("handles multiple placeholders in one string", () => {
    const ctx = makeCtx({
      trigger: { firstName: "John", lastName: "Doe" },
    });
    expect(interpolate("{{trigger.firstName}} {{trigger.lastName}}", ctx)).toBe(
      "John Doe",
    );
  });

  it("handles deeply nested paths", () => {
    const ctx = makeCtx({
      results: { api: { response: { data: { user: { name: "Bob" } } } } },
    });
    expect(interpolate("{{api.response.data.user.name}}", ctx)).toBe("Bob");
  });

  it("handles _last with nested field access", () => {
    const ctx = makeCtx({ _last: { status: "ok", code: 200 } });
    expect(interpolate("{{_last.status}}", ctx)).toBe("ok");
    expect(interpolate("{{_last.code}}", ctx)).toBe("200");
  });

  it("returns original text with no placeholders", () => {
    const ctx = makeCtx();
    expect(interpolate("no placeholders here", ctx)).toBe(
      "no placeholders here",
    );
  });

  it("handles null _last value", () => {
    const ctx = makeCtx({ _last: null });
    expect(interpolate("{{_last}}", ctx)).toBe("");
  });

  it("handles undefined nested path", () => {
    const ctx = makeCtx({ _last: { a: 1 } });
    expect(interpolate("{{_last.b.c}}", ctx)).toBe("");
  });

  it("handles numeric _last", () => {
    const ctx = makeCtx({ _last: 42 });
    expect(interpolate("result: {{_last}}", ctx)).toBe("result: 42");
  });

  it("handles boolean _last", () => {
    const ctx = makeCtx({ _last: true });
    expect(interpolate("{{_last}}", ctx)).toBe("true");
  });

  it("handles array _last", () => {
    const ctx = makeCtx({ _last: [1, 2, 3] });
    expect(interpolate("{{_last}}", ctx)).toBe("[1,2,3]");
  });

  it("handles results path with explicit results prefix", () => {
    const ctx = makeCtx({
      results: { myNode: { value: "test" } },
    });
    expect(interpolate("{{results.myNode.value}}", ctx)).toBe("test");
  });

  it("handles whitespace in template path", () => {
    const ctx = makeCtx({ _last: "trimmed" });
    expect(interpolate("{{ _last }}", ctx)).toBe("trimmed");
  });

  it("handles empty string _last", () => {
    const ctx = makeCtx({ _last: "" });
    expect(interpolate("val={{_last}}", ctx)).toBe("val=");
  });
});

// ---------------------------------------------------------------------------
// evaluateExpression
// ---------------------------------------------------------------------------

describe("evaluateExpression", () => {
  it("evaluates === comparison", () => {
    const ctx = makeCtx({
      results: { s1: { code: 200 } },
    });
    expect(evaluateExpression("{{s1.code}} === 200", ctx)).toBe(true);
    expect(evaluateExpression("{{s1.code}} === 404", ctx)).toBe(false);
  });

  it("evaluates !== comparison", () => {
    const ctx = makeCtx({ _last: "ok" });
    expect(evaluateExpression("{{_last}} !== error", ctx)).toBe(true);
  });

  it("evaluates > comparison", () => {
    const ctx = makeCtx({ _last: 100 });
    expect(evaluateExpression("{{_last}} > 50", ctx)).toBe(true);
    expect(evaluateExpression("{{_last}} > 200", ctx)).toBe(false);
  });

  it("evaluates < comparison", () => {
    const ctx = makeCtx({ _last: 10 });
    expect(evaluateExpression("{{_last}} < 50", ctx)).toBe(true);
    expect(evaluateExpression("{{_last}} < 5", ctx)).toBe(false);
  });

  it("evaluates >= comparison", () => {
    const ctx = makeCtx({ _last: 100 });
    expect(evaluateExpression("{{_last}} >= 100", ctx)).toBe(true);
    expect(evaluateExpression("{{_last}} >= 50", ctx)).toBe(true);
    expect(evaluateExpression("{{_last}} >= 200", ctx)).toBe(false);
  });

  it("evaluates <= comparison", () => {
    const ctx = makeCtx({ _last: 100 });
    expect(evaluateExpression("{{_last}} <= 100", ctx)).toBe(true);
    expect(evaluateExpression("{{_last}} <= 200", ctx)).toBe(true);
    expect(evaluateExpression("{{_last}} <= 50", ctx)).toBe(false);
  });

  it("evaluates string === comparison with quotes", () => {
    const ctx = makeCtx({ _last: "hello" });
    expect(evaluateExpression('{{_last}} === "hello"', ctx)).toBe(true);
    expect(evaluateExpression("{{_last}} === 'hello'", ctx)).toBe(true);
    expect(evaluateExpression('{{_last}} === "world"', ctx)).toBe(false);
  });

  it("evaluates !== with matching values", () => {
    const ctx = makeCtx({ _last: "same" });
    expect(evaluateExpression("{{_last}} !== same", ctx)).toBe(false);
  });

  it("evaluates contains", () => {
    const ctx = makeCtx({ _last: "hello world" });
    expect(evaluateExpression('{{_last}} contains "world"', ctx)).toBe(true);
    expect(evaluateExpression('{{_last}} contains "xyz"', ctx)).toBe(false);
  });

  it("evaluates contains with single quotes", () => {
    const ctx = makeCtx({ _last: "error occurred" });
    expect(evaluateExpression("{{_last}} contains 'error'", ctx)).toBe(true);
  });

  it("evaluates truthy check", () => {
    expect(evaluateExpression("{{_last}}", makeCtx({ _last: "yes" }))).toBe(
      true,
    );
    expect(evaluateExpression("{{_last}}", makeCtx({ _last: "" }))).toBe(false);
    expect(evaluateExpression("{{_last}}", makeCtx({ _last: "false" }))).toBe(
      false,
    );
  });

  it("treats 0 as falsy", () => {
    expect(evaluateExpression("{{_last}}", makeCtx({ _last: 0 }))).toBe(false);
  });

  it("treats null as falsy", () => {
    expect(evaluateExpression("{{_last}}", makeCtx({ _last: "null" }))).toBe(
      false,
    );
  });

  it("treats undefined as falsy", () => {
    expect(
      evaluateExpression("{{_last}}", makeCtx({ _last: "undefined" })),
    ).toBe(false);
  });

  it("treats non-empty string as truthy", () => {
    expect(
      evaluateExpression("{{_last}}", makeCtx({ _last: "anything" })),
    ).toBe(true);
  });

  it("compares two numeric values correctly", () => {
    const ctx = makeCtx({
      results: { a: { count: 5 }, b: { count: 10 } },
    });
    expect(evaluateExpression("{{a.count}} < {{b.count}}", ctx)).toBe(true);
  });

  it("ignores operator-like content inside interpolated values", () => {
    const ctx = makeCtx({ _last: "x === x" });

    expect(evaluateExpression('{{_last}} === "x === x"', ctx)).toBe(true);
  });

  it("rejects malformed expression grammar", () => {
    const ctx = makeCtx({ _last: "safe" });

    expect(evaluateExpression("{{_last}} ===", ctx)).toBe(false);
    expect(evaluateExpression("{{_last}} && true", ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseDuration
// ---------------------------------------------------------------------------

describe("parseDuration", () => {
  it("parses seconds", () => {
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("5 seconds")).toBe(5_000);
  });

  it("parses single second", () => {
    expect(parseDuration("1 second")).toBe(1_000);
  });

  it("parses minutes", () => {
    expect(parseDuration("5m")).toBe(300_000);
    expect(parseDuration("10 minutes")).toBe(600_000);
  });

  it("parses single minute", () => {
    expect(parseDuration("1 minute")).toBe(60_000);
    expect(parseDuration("1 min")).toBe(60_000);
  });

  it("parses hours", () => {
    expect(parseDuration("2h")).toBe(7_200_000);
    expect(parseDuration("1 hour")).toBe(3_600_000);
    expect(parseDuration("3 hours")).toBe(10_800_000);
  });

  it("parses days", () => {
    expect(parseDuration("1d")).toBe(86_400_000);
    expect(parseDuration("7 days")).toBe(604_800_000);
    expect(parseDuration("1 day")).toBe(86_400_000);
  });

  it("parses weeks", () => {
    expect(parseDuration("1w")).toBe(604_800_000);
    expect(parseDuration("2 weeks")).toBe(1_209_600_000);
    expect(parseDuration("1 week")).toBe(604_800_000);
  });

  it("parses milliseconds", () => {
    expect(parseDuration("500ms")).toBe(500);
    expect(parseDuration("100 milliseconds")).toBe(100);
    expect(parseDuration("1 millisecond")).toBe(1);
  });

  it("returns 0 for invalid input", () => {
    expect(parseDuration("abc")).toBe(0);
    expect(parseDuration("")).toBe(0);
  });

  it("returns 0 for negative or missing number", () => {
    expect(parseDuration("s")).toBe(0);
    expect(parseDuration("minutes")).toBe(0);
  });

  it("handles whitespace-only input", () => {
    expect(parseDuration("   ")).toBe(0);
  });

  it("handles leading/trailing whitespace", () => {
    expect(parseDuration("  5m  ")).toBe(300_000);
  });

  it("handles zero value", () => {
    expect(parseDuration("0s")).toBe(0);
    expect(parseDuration("0m")).toBe(0);
  });

  it("handles large values", () => {
    expect(parseDuration("1000s")).toBe(1_000_000);
  });
});

// ---------------------------------------------------------------------------
// compileWorkflow
// ---------------------------------------------------------------------------

describe("compileWorkflow", () => {
  function makeDef(overrides: Partial<WorkflowDef> = {}): WorkflowDef {
    return {
      id: "test-wf",
      name: "Test Workflow",
      description: "",
      nodes: [],
      edges: [],
      enabled: true,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  const mockRuntime = {
    actions: [
      {
        name: "TEST_ACTION",
        similes: ["DO_TEST"],
        handler: async () => ({ success: true }),
      },
    ],
    useModel: async () => "mocked response",
  } as never;

  it("throws WorkflowCompilationError on invalid workflow", () => {
    expect(() => compileWorkflow(makeDef(), mockRuntime)).toThrow(
      WorkflowCompilationError,
    );
  });

  it("compiles a simple trigger -> action -> output workflow", () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "a1",
          type: "action",
          label: "Do Action",
          position: { x: 0, y: 100 },
          config: { actionName: "TEST_ACTION" },
        },
        {
          id: "o1",
          type: "output",
          label: "Done",
          position: { x: 0, y: 200 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "t1", target: "a1" },
        { id: "e2", source: "a1", target: "o1" },
      ],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    expect(compiled.workflowId).toBe("test-wf");
    expect(compiled.workflowName).toBe("Test Workflow");
    expect(compiled.stepCount).toBe(2); // action + output (trigger excluded)
    expect(compiled.entrySteps).toHaveLength(2);
    expect(compiled.hasDelays).toBe(false);
    expect(compiled.hasHooks).toBe(false);
    expect(compiled.hasLoops).toBe(false);
  });

  it("sets hasDelays when delay node is present", () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "d1",
          type: "delay",
          label: "Wait",
          position: { x: 0, y: 100 },
          config: { duration: "5s" },
        },
        {
          id: "o1",
          type: "output",
          label: "Done",
          position: { x: 0, y: 200 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "t1", target: "d1" },
        { id: "e2", source: "d1", target: "o1" },
      ],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    expect(compiled.hasDelays).toBe(true);
  });

  it("sets hasHooks when hook node is present", () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "h1",
          type: "hook",
          label: "Await Approval",
          position: { x: 0, y: 100 },
          config: { hookId: "approval-1" },
        },
        {
          id: "o1",
          type: "output",
          label: "Done",
          position: { x: 0, y: 200 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "t1", target: "h1" },
        { id: "e2", source: "h1", target: "o1" },
      ],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    expect(compiled.hasHooks).toBe(true);
  });

  it("sets hasLoops when loop node is present", () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "l1",
          type: "loop",
          label: "Iterate",
          position: { x: 0, y: 100 },
          config: { itemsExpression: "{{trigger.items}}" },
        },
        {
          id: "o1",
          type: "output",
          label: "Done",
          position: { x: 0, y: 200 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "t1", target: "l1" },
        { id: "e2", source: "l1", target: "o1" },
      ],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    expect(compiled.hasLoops).toBe(true);
  });

  it("compiled action step executes and returns result", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "a1",
          type: "action",
          label: "Test",
          position: { x: 0, y: 100 },
          config: { actionName: "TEST_ACTION" },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "a1" }],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    const ctx = makeCtx();
    const result = await compiled.entrySteps[0].execute(ctx);
    expect(result).toEqual({ success: true });
  });

  it("compiled action step throws on unknown action", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "a1",
          type: "action",
          label: "Test",
          position: { x: 0, y: 100 },
          config: { actionName: "NONEXISTENT" },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "a1" }],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    const ctx = makeCtx();
    await expect(compiled.entrySteps[0].execute(ctx)).rejects.toThrow(
      'Action "NONEXISTENT" not found',
    );
  });

  it("compiled action step resolves action by simile", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "a1",
          type: "action",
          label: "Test",
          position: { x: 0, y: 100 },
          config: { actionName: "DO_TEST" },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "a1" }],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    const ctx = makeCtx();
    const result = await compiled.entrySteps[0].execute(ctx);
    expect(result).toEqual({ success: true });
  });

  it("compiled output step returns _last when no outputExpression", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "o1",
          type: "output",
          label: "Done",
          position: { x: 0, y: 100 },
          config: {},
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "o1" }],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    const ctx = makeCtx({ _last: "final-value" });
    const result = await compiled.entrySteps[0].execute(ctx);
    expect(result).toBe("final-value");
  });

  it("compiled output step interpolates outputExpression", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "o1",
          type: "output",
          label: "Done",
          position: { x: 0, y: 100 },
          config: { outputExpression: "Result: {{_last}}" },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "o1" }],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    const ctx = makeCtx({ _last: "42" });
    const result = await compiled.entrySteps[0].execute(ctx);
    expect(result).toBe("Result: 42");
  });

  it("compiled hook step returns hook metadata", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "h1",
          type: "hook",
          label: "Approval",
          position: { x: 0, y: 100 },
          config: { hookId: "hook-123", description: "Wait for approval" },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    const ctx = makeCtx();
    const result = (await compiled.entrySteps[0].execute(ctx)) as Record<
      string,
      unknown
    >;
    expect(result.__hook).toBe(true);
    expect(result.hookId).toBe("hook-123");
    expect(result.description).toBe("Wait for approval");
  });

  it("compiled subworkflow step returns subworkflow metadata", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "sw1",
          type: "subworkflow",
          label: "Sub",
          position: { x: 0, y: 100 },
          config: { workflowId: "sub-wf-id" },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "sw1" }],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    const ctx = makeCtx();
    const result = (await compiled.entrySteps[0].execute(ctx)) as Record<
      string,
      unknown
    >;
    expect(result.__subworkflow).toBe(true);
    expect(result.workflowId).toBe("sub-wf-id");
  });

  it("compiled transform step throws without code runner", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "tr1",
          type: "transform",
          label: "Transform",
          position: { x: 0, y: 100 },
          config: { code: "return params._last" },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "tr1" }],
    });

    // Compile without code runner
    const compiled = compileWorkflow(def, mockRuntime);
    const ctx = makeCtx();
    await expect(compiled.entrySteps[0].execute(ctx)).rejects.toThrow(
      "sandboxed code runner",
    );
  });

  it("compiled transform step calls code runner with context", async () => {
    const mockCodeRunner = async (
      code: string,
      params: Record<string, unknown>,
    ) => {
      return { ran: code, gotParams: Object.keys(params) };
    };

    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "tr1",
          type: "transform",
          label: "Transform",
          position: { x: 0, y: 100 },
          config: { code: "return 42" },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "tr1" }],
    });

    const compiled = compileWorkflow(def, mockRuntime, mockCodeRunner);
    const ctx = makeCtx({ _last: "test", trigger: { input: 1 } });
    const result = (await compiled.entrySteps[0].execute(ctx)) as Record<
      string,
      unknown
    >;
    expect(result.ran).toBe("return 42");
    expect(result.gotParams).toContain("_last");
    expect(result.gotParams).toContain("trigger");
  });

  it("compiled delay step returns delay metadata", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "d1",
          type: "delay",
          label: "Wait",
          position: { x: 0, y: 100 },
          config: { duration: "1ms" },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "d1" }],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    const ctx = makeCtx();
    const result = (await compiled.entrySteps[0].execute(ctx)) as Record<
      string,
      unknown
    >;
    expect(result.delayed).toBe(true);
    expect(result.durationMs).toBe(1);
  });

  it("rejects delays longer than the in-process limit", () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "d1",
          type: "delay",
          label: "Wait",
          position: { x: 0, y: 100 },
          config: { duration: "2h" },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "d1" }],
    });

    expect(() => compileWorkflow(def, mockRuntime)).toThrow("60 seconds");
  });

  it("WorkflowCompilationError has correct name", () => {
    const err = new WorkflowCompilationError("test error");
    expect(err.name).toBe("WorkflowCompilationError");
    expect(err.message).toBe("test error");
    expect(err).toBeInstanceOf(Error);
  });

  it("compiled llm step calls useModel and returns text", async () => {
    const llmRuntime = {
      actions: [],
      useModel: async (_model: string, opts: Record<string, unknown>) => {
        return `Response to: ${opts.prompt}`;
      },
    } as never;

    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "l1",
          type: "llm",
          label: "Ask LLM",
          position: { x: 0, y: 100 },
          config: {
            prompt: "Hello {{trigger.name}}",
            temperature: 0.5,
            maxTokens: 100,
          },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "l1" }],
    });

    const compiled = compileWorkflow(def, llmRuntime);
    const ctx = makeCtx({ trigger: { name: "World" } });
    const result = (await compiled.entrySteps[0].execute(ctx)) as Record<
      string,
      unknown
    >;
    expect(result.text).toBe("Response to: Hello World");
  });

  it("compiled condition step evaluates true branch", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "c1",
          type: "condition",
          label: "Check",
          position: { x: 0, y: 100 },
          config: { expression: "{{_last}} === 200" },
        },
        {
          id: "o-true",
          type: "output",
          label: "True Path",
          position: { x: -100, y: 200 },
          config: { outputExpression: "true-path" },
        },
        {
          id: "o-false",
          type: "output",
          label: "False Path",
          position: { x: 100, y: 200 },
          config: { outputExpression: "false-path" },
        },
      ],
      edges: [
        { id: "e1", source: "t1", target: "c1" },
        { id: "e-true", source: "c1", target: "o-true", sourceHandle: "true" },
        {
          id: "e-false",
          source: "c1",
          target: "o-false",
          sourceHandle: "false",
        },
      ],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    // Condition is the only entry step (walk stops at condition node)
    const condStep = compiled.entrySteps[0];
    expect(condStep.nodeType).toBe("condition");

    // Execute with _last = 200 (truthy path)
    const ctxTrue = makeCtx({ _last: 200 });
    const resultTrue = (await condStep.execute(ctxTrue)) as Record<
      string,
      unknown
    >;
    expect(resultTrue.branch).toBe("true");

    // Execute with _last = 404 (false path)
    const ctxFalse = makeCtx({ _last: 404 });
    const resultFalse = (await condStep.execute(ctxFalse)) as Record<
      string,
      unknown
    >;
    expect(resultFalse.branch).toBe("false");
  });

  it("compiled condition step supports structured operands", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "c1",
          type: "condition",
          label: "Check",
          position: { x: 0, y: 100 },
          config: {
            leftOperand: "{{_last.status}}",
            operator: "===",
            rightOperand: '"ok"',
          },
        },
        {
          id: "o-true",
          type: "output",
          label: "True Path",
          position: { x: -100, y: 200 },
          config: { outputExpression: "true-path" },
        },
        {
          id: "o-false",
          type: "output",
          label: "False Path",
          position: { x: 100, y: 200 },
          config: { outputExpression: "false-path" },
        },
      ],
      edges: [
        { id: "e1", source: "t1", target: "c1" },
        { id: "e-true", source: "c1", target: "o-true", sourceHandle: "true" },
        {
          id: "e-false",
          source: "c1",
          target: "o-false",
          sourceHandle: "false",
        },
      ],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    const condStep = compiled.entrySteps[0];
    const result = (await condStep.execute(
      makeCtx({ _last: { status: "ok" } }),
    )) as Record<string, unknown>;

    expect(result.branch).toBe("true");
  });

  it("compiled condition step executes branch steps and returns result", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "c1",
          type: "condition",
          label: "Check",
          position: { x: 0, y: 100 },
          config: { expression: "{{_last}} === 200" },
        },
        {
          id: "o-true",
          type: "output",
          label: "True Path",
          position: { x: -100, y: 200 },
          config: { outputExpression: "success" },
        },
        {
          id: "o-false",
          type: "output",
          label: "False Path",
          position: { x: 100, y: 200 },
          config: { outputExpression: "failure" },
        },
      ],
      edges: [
        { id: "e1", source: "t1", target: "c1" },
        { id: "e-true", source: "c1", target: "o-true", sourceHandle: "true" },
        {
          id: "e-false",
          source: "c1",
          target: "o-false",
          sourceHandle: "false",
        },
      ],
    });

    const compiled = compileWorkflow(def, mockRuntime);

    // True branch should execute and return branch result
    const ctxTrue = makeCtx({ _last: 200 });
    const resultTrue = (await compiled.entrySteps[0].execute(
      ctxTrue,
    )) as Record<string, unknown>;
    expect(resultTrue.branch).toBe("true");
    expect(resultTrue.result).toBe("success");

    // False branch
    const ctxFalse = makeCtx({ _last: 404 });
    const resultFalse = (await compiled.entrySteps[0].execute(
      ctxFalse,
    )) as Record<string, unknown>;
    expect(resultFalse.branch).toBe("false");
    expect(resultFalse.result).toBe("failure");
  });

  it("compiled loop step iterates over items", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "loop1",
          type: "loop",
          label: "Loop",
          position: { x: 0, y: 100 },
          config: {
            itemsExpression: "{{trigger.items}}",
            variableName: "item",
          },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "loop1" }],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    const ctx = makeCtx({ trigger: { items: [10, 20, 30] } });
    const result = (await compiled.entrySteps[0].execute(ctx)) as Record<
      string,
      unknown
    >;
    expect(result.count).toBe(3);
  });

  it("compiled loop step handles empty items", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "loop1",
          type: "loop",
          label: "Loop",
          position: { x: 0, y: 100 },
          config: {
            itemsExpression: "{{trigger.items}}",
            variableName: "item",
          },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "loop1" }],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    const ctx = makeCtx({ trigger: { items: [] } });
    const result = (await compiled.entrySteps[0].execute(ctx)) as Record<
      string,
      unknown
    >;
    expect(result.count).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("compiled loop step handles non-array items", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "loop1",
          type: "loop",
          label: "Loop",
          position: { x: 0, y: 100 },
          config: {
            itemsExpression: "{{trigger.notAnArray}}",
            variableName: "item",
          },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "loop1" }],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    const ctx = makeCtx({ trigger: { notAnArray: "string" } });
    const result = (await compiled.entrySteps[0].execute(ctx)) as Record<
      string,
      unknown
    >;
    expect(result.count).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("compiled action step interpolates parameters", async () => {
    const paramRuntime = {
      actions: [
        {
          name: "GREET",
          handler: async (
            _rt: unknown,
            _msg: unknown,
            _state: unknown,
            opts: Record<string, unknown>,
          ) => {
            return opts.parameters;
          },
        },
      ],
    } as never;

    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "a1",
          type: "action",
          label: "Greet",
          position: { x: 0, y: 100 },
          config: {
            actionName: "GREET",
            parameters: { greeting: "Hello {{trigger.name}}" },
          },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "a1" }],
    });

    const compiled = compileWorkflow(def, paramRuntime);
    const ctx = makeCtx({ trigger: { name: "Alice" } });
    const result = (await compiled.entrySteps[0].execute(ctx)) as Record<
      string,
      string
    >;
    expect(result.greeting).toBe("Hello Alice");
  });

  it("compiled action step provides a readable message payload", async () => {
    const paramRuntime = {
      actions: [
        {
          name: "INSPECT",
          handler: async (
            _rt: unknown,
            message: { content?: { text?: string } },
          ) => {
            return { text: message.content?.text };
          },
        },
      ],
    } as never;

    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "a1",
          type: "action",
          label: "Inspect",
          position: { x: 0, y: 100 },
          config: {
            actionName: "INSPECT",
          },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "a1" }],
    });

    const compiled = compileWorkflow(def, paramRuntime);
    const ctx = makeCtx({ _last: { status: "ok" } });
    const result = (await compiled.entrySteps[0].execute(ctx)) as Record<
      string,
      string
    >;

    expect(result.text).toBe('{"status":"ok"}');
  });

  it("compiled delay step handles date-based delay", async () => {
    const futureDate = new Date(Date.now() + 10).toISOString();
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "d1",
          type: "delay",
          label: "Wait Until",
          position: { x: 0, y: 100 },
          config: { date: futureDate },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "d1" }],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    const ctx = makeCtx();
    const result = (await compiled.entrySteps[0].execute(ctx)) as Record<
      string,
      unknown
    >;
    expect(result.delayed).toBe(true);
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs as number).toBeLessThanOrEqual(60_000);
  });

  it("rejects subworkflow cycles when compiling with the workflow registry", () => {
    const parentWorkflow = makeDef({
      id: "parent-wf",
      name: "Parent",
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "sw1",
          type: "subworkflow",
          label: "Child",
          position: { x: 0, y: 100 },
          config: { workflowId: "child-wf" },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "sw1" }],
    });

    const childWorkflow = makeDef({
      id: "child-wf",
      name: "Child",
      nodes: [
        {
          id: "t2",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "sw2",
          type: "subworkflow",
          label: "Parent",
          position: { x: 0, y: 100 },
          config: { workflowId: "parent-wf" },
        },
      ],
      edges: [{ id: "e2", source: "t2", target: "sw2" }],
    });

    expect(() =>
      compileWorkflow(parentWorkflow, mockRuntime, undefined, [childWorkflow]),
    ).toThrow("Subworkflow cycle");
  });

  it("compiled hook step uses hookId from config", async () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "h1",
          type: "hook",
          label: "My Hook",
          position: { x: 0, y: 100 },
          config: { hookId: "custom-hook-id", webhookEnabled: true },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    const ctx = makeCtx();
    const result = (await compiled.entrySteps[0].execute(ctx)) as Record<
      string,
      unknown
    >;
    expect(result.hookId).toBe("custom-hook-id");
    expect(result.webhookEnabled).toBe(true);
  });

  it("stops walking at output node (no further steps)", () => {
    const def = makeDef({
      nodes: [
        {
          id: "t1",
          type: "trigger",
          label: "Start",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "o1",
          type: "output",
          label: "End",
          position: { x: 0, y: 100 },
          config: {},
        },
        {
          id: "a1",
          type: "action",
          label: "After Output",
          position: { x: 0, y: 200 },
          config: { actionName: "TEST_ACTION" },
        },
      ],
      edges: [
        { id: "e1", source: "t1", target: "o1" },
        { id: "e2", source: "o1", target: "a1" }, // should not be followed
      ],
    });

    const compiled = compileWorkflow(def, mockRuntime);
    // Only the output step should be compiled; action after output should be skipped
    expect(compiled.entrySteps).toHaveLength(1);
    expect(compiled.entrySteps[0].nodeType).toBe("output");
  });
});
