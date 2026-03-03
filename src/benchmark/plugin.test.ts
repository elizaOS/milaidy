import { afterEach, describe, expect, it } from "vitest";
import {
  BENCHMARK_MESSAGE_TEMPLATE,
  type BenchmarkContext,
  clearCapturedAction,
  createBenchmarkPlugin,
  getCapturedAction,
  setBenchmarkContext,
} from "./plugin";

function getBenchmarkAction() {
  const plugin = createBenchmarkPlugin();
  const action = plugin.actions?.find(
    (entry) => entry.name === "BENCHMARK_ACTION",
  );
  if (!action?.handler || !action.validate) {
    throw new Error("BENCHMARK_ACTION is not configured");
  }
  return action;
}

function getBenchmarkProvider() {
  const plugin = createBenchmarkPlugin();
  const provider = plugin.providers?.find(
    (entry) => entry.name === "MILADY_BENCHMARK",
  );
  if (!provider?.get) {
    throw new Error("MILADY_BENCHMARK provider is not configured");
  }
  return provider;
}

afterEach(() => {
  clearCapturedAction();
  setBenchmarkContext(null);
});

describe("benchmark plugin action capture", () => {
  it("only validates BENCHMARK_ACTION when benchmark context exists", async () => {
    const action = getBenchmarkAction();

    const withoutContext = await action.validate(
      {} as never,
      {} as never,
      {} as never,
    );
    expect(withoutContext).toBe(false);

    setBenchmarkContext({ benchmark: "agentbench", taskId: "task-1" });
    const withContext = await action.validate(
      {} as never,
      {} as never,
      {} as never,
    );
    expect(withContext).toBe(true);
  });

  it("captures command-style benchmark actions", async () => {
    const action = getBenchmarkAction();
    setBenchmarkContext({ benchmark: "agentbench", taskId: "task-2" });

    await action.handler(
      {} as never,
      {} as never,
      {} as never,
      {
        parameters: {
          command: "search[laptop under $500]",
        },
      },
      [] as never,
    );

    expect(getCapturedAction()).toMatchObject({
      command: "search[laptop under $500]",
    });
  });

  it("parses tool-call JSON arguments", async () => {
    const action = getBenchmarkAction();
    setBenchmarkContext({ benchmark: "tau-bench", taskId: "task-3" });

    await action.handler(
      {} as never,
      {} as never,
      {} as never,
      {
        parameters: {
          tool_name: "lookup_order",
          arguments: '{"order_id":"A-123"}',
        },
      },
      [] as never,
    );

    expect(getCapturedAction()).toMatchObject({
      toolName: "lookup_order",
      arguments: { order_id: "A-123" },
    });
  });

  it("preserves invalid JSON tool arguments as _raw", async () => {
    const action = getBenchmarkAction();
    setBenchmarkContext({ benchmark: "tau-bench", taskId: "task-4" });

    await action.handler(
      {} as never,
      {} as never,
      {} as never,
      {
        parameters: {
          tool_name: "lookup_order",
          arguments: "{not-json}",
        },
      },
      [] as never,
    );

    expect(getCapturedAction()).toMatchObject({
      toolName: "lookup_order",
      arguments: { _raw: "{not-json}" },
    });
  });

  it("supports Struct-like fields payloads", async () => {
    const action = getBenchmarkAction();
    setBenchmarkContext({ benchmark: "mind2web", taskId: "task-5" });

    await action.handler(
      {} as never,
      {} as never,
      {} as never,
      {
        parameters: {
          fields: {
            operation: { stringValue: "CLICK" },
            element_id: { stringValue: "btn-1" },
            value: { stringValue: "" },
          },
        },
      },
      [] as never,
    );

    expect(getCapturedAction()).toMatchObject({
      operation: "CLICK",
      elementId: "btn-1",
      value: "",
    });
  });
});

describe("benchmark provider context", () => {
  it("returns empty text when no benchmark context is set", async () => {
    const provider = getBenchmarkProvider();
    const result = await provider.get({} as never, {} as never, {} as never);

    expect(result.text).toBe("");
    expect(result.values).toEqual({});
  });

  it("formats benchmark context for tool-calling tasks", async () => {
    const provider = getBenchmarkProvider();
    const context: BenchmarkContext = {
      benchmark: "tau-bench",
      taskId: "task-6",
      goal: "Find order status",
      tools: [
        {
          name: "lookup_order",
          description: "Look up customer order",
          parameters: {
            type: "object",
            properties: {
              order_id: {
                type: "string",
              },
            },
          },
        },
      ],
    };

    setBenchmarkContext(context);
    const result = await provider.get({} as never, {} as never, {} as never);

    expect(result.text).toContain("# Benchmark Task");
    expect(result.text).toContain("## Available Tools");
    expect(result.text).toContain("lookup_order");
    expect(result.values).toMatchObject({
      hasBenchmark: true,
      benchmark: "tau-bench",
      taskId: "task-6",
    });
    expect(result.data).toMatchObject({ benchmarkContext: context });
  });

  it("keeps message template focused on BENCHMARK_ACTION", () => {
    expect(BENCHMARK_MESSAGE_TEMPLATE).toContain("Always use BENCHMARK_ACTION");
    expect(BENCHMARK_MESSAGE_TEMPLATE).toContain(
      "Never use REPLY for benchmarks that need tool/command execution",
    );
  });
});
