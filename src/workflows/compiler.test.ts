import { describe, expect, it } from "vitest";
import {
  evaluateExpression,
  interpolate,
  parseDuration,
} from "./compiler";
import type { WorkflowContext } from "./types";

function makeCtx(
  overrides: Partial<WorkflowContext> = {},
): WorkflowContext {
  return {
    trigger: {},
    results: {},
    _last: null,
    runId: "test-run",
    workflowId: "test-wf",
    ...overrides,
  };
}

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
});

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

  it("evaluates contains", () => {
    const ctx = makeCtx({ _last: "hello world" });
    expect(
      evaluateExpression('{{_last}} contains "world"', ctx),
    ).toBe(true);
    expect(
      evaluateExpression('{{_last}} contains "xyz"', ctx),
    ).toBe(false);
  });

  it("evaluates truthy check", () => {
    expect(evaluateExpression("{{_last}}", makeCtx({ _last: "yes" }))).toBe(
      true,
    );
    expect(evaluateExpression("{{_last}}", makeCtx({ _last: "" }))).toBe(
      false,
    );
    expect(evaluateExpression("{{_last}}", makeCtx({ _last: "false" }))).toBe(
      false,
    );
  });
});

describe("parseDuration", () => {
  it("parses seconds", () => {
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("5 seconds")).toBe(5_000);
  });

  it("parses minutes", () => {
    expect(parseDuration("5m")).toBe(300_000);
    expect(parseDuration("10 minutes")).toBe(600_000);
  });

  it("parses hours", () => {
    expect(parseDuration("2h")).toBe(7_200_000);
  });

  it("parses days", () => {
    expect(parseDuration("1d")).toBe(86_400_000);
    expect(parseDuration("7 days")).toBe(604_800_000);
  });

  it("parses weeks", () => {
    expect(parseDuration("1w")).toBe(604_800_000);
  });

  it("parses milliseconds", () => {
    expect(parseDuration("500ms")).toBe(500);
  });

  it("returns 0 for invalid input", () => {
    expect(parseDuration("abc")).toBe(0);
    expect(parseDuration("")).toBe(0);
  });
});
