import { describe, expect, it } from "vitest";
import {
  normalizeParallaxCapture,
  ReplayArtifactSchema,
} from "./replay-capture";

describe("normalizeParallaxCapture", () => {
  it("normalizes wrapped event payloads into canonical replay artifact", () => {
    const capture = {
      run_id: "run-1",
      mode: "swarm",
      prompt: "build a todo app",
      repo: "elizaOS/eliza",
      workdir: "/tmp/work",
      captured_at: "2026-03-11T10:00:00.000Z",
      orchestrator_session_id: "sess-1",
      task_label: "todo",
      success: true,
      status: "completed",
      summary: "done",
      events: [
        {
          id: "e1",
          timestamp: "2026-03-11T10:00:01.000Z",
          actor: "orchestrator",
          type: "decision",
          decision_type: "task-split",
          message: "split by module",
        },
        {
          id: "e2",
          timestamp: 1_771_000_002,
          agent: "agent-alpha",
          kind: "tool",
          tool_name: "exec_command",
          input: { cmd: "rg --files" },
          tool_output: { code: 0 },
        },
        {
          id: "e3",
          ts: 1_771_000_003_000,
          source: "agent-alpha",
          event: "llm",
          model: "gpt-5-mini",
          prompt: "analyze files",
          response: "found targets",
          prompt_tokens: 120,
          completion_tokens: 45,
          latency_ms: 210,
        },
      ],
    };

    const normalized = normalizeParallaxCapture(capture);
    const parsed = ReplayArtifactSchema.parse(normalized);

    expect(parsed.schema_version).toBe("1.0");
    expect(parsed.run.mode).toBe("swarm");
    expect(parsed.events).toHaveLength(3);
    expect(parsed.events[0]).toMatchObject({
      id: "e1",
      actor: "orchestrator",
      kind: "decision",
      decision_type: "task-split",
    });
    expect(parsed.events[1].tool_call).toMatchObject({
      name: "exec_command",
      input: { cmd: "rg --files" },
    });
    expect(parsed.events[2].llm).toMatchObject({
      model: "gpt-5-mini",
      prompt_tokens: 120,
      completion_tokens: 45,
    });
    expect(parsed.outcome).toMatchObject({
      success: true,
      status: "completed",
      summary: "done",
    });
  });

  it("supports bare array captures and fills defaults", () => {
    const capture = [
      {
        type: "decision",
        reasoning: "pick single agent",
      },
    ];

    const normalized = normalizeParallaxCapture(capture);

    expect(normalized.run.mode).toBe("unknown");
    expect(normalized.events).toHaveLength(1);
    expect(normalized.events[0].id).toBe("event-1");
    expect(normalized.events[0].actor).toBe("orchestrator");
    expect(normalized.events[0].message).toBe("pick single agent");
    expect(normalized.outcome.success).toBeNull();
    expect(normalized.outcome.status).toBe("unknown");
  });

  it("infers mode from agent_count when explicit mode is absent", () => {
    const capture = {
      run_id: "run-2",
      agent_count: 3,
      records: [],
    };

    const normalized = normalizeParallaxCapture(capture);
    expect(normalized.run.mode).toBe("swarm");
  });
});
