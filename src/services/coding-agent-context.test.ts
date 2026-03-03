/**
 * Coding Agent Context — Unit Tests
 *
 * Tests for:
 * - Zod schema validation (FileOperation, CommandResult, CapturedError, etc.)
 * - Validation helpers (validateCodingAgentContext, validateCodingIteration, etc.)
 * - Context helpers (createCodingAgentContext, hasReachedMaxIterations, etc.)
 */
import { describe, expect, it } from "vitest";

import {
  addIteration,
  CapturedErrorSchema,
  type CodingAgentContext,
  type CodingIteration,
  CodingIterationSchema,
  CommandResultSchema,
  ConnectorConfigSchema,
  createCodingAgentContext,
  FileOperationSchema,
  getUnresolvedErrors,
  type HumanFeedback,
  HumanFeedbackSchema,
  hasReachedMaxIterations,
  InteractionModeSchema,
  injectFeedback,
  isLastIterationClean,
  shouldContinueLoop,
  validateCodingAgentContext,
  validateCodingIteration,
  validateConnectorConfig,
  validateHumanFeedback,
} from "./coding-agent-context";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const NOW = Date.now();

/** Build a minimal CodingAgentContext for testing. */
function makeContext(
  overrides: Partial<CodingAgentContext> = {},
): CodingAgentContext {
  return {
    sessionId: "test-session",
    taskDescription: "Fix the bug",
    workingDirectory: "/tmp/work",
    connector: { type: "local-fs", basePath: "/tmp/work", available: true },
    interactionMode: "fully-automated",
    maxIterations: 10,
    active: true,
    iterations: [],
    allFeedback: [],
    createdAt: NOW,
    ...overrides,
  };
}

/** Build a minimal CodingIteration for testing. */
function makeIteration(
  overrides: Partial<CodingIteration> = {},
): CodingIteration {
  return {
    index: 0,
    startedAt: NOW,
    completedAt: NOW + 1000,
    fileOperations: [],
    commandResults: [],
    errors: [],
    feedback: [],
    selfCorrected: false,
    ...overrides,
  };
}

/** Build a minimal HumanFeedback record for testing. */
function makeFeedback(overrides: Partial<HumanFeedback> = {}): HumanFeedback {
  return {
    id: "fb-1",
    timestamp: NOW,
    text: "Looks good",
    type: "approval",
    ...overrides,
  };
}

// ============================================================================
//  1. Zod schema validation
// ============================================================================

describe("FileOperationSchema", () => {
  it("accepts a valid file operation", () => {
    const result = FileOperationSchema.safeParse({
      type: "write",
      target: "src/index.ts",
      size: 1024,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty target", () => {
    const result = FileOperationSchema.safeParse({
      type: "read",
      target: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid operation type", () => {
    const result = FileOperationSchema.safeParse({
      type: "delete",
      target: "file.ts",
    });
    expect(result.success).toBe(false);
  });
});

describe("CommandResultSchema", () => {
  it("accepts a valid command result", () => {
    const result = CommandResultSchema.safeParse({
      command: "npm test",
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      executedIn: "/tmp",
      success: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = CommandResultSchema.safeParse({
      command: "npm test",
      exitCode: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("CapturedErrorSchema", () => {
  it("accepts a valid captured error", () => {
    const result = CapturedErrorSchema.safeParse({
      category: "compile",
      message: "Type error on line 42",
      filePath: "src/index.ts",
      line: 42,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid error category", () => {
    const result = CapturedErrorSchema.safeParse({
      category: "syntax",
      message: "oops",
    });
    expect(result.success).toBe(false);
  });
});

describe("HumanFeedbackSchema", () => {
  it("accepts valid feedback", () => {
    const result = HumanFeedbackSchema.safeParse({
      id: "fb-1",
      timestamp: NOW,
      text: "Fix the off-by-one",
      type: "correction",
    });
    expect(result.success).toBe(true);
  });

  it("rejects feedback with empty text", () => {
    const result = HumanFeedbackSchema.safeParse({
      id: "fb-1",
      timestamp: NOW,
      text: "",
      type: "approval",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid feedback type", () => {
    const result = HumanFeedbackSchema.safeParse({
      id: "fb-1",
      timestamp: NOW,
      text: "ok",
      type: "suggestion",
    });
    expect(result.success).toBe(false);
  });
});

describe("CodingIterationSchema", () => {
  it("accepts a valid iteration with defaults", () => {
    const result = CodingIterationSchema.safeParse({
      index: 0,
      startedAt: NOW,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fileOperations).toEqual([]);
      expect(result.data.selfCorrected).toBe(false);
    }
  });

  it("rejects a negative iteration index", () => {
    const result = CodingIterationSchema.safeParse({
      index: -1,
      startedAt: NOW,
    });
    expect(result.success).toBe(false);
  });
});

describe("ConnectorConfigSchema", () => {
  it("accepts a valid connector config", () => {
    const result = ConnectorConfigSchema.safeParse({
      type: "local-fs",
      basePath: "/tmp/work",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.available).toBe(true);
    }
  });

  it("rejects an invalid connector type", () => {
    const result = ConnectorConfigSchema.safeParse({
      type: "ftp",
      basePath: "/tmp",
    });
    expect(result.success).toBe(false);
  });
});

describe("InteractionModeSchema", () => {
  it("accepts all valid interaction modes", () => {
    for (const mode of [
      "fully-automated",
      "human-in-the-loop",
      "manual-guidance",
    ]) {
      expect(InteractionModeSchema.safeParse(mode).success).toBe(true);
    }
  });

  it("rejects an invalid mode", () => {
    expect(InteractionModeSchema.safeParse("auto").success).toBe(false);
  });
});

// ============================================================================
//  2. Validation helpers
// ============================================================================

describe("validateCodingAgentContext", () => {
  it("returns ok for a valid context", () => {
    const result = validateCodingAgentContext(
      makeContext() as unknown as Record<string, unknown>,
    );
    expect(result.ok).toBe(true);
  });

  it("returns errors for an empty object", () => {
    const result = validateCodingAgentContext({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].path).toBeDefined();
      expect(result.errors[0].message).toBeDefined();
    }
  });
});

describe("validateCodingIteration", () => {
  it("returns ok for a valid iteration", () => {
    const result = validateCodingIteration({
      index: 0,
      startedAt: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("returns errors for missing fields", () => {
    const result = validateCodingIteration({});
    expect(result.ok).toBe(false);
  });
});

describe("validateHumanFeedback", () => {
  it("returns ok for valid feedback", () => {
    const result = validateHumanFeedback({
      id: "fb-1",
      timestamp: NOW,
      text: "Fix this",
      type: "correction",
    });
    expect(result.ok).toBe(true);
  });

  it("returns errors for invalid type", () => {
    const result = validateHumanFeedback({
      id: "fb-1",
      timestamp: NOW,
      text: "Fix this",
      type: "hint",
    });
    expect(result.ok).toBe(false);
  });
});

describe("validateConnectorConfig", () => {
  it("returns ok for a valid config", () => {
    const result = validateConnectorConfig({
      type: "git-repo",
      basePath: "https://github.com/owner/repo",
    });
    expect(result.ok).toBe(true);
  });

  it("returns errors for missing basePath", () => {
    const result = validateConnectorConfig({ type: "api" });
    expect(result.ok).toBe(false);
  });
});

// ============================================================================
//  3. Context helpers
// ============================================================================

describe("createCodingAgentContext", () => {
  it("creates a context with defaults", () => {
    const ctx = createCodingAgentContext({
      sessionId: "s1",
      taskDescription: "Write tests",
      workingDirectory: "/tmp",
      connectorType: "local-fs",
      connectorBasePath: "/tmp",
    });

    expect(ctx.sessionId).toBe("s1");
    expect(ctx.interactionMode).toBe("fully-automated");
    expect(ctx.maxIterations).toBe(10);
    expect(ctx.active).toBe(true);
    expect(ctx.iterations).toEqual([]);
    expect(ctx.allFeedback).toEqual([]);
    expect(ctx.connector.type).toBe("local-fs");
    expect(ctx.connector.available).toBe(true);
  });

  it("respects custom interactionMode and maxIterations", () => {
    const ctx = createCodingAgentContext({
      sessionId: "s2",
      taskDescription: "Review code",
      workingDirectory: "/tmp",
      connectorType: "api",
      connectorBasePath: "https://api.example.com",
      interactionMode: "human-in-the-loop",
      maxIterations: 5,
    });

    expect(ctx.interactionMode).toBe("human-in-the-loop");
    expect(ctx.maxIterations).toBe(5);
  });
});

describe("hasReachedMaxIterations", () => {
  it("returns false when iterations are below max", () => {
    const ctx = makeContext({
      maxIterations: 3,
      iterations: [makeIteration()],
    });
    expect(hasReachedMaxIterations(ctx)).toBe(false);
  });

  it("returns true when iterations equal max", () => {
    const ctx = makeContext({
      maxIterations: 2,
      iterations: [makeIteration({ index: 0 }), makeIteration({ index: 1 })],
    });
    expect(hasReachedMaxIterations(ctx)).toBe(true);
  });
});

describe("isLastIterationClean", () => {
  it("returns true when there are no iterations", () => {
    expect(isLastIterationClean(makeContext())).toBe(true);
  });

  it("returns true when last iteration has no errors", () => {
    const ctx = makeContext({
      iterations: [makeIteration({ errors: [] })],
    });
    expect(isLastIterationClean(ctx)).toBe(true);
  });

  it("returns false when last iteration has errors", () => {
    const ctx = makeContext({
      iterations: [
        makeIteration({
          errors: [{ category: "compile", message: "type error" }],
        }),
      ],
    });
    expect(isLastIterationClean(ctx)).toBe(false);
  });
});

describe("getUnresolvedErrors", () => {
  it("returns empty array when there are no iterations", () => {
    expect(getUnresolvedErrors(makeContext())).toEqual([]);
  });

  it("returns errors from the last iteration", () => {
    const errors = [
      { category: "compile" as const, message: "error 1" },
      { category: "runtime" as const, message: "error 2" },
    ];
    const ctx = makeContext({
      iterations: [makeIteration({ errors })],
    });
    expect(getUnresolvedErrors(ctx)).toEqual(errors);
  });
});

describe("addIteration", () => {
  it("appends an iteration and updates timestamp", () => {
    const ctx = makeContext();
    const iter = makeIteration({ index: 0 });
    const updated = addIteration(ctx, iter);

    expect(updated.iterations).toHaveLength(1);
    expect(updated.iterations[0].index).toBe(0);
    expect(updated.updatedAt).toBeDefined();
  });

  it("preserves existing iterations", () => {
    const ctx = makeContext({
      iterations: [makeIteration({ index: 0 })],
    });
    const updated = addIteration(ctx, makeIteration({ index: 1 }));

    expect(updated.iterations).toHaveLength(2);
    expect(updated.iterations[0].index).toBe(0);
    expect(updated.iterations[1].index).toBe(1);
  });
});

describe("injectFeedback", () => {
  it("appends feedback and updates timestamp", () => {
    const ctx = makeContext();
    const fb = makeFeedback();
    const updated = injectFeedback(ctx, fb);

    expect(updated.allFeedback).toHaveLength(1);
    expect(updated.allFeedback[0].id).toBe("fb-1");
    expect(updated.updatedAt).toBeDefined();
  });

  it("preserves existing feedback", () => {
    const ctx = makeContext({
      allFeedback: [makeFeedback({ id: "fb-0" })],
    });
    const updated = injectFeedback(ctx, makeFeedback({ id: "fb-1" }));

    expect(updated.allFeedback).toHaveLength(2);
  });
});

describe("shouldContinueLoop", () => {
  it("returns false when session is inactive", () => {
    const ctx = makeContext({ active: false });
    const result = shouldContinueLoop(ctx);
    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toContain("no longer active");
  });

  it("returns false when max iterations reached", () => {
    const ctx = makeContext({
      maxIterations: 1,
      iterations: [makeIteration()],
    });
    const result = shouldContinueLoop(ctx);
    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toContain("maximum iterations");
  });

  it("returns false when last iteration is clean and iterations exist", () => {
    const ctx = makeContext({
      iterations: [makeIteration({ errors: [] })],
    });
    const result = shouldContinueLoop(ctx);
    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toContain("without errors");
  });

  it("returns false when last feedback is a rejection", () => {
    const ctx = makeContext({
      iterations: [
        makeIteration({
          errors: [{ category: "compile", message: "err" }],
        }),
      ],
      allFeedback: [makeFeedback({ type: "rejection" })],
    });
    const result = shouldContinueLoop(ctx);
    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toContain("rejected");
  });

  it("returns true when errors remain and loop is active", () => {
    const ctx = makeContext({
      iterations: [
        makeIteration({
          errors: [{ category: "runtime", message: "oops" }],
        }),
      ],
    });
    const result = shouldContinueLoop(ctx);
    expect(result.shouldContinue).toBe(true);
  });

  it("returns true when no iterations have run yet", () => {
    const ctx = makeContext();
    const result = shouldContinueLoop(ctx);
    expect(result.shouldContinue).toBe(true);
  });
});
