/**
 * Tests for the coding agent autonomous loop, human-in-the-loop feedback,
 * mixed interaction modes, and connector support.
 *
 * Covers GitHub Issue #4 "Coding Agent Capabilities":
 *   - Code generation flow
 *   - Execution and error capture
 *   - Iterative self-correction loop
 *   - Human-in-the-loop feedback injection
 *   - Mixed interaction modes
 *   - Connector support (local FS, repos, APIs)
 *   - Context validation via Zod schemas
 *   - Workspace provider coding agent enrichment
 */
import { describe, expect, it } from "vitest";
import type { WorkspaceBootstrapFile } from "../providers/workspace";
import {
  buildCodingAgentSummary,
  buildContext,
  truncate,
} from "../providers/workspace-provider";
import {
  addIteration,
  type CapturedError,
  CapturedErrorSchema,
  type CodingAgentContext,
  type CodingIteration,
  CodingIterationSchema,
  type CommandResult,
  CommandResultSchema,
  type ConnectorConfig,
  ConnectorTypeSchema,
  createCodingAgentContext,
  FileOperationSchema,
  getUnresolvedErrors,
  type HumanFeedback,
  HumanFeedbackSchema,
  hasReachedMaxIterations,
  type InteractionMode,
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
// Helpers
// ---------------------------------------------------------------------------

function nowMs(): number {
  return Date.now();
}

function makeIteration(
  overrides: Partial<CodingIteration> = {},
): CodingIteration {
  return {
    index: 0,
    startedAt: nowMs(),
    completedAt: nowMs() + 1000,
    generatedCode: 'console.log("hello");',
    fileOperations: [],
    commandResults: [],
    errors: [],
    feedback: [],
    selfCorrected: false,
    summary: "Initial code generation",
    ...overrides,
  };
}

function makeError(overrides: Partial<CapturedError> = {}): CapturedError {
  return {
    category: "compile",
    message: "Unexpected token",
    filePath: "src/index.ts",
    line: 42,
    ...overrides,
  };
}

function makeCommandResult(
  overrides: Partial<CommandResult> = {},
): CommandResult {
  return {
    command: "tsc --noEmit",
    exitCode: 0,
    stdout: "",
    stderr: "",
    executedIn: "/workspace/project",
    success: true,
    ...overrides,
  };
}

function makeFeedback(overrides: Partial<HumanFeedback> = {}): HumanFeedback {
  return {
    id: "fb-1",
    timestamp: nowMs(),
    text: "Please use async/await instead of callbacks",
    type: "guidance",
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<CodingAgentContext> = {},
): CodingAgentContext {
  return {
    sessionId: "test-session-1",
    taskDescription: "Implement a REST API endpoint",
    workingDirectory: "/workspace/project",
    connector: {
      type: "local-fs",
      basePath: "/workspace/project",
      available: true,
    },
    interactionMode: "fully-automated",
    maxIterations: 10,
    active: true,
    iterations: [],
    allFeedback: [],
    createdAt: nowMs(),
    updatedAt: nowMs(),
    ...overrides,
  };
}

// ===========================================================================
// 1. Code Generation Flow
// ===========================================================================

describe("Coding Agent — Code Generation Flow", () => {
  it("creates a valid coding agent context for a new session", () => {
    const ctx = createCodingAgentContext({
      sessionId: "gen-session-1",
      taskDescription: "Generate a quicksort implementation",
      workingDirectory: "/workspace",
      connectorType: "local-fs",
      connectorBasePath: "/workspace",
    });

    expect(ctx.sessionId).toBe("gen-session-1");
    expect(ctx.taskDescription).toBe("Generate a quicksort implementation");
    expect(ctx.connector.type).toBe("local-fs");
    expect(ctx.interactionMode).toBe("fully-automated");
    expect(ctx.active).toBe(true);
    expect(ctx.iterations).toHaveLength(0);
  });

  it("validates a context with code generation iteration", () => {
    const ctx = makeContext({
      iterations: [
        makeIteration({
          index: 0,
          generatedCode: "function quicksort(arr) { /* ... */ }",
          fileOperations: [
            { type: "write", target: "src/quicksort.ts", size: 512 },
          ],
        }),
      ],
    });

    const result = validateCodingAgentContext(ctx as Record<string, unknown>);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.iterations[0]?.generatedCode).toContain("quicksort");
      expect(result.data.iterations[0]?.fileOperations).toHaveLength(1);
    }
  });

  it("records file operations during code generation", () => {
    const iteration = makeIteration({
      fileOperations: [
        { type: "write", target: "src/api/users.ts", size: 2048 },
        { type: "write", target: "src/api/users.test.ts", size: 1024 },
        { type: "edit", target: "src/index.ts", size: 128 },
      ],
    });

    const result = CodingIterationSchema.safeParse(iteration);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fileOperations).toHaveLength(3);
      expect(result.data.fileOperations[0]?.type).toBe("write");
      expect(result.data.fileOperations[2]?.type).toBe("edit");
    }
  });
});

// ===========================================================================
// 2. Execution and Error Capture
// ===========================================================================

describe("Coding Agent — Execution and Error Capture", () => {
  it("captures successful command execution", () => {
    const cmd = makeCommandResult({
      command: "npm test",
      exitCode: 0,
      stdout: "All tests passed",
      success: true,
    });

    const result = CommandResultSchema.safeParse(cmd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.success).toBe(true);
      expect(result.data.exitCode).toBe(0);
    }
  });

  it("captures failed command execution with stderr", () => {
    const cmd = makeCommandResult({
      command: "tsc --noEmit",
      exitCode: 2,
      stdout: "",
      stderr: "error TS2345: Argument of type 'string' is not assignable...",
      success: false,
    });

    const result = CommandResultSchema.safeParse(cmd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.success).toBe(false);
      expect(result.data.stderr).toContain("TS2345");
    }
  });

  it("captures compile errors with file location", () => {
    const error = makeError({
      category: "compile",
      message: "Cannot find module './utils'",
      filePath: "src/index.ts",
      line: 3,
      raw: "error TS2307: Cannot find module './utils'",
    });

    const result = CapturedErrorSchema.safeParse(error);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("compile");
      expect(result.data.filePath).toBe("src/index.ts");
      expect(result.data.line).toBe(3);
    }
  });

  it("captures runtime errors", () => {
    const error = makeError({
      category: "runtime",
      message: "TypeError: Cannot read property 'length' of undefined",
      filePath: "src/server.ts",
      line: 87,
    });

    const result = CapturedErrorSchema.safeParse(error);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("runtime");
    }
  });

  it("captures test failures", () => {
    const error = makeError({
      category: "test",
      message: "Expected 200 but received 404",
      filePath: "src/api.test.ts",
      line: 15,
    });

    const result = CapturedErrorSchema.safeParse(error);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("test");
    }
  });

  it("captures lint errors", () => {
    const error = makeError({
      category: "lint",
      message: "Unexpected any. Specify a different type.",
      filePath: "src/handler.ts",
      line: 22,
    });

    const result = CapturedErrorSchema.safeParse(error);
    expect(result.success).toBe(true);
  });

  it("records errors in an iteration alongside commands", () => {
    const iteration = makeIteration({
      commandResults: [
        makeCommandResult({
          command: "tsc --noEmit",
          exitCode: 1,
          success: false,
          stderr: "TS2345",
        }),
      ],
      errors: [
        makeError({ category: "compile", message: "Type error in handler" }),
      ],
    });

    expect(iteration.commandResults).toHaveLength(1);
    expect(iteration.errors).toHaveLength(1);
    expect(iteration.commandResults[0]?.success).toBe(false);
    expect(iteration.errors[0]?.category).toBe("compile");
  });

  it("retrieves unresolved errors from context", () => {
    const ctx = makeContext({
      iterations: [
        makeIteration({
          errors: [
            makeError({ message: "Error 1" }),
            makeError({ message: "Error 2" }),
          ],
        }),
      ],
    });

    const errors = getUnresolvedErrors(ctx);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toBe("Error 1");
    expect(errors[1]?.message).toBe("Error 2");
  });

  it("returns empty errors when no iterations exist", () => {
    const ctx = makeContext();
    expect(getUnresolvedErrors(ctx)).toHaveLength(0);
  });
});

// ===========================================================================
// 3. Iterative Self-Correction Loop
// ===========================================================================

describe("Coding Agent — Iterative Self-Correction Loop", () => {
  it("tracks iteration progression", () => {
    let ctx = makeContext();

    // Iteration 0: initial code with errors
    ctx = addIteration(
      ctx,
      makeIteration({
        index: 0,
        errors: [makeError({ message: "Missing import" })],
      }),
    );

    // Iteration 1: self-correction attempt
    ctx = addIteration(
      ctx,
      makeIteration({
        index: 1,
        selfCorrected: true,
        errors: [],
        summary: "Added missing import statement",
      }),
    );

    expect(ctx.iterations).toHaveLength(2);
    expect(ctx.iterations[0]?.errors).toHaveLength(1);
    expect(ctx.iterations[1]?.selfCorrected).toBe(true);
    expect(ctx.iterations[1]?.errors).toHaveLength(0);
  });

  it("detects when last iteration is clean (no errors)", () => {
    const ctx = makeContext({
      iterations: [
        makeIteration({ index: 0, errors: [makeError()] }),
        makeIteration({ index: 1, errors: [], selfCorrected: true }),
      ],
    });

    expect(isLastIterationClean(ctx)).toBe(true);
  });

  it("detects when last iteration has errors", () => {
    const ctx = makeContext({
      iterations: [makeIteration({ index: 0, errors: [makeError()] })],
    });

    expect(isLastIterationClean(ctx)).toBe(false);
  });

  it("reports clean when no iterations exist", () => {
    expect(isLastIterationClean(makeContext())).toBe(true);
  });

  it("stops when max iterations reached", () => {
    const ctx = makeContext({
      maxIterations: 3,
      iterations: [
        makeIteration({ index: 0, errors: [makeError()] }),
        makeIteration({ index: 1, errors: [makeError()] }),
        makeIteration({ index: 2, errors: [makeError()] }),
      ],
    });

    expect(hasReachedMaxIterations(ctx)).toBe(true);

    const decision = shouldContinueLoop(ctx);
    expect(decision.shouldContinue).toBe(false);
    expect(decision.reason).toContain("maximum iterations");
  });

  it("continues when errors remain and iterations left", () => {
    const ctx = makeContext({
      maxIterations: 10,
      iterations: [makeIteration({ index: 0, errors: [makeError()] })],
    });

    const decision = shouldContinueLoop(ctx);
    expect(decision.shouldContinue).toBe(true);
    expect(decision.reason).toContain("Errors to resolve");
  });

  it("stops when last iteration is error-free", () => {
    const ctx = makeContext({
      iterations: [
        makeIteration({ index: 0, errors: [makeError()] }),
        makeIteration({ index: 1, errors: [], selfCorrected: true }),
      ],
    });

    const decision = shouldContinueLoop(ctx);
    expect(decision.shouldContinue).toBe(false);
    expect(decision.reason).toContain("without errors");
  });

  it("stops when session is deactivated", () => {
    const ctx = makeContext({ active: false });
    const decision = shouldContinueLoop(ctx);
    expect(decision.shouldContinue).toBe(false);
    expect(decision.reason).toContain("no longer active");
  });

  it("simulates a full self-correction cycle", () => {
    let ctx = createCodingAgentContext({
      sessionId: "correction-cycle",
      taskDescription: "Fix type errors in auth module",
      workingDirectory: "/workspace",
      connectorType: "local-fs",
      connectorBasePath: "/workspace",
      maxIterations: 5,
    });

    // Iteration 0: Initial attempt — type error found
    ctx = addIteration(
      ctx,
      makeIteration({
        index: 0,
        commandResults: [
          makeCommandResult({
            command: "tsc --noEmit",
            exitCode: 1,
            success: false,
          }),
        ],
        errors: [
          makeError({
            category: "compile",
            message: "Type 'string' not assignable to 'number'",
          }),
        ],
      }),
    );
    expect(shouldContinueLoop(ctx).shouldContinue).toBe(true);

    // Iteration 1: Self-correction — different error emerges
    ctx = addIteration(
      ctx,
      makeIteration({
        index: 1,
        selfCorrected: false,
        commandResults: [
          makeCommandResult({
            command: "tsc --noEmit",
            exitCode: 1,
            success: false,
          }),
        ],
        errors: [
          makeError({
            category: "compile",
            message: "Property 'id' does not exist",
          }),
        ],
      }),
    );
    expect(shouldContinueLoop(ctx).shouldContinue).toBe(true);

    // Iteration 2: Final fix — clean build
    ctx = addIteration(
      ctx,
      makeIteration({
        index: 2,
        selfCorrected: true,
        commandResults: [
          makeCommandResult({
            command: "tsc --noEmit",
            exitCode: 0,
            success: true,
          }),
        ],
        errors: [],
      }),
    );
    expect(shouldContinueLoop(ctx).shouldContinue).toBe(false);
    expect(ctx.iterations).toHaveLength(3);
  });
});

// ===========================================================================
// 4. Human-in-the-Loop Feedback Injection
// ===========================================================================

describe("Coding Agent — Human-in-the-Loop Feedback", () => {
  it("validates well-formed feedback", () => {
    const fb = makeFeedback();
    const result = validateHumanFeedback(fb as Record<string, unknown>);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.type).toBe("guidance");
      expect(result.data.text).toContain("async/await");
    }
  });

  it("rejects feedback with empty text", () => {
    const fb = makeFeedback({ text: "" });
    const result = validateHumanFeedback(fb as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });

  it("rejects feedback with missing id", () => {
    const fb = { ...makeFeedback(), id: "" };
    const result = validateHumanFeedback(fb as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });

  it("injects user feedback into context", () => {
    const pastTime = nowMs() - 5000;
    let ctx = makeContext({ createdAt: pastTime, updatedAt: pastTime });
    const fb = makeFeedback({
      id: "fb-inject-1",
      text: "Use the zod library for validation",
      type: "guidance",
    });

    ctx = injectFeedback(ctx, fb);
    expect(ctx.allFeedback).toHaveLength(1);
    expect(ctx.allFeedback[0]?.text).toContain("zod");
    expect(ctx.updatedAt).toBeGreaterThanOrEqual(ctx.createdAt);
  });

  it("preserves all feedback history across injections", () => {
    let ctx = makeContext();
    ctx = injectFeedback(
      ctx,
      makeFeedback({ id: "fb-1", text: "Use TypeScript strict mode" }),
    );
    ctx = injectFeedback(
      ctx,
      makeFeedback({ id: "fb-2", text: "Add error handling" }),
    );
    ctx = injectFeedback(
      ctx,
      makeFeedback({ id: "fb-3", text: "Include unit tests" }),
    );

    expect(ctx.allFeedback).toHaveLength(3);
    expect(ctx.allFeedback[0]?.id).toBe("fb-1");
    expect(ctx.allFeedback[2]?.id).toBe("fb-3");
  });

  it("stops the loop on user rejection", () => {
    let ctx = makeContext({
      iterations: [makeIteration({ errors: [makeError()] })],
    });

    ctx = injectFeedback(
      ctx,
      makeFeedback({
        id: "fb-reject",
        text: "This approach is wrong, please stop",
        type: "rejection",
      }),
    );

    const decision = shouldContinueLoop(ctx);
    expect(decision.shouldContinue).toBe(false);
    expect(decision.reason).toContain("rejected");
  });

  it("allows correction feedback to continue the loop", () => {
    let ctx = makeContext({
      iterations: [makeIteration({ errors: [makeError()] })],
    });

    ctx = injectFeedback(
      ctx,
      makeFeedback({
        id: "fb-correct",
        text: "Use a different algorithm instead",
        type: "correction",
      }),
    );

    const decision = shouldContinueLoop(ctx);
    expect(decision.shouldContinue).toBe(true);
  });

  it("associates feedback with specific iteration references", () => {
    const fb = makeFeedback({
      id: "fb-ref",
      iterationRef: 2,
      text: "The fix in iteration 2 looks wrong",
      type: "correction",
    });

    const result = HumanFeedbackSchema.safeParse(fb);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.iterationRef).toBe(2);
    }
  });

  it("validates all feedback types", () => {
    const types = ["correction", "guidance", "approval", "rejection"] as const;
    for (const type of types) {
      const fb = makeFeedback({ id: `fb-${type}`, type });
      const result = HumanFeedbackSchema.safeParse(fb);
      expect(result.success).toBe(true);
    }
  });
});

// ===========================================================================
// 5. Mixed Interaction Modes
// ===========================================================================

describe("Coding Agent — Mixed Interaction Modes", () => {
  it("supports fully-automated mode", () => {
    const ctx = createCodingAgentContext({
      sessionId: "auto-1",
      taskDescription: "Generate tests",
      workingDirectory: "/workspace",
      connectorType: "local-fs",
      connectorBasePath: "/workspace",
      interactionMode: "fully-automated",
    });

    expect(ctx.interactionMode).toBe("fully-automated");
  });

  it("supports human-in-the-loop mode", () => {
    const ctx = createCodingAgentContext({
      sessionId: "hitl-1",
      taskDescription: "Refactor authentication",
      workingDirectory: "/workspace",
      connectorType: "local-fs",
      connectorBasePath: "/workspace",
      interactionMode: "human-in-the-loop",
    });

    expect(ctx.interactionMode).toBe("human-in-the-loop");
  });

  it("supports manual-guidance mode", () => {
    const ctx = createCodingAgentContext({
      sessionId: "manual-1",
      taskDescription: "Design database schema",
      workingDirectory: "/workspace",
      connectorType: "local-fs",
      connectorBasePath: "/workspace",
      interactionMode: "manual-guidance",
    });

    expect(ctx.interactionMode).toBe("manual-guidance");
  });

  it("validates all interaction modes", () => {
    const modes: InteractionMode[] = [
      "fully-automated",
      "human-in-the-loop",
      "manual-guidance",
    ];
    for (const mode of modes) {
      const result = InteractionModeSchema.safeParse(mode);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid interaction modes", () => {
    const result = InteractionModeSchema.safeParse("invalid-mode");
    expect(result.success).toBe(false);
  });

  it("transitions from automated to manual guidance mid-session", () => {
    let ctx = makeContext({ interactionMode: "fully-automated" });

    // Automated iterations
    ctx = addIteration(ctx, makeIteration({ index: 0, errors: [makeError()] }));

    // User injects guidance — conceptually switching to manual guidance
    ctx = injectFeedback(
      ctx,
      makeFeedback({
        id: "fb-switch",
        text: "Let me guide you through the rest",
        type: "guidance",
      }),
    );

    // Update mode
    ctx = { ...ctx, interactionMode: "manual-guidance" };
    expect(ctx.interactionMode).toBe("manual-guidance");
    expect(ctx.allFeedback).toHaveLength(1);
    expect(ctx.iterations).toHaveLength(1);
  });

  it("validates a context created with default interaction mode", () => {
    const ctx = createCodingAgentContext({
      sessionId: "default-mode",
      taskDescription: "Test something",
      workingDirectory: "/workspace",
      connectorType: "local-fs",
      connectorBasePath: "/workspace",
    });

    // Default should be fully-automated
    expect(ctx.interactionMode).toBe("fully-automated");

    const validated = validateCodingAgentContext(
      ctx as Record<string, unknown>,
    );
    expect(validated.ok).toBe(true);
  });
});

// ===========================================================================
// 6. Connector Support (Local FS, Repos, APIs)
// ===========================================================================

describe("Coding Agent — Connector Support", () => {
  it("validates local-fs connector", () => {
    const config: ConnectorConfig = {
      type: "local-fs",
      basePath: "/home/user/project",
      available: true,
    };
    const result = validateConnectorConfig(config as Record<string, unknown>);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.type).toBe("local-fs");
    }
  });

  it("validates git-repo connector", () => {
    const config: ConnectorConfig = {
      type: "git-repo",
      basePath: "https://github.com/user/repo.git",
      available: true,
      metadata: { branch: "main", remote: "origin" },
    };
    const result = validateConnectorConfig(config as Record<string, unknown>);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.type).toBe("git-repo");
      expect(result.data.metadata?.branch).toBe("main");
    }
  });

  it("validates api connector", () => {
    const config: ConnectorConfig = {
      type: "api",
      basePath: "https://api.example.com/v1",
      available: true,
      metadata: { authType: "bearer" },
    };
    const result = validateConnectorConfig(config as Record<string, unknown>);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.type).toBe("api");
    }
  });

  it("validates browser connector", () => {
    const config: ConnectorConfig = {
      type: "browser",
      basePath: "http://localhost:3000",
      available: true,
    };
    const result = validateConnectorConfig(config as Record<string, unknown>);
    expect(result.ok).toBe(true);
  });

  it("validates sandbox connector", () => {
    const config: ConnectorConfig = {
      type: "sandbox",
      basePath: "/sandbox/workspace",
      available: true,
    };
    const result = validateConnectorConfig(config as Record<string, unknown>);
    expect(result.ok).toBe(true);
  });

  it("validates all connector types", () => {
    const types = [
      "local-fs",
      "git-repo",
      "api",
      "browser",
      "sandbox",
    ] as const;
    for (const t of types) {
      const result = ConnectorTypeSchema.safeParse(t);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid connector types", () => {
    const result = ConnectorTypeSchema.safeParse("ftp");
    expect(result.success).toBe(false);
  });

  it("rejects connector with empty basePath", () => {
    const config = { type: "local-fs", basePath: "", available: true };
    const result = validateConnectorConfig(config as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });

  it("marks connector as unavailable", () => {
    const config: ConnectorConfig = {
      type: "api",
      basePath: "https://api.example.com",
      available: false,
    };
    const result = validateConnectorConfig(config as Record<string, unknown>);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.available).toBe(false);
    }
  });

  it("creates context with different connectors", () => {
    const localCtx = createCodingAgentContext({
      sessionId: "local-1",
      taskDescription: "Fix bug",
      workingDirectory: "/project",
      connectorType: "local-fs",
      connectorBasePath: "/project",
    });
    expect(localCtx.connector.type).toBe("local-fs");

    const repoCtx = createCodingAgentContext({
      sessionId: "repo-1",
      taskDescription: "Review PR",
      workingDirectory: "/tmp/repo",
      connectorType: "git-repo",
      connectorBasePath: "https://github.com/org/repo",
    });
    expect(repoCtx.connector.type).toBe("git-repo");

    const apiCtx = createCodingAgentContext({
      sessionId: "api-1",
      taskDescription: "Test API endpoint",
      workingDirectory: "/workspace",
      connectorType: "api",
      connectorBasePath: "https://api.test.com",
    });
    expect(apiCtx.connector.type).toBe("api");
  });
});

// ===========================================================================
// 7. Context Validation (Zod Schemas)
// ===========================================================================

describe("Coding Agent — Context Validation", () => {
  it("validates a minimal valid context", () => {
    const ctx = makeContext();
    const result = validateCodingAgentContext(ctx as Record<string, unknown>);
    expect(result.ok).toBe(true);
  });

  it("validates a fully populated context", () => {
    const ctx = makeContext({
      iterations: [
        makeIteration({
          index: 0,
          commandResults: [makeCommandResult()],
          errors: [makeError()],
          fileOperations: [
            { type: "write", target: "src/index.ts", size: 100 },
          ],
          feedback: [makeFeedback()],
        }),
      ],
      allFeedback: [makeFeedback()],
    });

    const result = validateCodingAgentContext(ctx as Record<string, unknown>);
    expect(result.ok).toBe(true);
  });

  it("rejects context with empty sessionId", () => {
    const ctx = makeContext({ sessionId: "" });
    const result = validateCodingAgentContext(ctx as Record<string, unknown>);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path.includes("sessionId"))).toBe(
        true,
      );
    }
  });

  it("rejects context with empty taskDescription", () => {
    const ctx = makeContext({ taskDescription: "" });
    const result = validateCodingAgentContext(ctx as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });

  it("rejects context with empty workingDirectory", () => {
    const ctx = makeContext({ workingDirectory: "" });
    const result = validateCodingAgentContext(ctx as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });

  it("rejects context with negative maxIterations", () => {
    const ctx = makeContext({ maxIterations: -1 });
    const result = validateCodingAgentContext(ctx as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });

  it("rejects context with zero maxIterations", () => {
    const ctx = makeContext({ maxIterations: 0 });
    const result = validateCodingAgentContext(ctx as Record<string, unknown>);
    expect(result.ok).toBe(false);
  });

  it("validates iteration with all optional fields omitted", () => {
    const iteration: Record<string, unknown> = {
      index: 0,
      startedAt: nowMs(),
    };
    const result = validateCodingIteration(iteration);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Defaults should be applied
      expect(result.data.fileOperations).toEqual([]);
      expect(result.data.commandResults).toEqual([]);
      expect(result.data.errors).toEqual([]);
      expect(result.data.feedback).toEqual([]);
      expect(result.data.selfCorrected).toBe(false);
    }
  });

  it("rejects iteration with negative index", () => {
    const iteration: Record<string, unknown> = {
      index: -1,
      startedAt: nowMs(),
    };
    const result = validateCodingIteration(iteration);
    expect(result.ok).toBe(false);
  });

  it("validates file operation types", () => {
    const types = ["read", "write", "edit", "list", "search"] as const;
    for (const t of types) {
      const op = { type: t, target: "src/test.ts" };
      const result = FileOperationSchema.safeParse(op);
      expect(result.success).toBe(true);
    }
  });

  it("rejects file operation with empty target", () => {
    const op = { type: "read", target: "" };
    const result = FileOperationSchema.safeParse(op);
    expect(result.success).toBe(false);
  });

  it("rejects command result with empty command", () => {
    const cmd = makeCommandResult({ command: "" });
    const result = CommandResultSchema.safeParse(cmd);
    expect(result.success).toBe(false);
  });

  it("rejects error with empty message", () => {
    const err = makeError({ message: "" });
    const result = CapturedErrorSchema.safeParse(err);
    expect(result.success).toBe(false);
  });

  it("validation returns structured error paths", () => {
    const ctx = {
      sessionId: "",
      taskDescription: "",
      workingDirectory: "",
      connector: { type: "invalid", basePath: "" },
      interactionMode: "invalid",
      maxIterations: -5,
      active: true,
      iterations: [],
      allFeedback: [],
      createdAt: -1,
    };

    const result = validateCodingAgentContext(ctx as Record<string, unknown>);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      // Each error should have a path and message
      for (const err of result.errors) {
        expect(typeof err.path).toBe("string");
        expect(typeof err.message).toBe("string");
      }
    }
  });
});

// ===========================================================================
// 8. Workspace Provider — Coding Agent Context Enrichment
// ===========================================================================

describe("Workspace Provider — Coding Agent Summary", () => {
  it("builds a summary with task and session info", () => {
    const ctx = makeContext({
      taskDescription: "Implement user authentication",
      workingDirectory: "/project",
    });

    const summary = buildCodingAgentSummary(ctx);
    expect(summary).toContain("## Coding Agent Session");
    expect(summary).toContain("Implement user authentication");
    expect(summary).toContain("/project");
    expect(summary).toContain("local-fs");
    expect(summary).toContain("fully-automated");
  });

  it("includes errors from the last iteration", () => {
    const ctx = makeContext({
      iterations: [
        makeIteration({
          errors: [
            makeError({
              category: "compile",
              message: "Missing semicolon",
              filePath: "src/app.ts",
              line: 10,
            }),
          ],
        }),
      ],
    });

    const summary = buildCodingAgentSummary(ctx);
    expect(summary).toContain("### Errors to Resolve");
    expect(summary).toContain("[compile]");
    expect(summary).toContain("Missing semicolon");
    expect(summary).toContain("src/app.ts:10");
  });

  it("includes pending human feedback", () => {
    const iterationStart = nowMs() - 5000;
    const ctx = makeContext({
      iterations: [makeIteration({ startedAt: iterationStart })],
      allFeedback: [
        makeFeedback({
          id: "fb-sum-1",
          timestamp: nowMs(), // After the iteration started
          text: "Please add error handling",
          type: "guidance",
        }),
      ],
    });

    const summary = buildCodingAgentSummary(ctx);
    expect(summary).toContain("### Human Feedback");
    expect(summary).toContain("[guidance]");
    expect(summary).toContain("Please add error handling");
  });

  it("includes recent command results", () => {
    const ctx = makeContext({
      iterations: [
        makeIteration({
          commandResults: [
            makeCommandResult({ command: "npm test", success: true }),
            makeCommandResult({
              command: "tsc --noEmit",
              success: false,
              exitCode: 1,
            }),
          ],
        }),
      ],
    });

    const summary = buildCodingAgentSummary(ctx);
    expect(summary).toContain("### Recent Commands");
    expect(summary).toContain("`npm test`");
    expect(summary).toContain("OK");
    expect(summary).toContain("`tsc --noEmit`");
    expect(summary).toContain("FAIL(1)");
  });

  it("shows connector unavailable status", () => {
    const ctx = makeContext({
      connector: {
        type: "api",
        basePath: "https://api.test.com",
        available: false,
      },
    });

    const summary = buildCodingAgentSummary(ctx);
    expect(summary).toContain("unavailable");
  });

  it("shows inactive session status", () => {
    const ctx = makeContext({ active: false });
    const summary = buildCodingAgentSummary(ctx);
    expect(summary).toContain("Active:** no");
  });
});

// ===========================================================================
// 9. Workspace Provider — Utility Functions
// ===========================================================================

describe("Workspace Provider — Utility Functions", () => {
  it("truncates content beyond max length", () => {
    const long = "a".repeat(100);
    const result = truncate(long, 50);
    expect(result.length).toBeGreaterThan(50);
    expect(result).toContain("[... truncated at 50 chars]");
  });

  it("does not truncate content within max length", () => {
    const short = "hello world";
    const result = truncate(short, 100);
    expect(result).toBe("hello world");
  });

  it("builds context from workspace bootstrap files", () => {
    const files: WorkspaceBootstrapFile[] = [
      {
        name: "AGENTS.md",
        path: "/workspace/AGENTS.md",
        content: "# Agents\nYou are an AI agent.",
        missing: false,
      },
      {
        name: "TOOLS.md",
        path: "/workspace/TOOLS.md",
        content: "# Tools\nAvailable tools list.",
        missing: false,
      },
    ];

    const result = buildContext(files, 20_000);
    expect(result).toContain("## Project Context (Workspace)");
    expect(result).toContain("### AGENTS.md");
    expect(result).toContain("### TOOLS.md");
    expect(result).toContain("You are an AI agent.");
  });

  it("skips missing files in context", () => {
    const files: WorkspaceBootstrapFile[] = [
      {
        name: "AGENTS.md",
        path: "/workspace/AGENTS.md",
        content: "# Agents",
        missing: false,
      },
      {
        name: "TOOLS.md",
        path: "/workspace/TOOLS.md",
        missing: true,
      },
    ];

    const result = buildContext(files, 20_000);
    expect(result).toContain("AGENTS.md");
    expect(result).not.toContain("### TOOLS.md");
  });

  it("skips files with empty content", () => {
    const files: WorkspaceBootstrapFile[] = [
      {
        name: "AGENTS.md",
        path: "/workspace/AGENTS.md",
        content: "   ",
        missing: false,
      },
    ];

    const result = buildContext(files, 20_000);
    expect(result).toBe("");
  });

  it("returns empty string for no files", () => {
    expect(buildContext([], 20_000)).toBe("");
  });

  it("marks truncated files with a truncation notice in the text", () => {
    const files: WorkspaceBootstrapFile[] = [
      {
        name: "AGENTS.md",
        path: "/workspace/AGENTS.md",
        content: "x".repeat(1000),
        missing: false,
      },
    ];

    const result = buildContext(files, 50);
    // The truncation notice appears in the body text (not the header)
    expect(result).toContain("[... truncated at 50 chars]");
  });
});

// ===========================================================================
// 10. Integration: Full Autonomous Coding Loop Simulation
// ===========================================================================

describe("Coding Agent — Full Loop Integration", () => {
  it("simulates a complete autonomous coding loop with self-correction", () => {
    // Step 1: Create context
    let ctx = createCodingAgentContext({
      sessionId: "integration-1",
      taskDescription: "Create a user service with CRUD operations",
      workingDirectory: "/workspace/myapp",
      connectorType: "local-fs",
      connectorBasePath: "/workspace/myapp",
      maxIterations: 5,
    });

    expect(ctx.active).toBe(true);
    expect(shouldContinueLoop(ctx).shouldContinue).toBe(true);

    // Step 2: First iteration — code generation with compile error
    ctx = addIteration(
      ctx,
      makeIteration({
        index: 0,
        generatedCode: `
        export class UserService {
          create(name: string) { return { id: 1, name }; }
          get(id: number) { return null; }
        }
      `,
        fileOperations: [
          { type: "write", target: "src/services/user.ts", size: 150 },
          { type: "write", target: "src/services/user.test.ts", size: 200 },
        ],
        commandResults: [
          makeCommandResult({
            command: "tsc --noEmit",
            exitCode: 1,
            success: false,
            stderr: "TS2322: Type 'null' not assignable",
          }),
        ],
        errors: [
          makeError({
            category: "compile",
            message: "Type 'null' is not assignable to type 'User'",
          }),
        ],
      }),
    );

    expect(shouldContinueLoop(ctx).shouldContinue).toBe(true);
    expect(getUnresolvedErrors(ctx)).toHaveLength(1);

    // Step 3: Self-correction — fix type error, tests fail
    ctx = addIteration(
      ctx,
      makeIteration({
        index: 1,
        selfCorrected: false,
        fileOperations: [{ type: "edit", target: "src/services/user.ts" }],
        commandResults: [
          makeCommandResult({
            command: "tsc --noEmit",
            exitCode: 0,
            success: true,
          }),
          makeCommandResult({
            command: "npm test",
            exitCode: 1,
            success: false,
            stderr: "FAIL src/services/user.test.ts",
          }),
        ],
        errors: [
          makeError({
            category: "test",
            message: "Expected user.id to be defined",
          }),
        ],
      }),
    );

    expect(shouldContinueLoop(ctx).shouldContinue).toBe(true);

    // Step 4: Fix test — all clean
    ctx = addIteration(
      ctx,
      makeIteration({
        index: 2,
        selfCorrected: true,
        fileOperations: [{ type: "edit", target: "src/services/user.test.ts" }],
        commandResults: [
          makeCommandResult({
            command: "tsc --noEmit",
            exitCode: 0,
            success: true,
          }),
          makeCommandResult({
            command: "npm test",
            exitCode: 0,
            success: true,
            stdout: "PASS",
          }),
        ],
        errors: [],
        summary: "Fixed test assertions and type error. All tests pass.",
      }),
    );

    expect(shouldContinueLoop(ctx).shouldContinue).toBe(false);
    expect(isLastIterationClean(ctx)).toBe(true);
    expect(ctx.iterations).toHaveLength(3);

    // Validate the entire context
    const valid = validateCodingAgentContext(ctx as Record<string, unknown>);
    expect(valid.ok).toBe(true);
  });

  it("simulates human-in-the-loop with mid-task guidance", () => {
    const iterationTime = nowMs() - 10_000; // Iteration started 10s ago

    let ctx = createCodingAgentContext({
      sessionId: "hitl-integration",
      taskDescription: "Build API endpoint",
      workingDirectory: "/workspace",
      connectorType: "local-fs",
      connectorBasePath: "/workspace",
      interactionMode: "human-in-the-loop",
      maxIterations: 5,
    });

    // Iteration 0: Initial generation (started in the past)
    ctx = addIteration(
      ctx,
      makeIteration({
        index: 0,
        startedAt: iterationTime,
        completedAt: iterationTime + 2000,
        commandResults: [
          makeCommandResult({
            command: "tsc --noEmit",
            exitCode: 0,
            success: true,
          }),
        ],
        errors: [],
      }),
    );

    // User provides feedback AFTER the iteration started
    ctx = injectFeedback(
      ctx,
      makeFeedback({
        id: "hitl-fb-1",
        timestamp: nowMs(), // Now — clearly after the iteration
        text: "Good start, but please add input validation using zod",
        type: "guidance",
      }),
    );

    // The user feedback doesn't trigger errors, so the loop would stop.
    // But in a real implementation, the orchestrator would see the pending
    // feedback and start a new iteration. We verify the context is valid.
    const valid = validateCodingAgentContext(ctx as Record<string, unknown>);
    expect(valid.ok).toBe(true);
    expect(ctx.allFeedback).toHaveLength(1);
    expect(ctx.iterations).toHaveLength(1);

    // Build summary to verify feedback appears (timestamp is after iteration start)
    const summary = buildCodingAgentSummary(ctx);
    expect(summary).toContain("input validation using zod");
  });

  it("simulates connector switching mid-session (local-fs → git-repo)", () => {
    let ctx = createCodingAgentContext({
      sessionId: "connector-switch",
      taskDescription: "Clone and fix repo",
      workingDirectory: "/tmp/checkout",
      connectorType: "git-repo",
      connectorBasePath: "https://github.com/test/repo",
    });

    expect(ctx.connector.type).toBe("git-repo");

    // After cloning, operations are done on local-fs
    ctx = {
      ...ctx,
      connector: {
        type: "local-fs",
        basePath: "/tmp/checkout",
        available: true,
      },
    };

    ctx = addIteration(
      ctx,
      makeIteration({
        index: 0,
        fileOperations: [
          { type: "read", target: "package.json" },
          { type: "edit", target: "src/bug.ts" },
        ],
        commandResults: [
          makeCommandResult({ command: "git diff", success: true }),
        ],
        errors: [],
      }),
    );

    expect(ctx.connector.type).toBe("local-fs");
    expect(isLastIterationClean(ctx)).toBe(true);
  });
});

// ===========================================================================
// 11. Edge Cases
// ===========================================================================

describe("Coding Agent — Edge Cases", () => {
  it("handles context with max iterations of 1", () => {
    let ctx = makeContext({ maxIterations: 1 });
    ctx = addIteration(ctx, makeIteration({ errors: [makeError()] }));

    expect(hasReachedMaxIterations(ctx)).toBe(true);
    expect(shouldContinueLoop(ctx).shouldContinue).toBe(false);
  });

  it("handles empty iteration arrays in all fields", () => {
    const iteration = makeIteration({
      fileOperations: [],
      commandResults: [],
      errors: [],
      feedback: [],
    });

    const result = CodingIterationSchema.safeParse(iteration);
    expect(result.success).toBe(true);
  });

  it("handles large iteration counts", () => {
    let ctx = makeContext({ maxIterations: 100 });
    for (let i = 0; i < 50; i++) {
      ctx = addIteration(
        ctx,
        makeIteration({
          index: i,
          errors: [makeError()],
        }),
      );
    }

    expect(ctx.iterations).toHaveLength(50);
    expect(hasReachedMaxIterations(ctx)).toBe(false);
    expect(shouldContinueLoop(ctx).shouldContinue).toBe(true);
  });

  it("handles feedback with very long text", () => {
    const longText = "a".repeat(10000);
    const fb = makeFeedback({ text: longText });
    const result = HumanFeedbackSchema.safeParse(fb);
    expect(result.success).toBe(true);
  });

  it("handles command with very long output", () => {
    const longOutput = "line\n".repeat(5000);
    const cmd = makeCommandResult({ stdout: longOutput });
    const result = CommandResultSchema.safeParse(cmd);
    expect(result.success).toBe(true);
  });

  it("handles error without optional fields", () => {
    const err: CapturedError = {
      category: "other",
      message: "Unknown error occurred",
    };
    const result = CapturedErrorSchema.safeParse(err);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filePath).toBeUndefined();
      expect(result.data.line).toBeUndefined();
      expect(result.data.raw).toBeUndefined();
    }
  });

  it("preserves immutability — addIteration returns new context", () => {
    const ctx1 = makeContext();
    const ctx2 = addIteration(ctx1, makeIteration({ index: 0 }));

    expect(ctx1.iterations).toHaveLength(0);
    expect(ctx2.iterations).toHaveLength(1);
    expect(ctx1).not.toBe(ctx2);
  });

  it("preserves immutability — injectFeedback returns new context", () => {
    const ctx1 = makeContext();
    const ctx2 = injectFeedback(ctx1, makeFeedback());

    expect(ctx1.allFeedback).toHaveLength(0);
    expect(ctx2.allFeedback).toHaveLength(1);
    expect(ctx1).not.toBe(ctx2);
  });
});
