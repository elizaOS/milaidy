import type { AgentRuntime, Task, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  CompanionStateResponse,
  RunCompanionActionResponse,
  UpdateCompanionSettingsResponse,
} from "../contracts/companion.js";
import { COMPANION_STATE_METADATA_KEY } from "../services/companion-engine.js";
import { createRouteInvoker } from "../test-support/route-test-helpers.js";
import {
  applyCompanionSignalMutation,
  handleCompanionRoutes,
  runCompanionMinuteTick,
} from "./companion-routes.js";

describe("companion-routes", () => {
  let tasks: Task[];
  let runtime: AgentRuntime;
  let broadcasted: Array<Record<string, unknown>>;

  const readCompanionTask = (): Task | undefined =>
    tasks.find(
      (task) =>
        Array.isArray(task.tags) &&
        task.tags.some(
          (tag) =>
            typeof tag === "string" &&
            tag.toLowerCase() === "milady-companion",
        ),
    );

  beforeEach(() => {
    tasks = [];
    broadcasted = [];

    const runtimePartial: Partial<AgentRuntime> = {
      agentId: "00000000-0000-0000-0000-000000000123" as UUID,
      getTasks: async () => tasks,
      getTask: async (taskId: UUID) =>
        tasks.find((task) => task.id === taskId) ?? null,
      createTask: async (task) => {
        const id =
          `00000000-0000-0000-0000-${String(tasks.length + 1).padStart(12, "0")}` as UUID;
        tasks.push({ ...task, id });
        return id;
      },
      updateTask: async (taskId: UUID, update) => {
        tasks = tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                ...update,
                metadata: {
                  ...(task.metadata ?? {}),
                  ...(update.metadata ?? {}),
                },
              }
            : task,
        );
      },
    };
    runtime = runtimePartial as AgentRuntime;
  });

  const invoke = createRouteInvoker<
    Record<string, string | number | boolean | object | null | undefined>,
    AgentRuntime | null,
    Record<string, unknown>
  >(
    async (ctx) => {
      const requestUrl = new URL(
        typeof ctx.req.url === "string" ? ctx.req.url : ctx.pathname,
        "http://localhost:2138",
      );
      return handleCompanionRoutes({
        req: ctx.req,
        res: ctx.res,
        method: ctx.method,
        pathname: ctx.pathname,
        url: requestUrl,
        runtime: ctx.runtime,
        readJsonBody: async () => ctx.readJsonBody(),
        json: (res, data, status) => ctx.json(res, data, status),
        error: (res, message, status) => ctx.error(res, message, status),
        broadcastWs: (data) => {
          broadcasted.push(data);
        },
      });
    },
    { runtimeProvider: () => runtime },
  );

  it("returns false for non-companion paths", async () => {
    const result = await invoke({ method: "GET", pathname: "/api/status" });
    expect(result.handled).toBe(false);
  });

  it("returns 503 when runtime is missing", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/companion/state",
      runtimeOverride: null,
    });
    expect(result.handled).toBe(true);
    expect(result.status).toBe(503);
  });

  it("initializes state on first GET and persists companion task", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/companion/state",
    });

    expect(result.status).toBe(200);
    const payload = result.payload as CompanionStateResponse;
    expect(payload.snapshot.state.level).toBe(1);

    const task = readCompanionTask();
    expect(task).toBeDefined();
    expect(task?.metadata).toBeDefined();
    expect(
      (task?.metadata as Record<string, unknown>)[COMPANION_STATE_METADATA_KEY],
    ).toBeDefined();
  });

  it("validates action payload and enforces cooldown", async () => {
    await invoke({ method: "GET", pathname: "/api/companion/state" });

    const invalid = await invoke({
      method: "POST",
      pathname: "/api/companion/actions",
      body: { action: "dance" },
    });
    expect(invalid.status).toBe(400);

    const first = await invoke({
      method: "POST",
      pathname: "/api/companion/actions",
      body: { action: "feed" },
    });
    expect(first.status).toBe(200);

    const second = await invoke({
      method: "POST",
      pathname: "/api/companion/actions",
      body: { action: "feed" },
    });
    expect(second.status).toBe(409);
    const payload = second.payload as RunCompanionActionResponse;
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain("cooldown");
  });

  it("writes settings updates and emits websocket snapshot", async () => {
    await invoke({ method: "GET", pathname: "/api/companion/state" });

    const result = await invoke({
      method: "PUT",
      pathname: "/api/companion/settings",
      body: {
        timezone: "America/Los_Angeles",
        autopostEnabled: false,
        autopostDryRun: false,
        policyLevel: "strict",
        quietHours: { start: 2, end: 9 },
      },
    });

    expect(result.status).toBe(200);
    const payload = result.payload as UpdateCompanionSettingsResponse;
    expect(payload.snapshot.state.daily.timezone).toBe("America/Los_Angeles");
    expect(payload.snapshot.state.autopost.enabled).toBe(false);
    expect(payload.snapshot.state.autopost.policyLevel).toBe("strict");
    expect(broadcasted.some((item) => item.type === "companion-state")).toBe(
      true,
    );
  });

  it("supports activity endpoint limit and signal mutation", async () => {
    await invoke({ method: "GET", pathname: "/api/companion/state" });

    await applyCompanionSignalMutation({
      runtime,
      signal: "external-source",
      broadcastWs: (data) => {
        broadcasted.push(data);
      },
    });

    const activity = await invoke({
      method: "GET",
      pathname: "/api/companion/activity",
      url: "/api/companion/activity?limit=1",
    });

    expect(activity.status).toBe(200);
    const events = (activity.payload.activity as Array<{ kind: string }>) ?? [];
    expect(events.length).toBe(1);
    expect(events[0].kind).toMatch(
      /signal|decay|action|settings|autopost|level-up|system/,
    );
  });

  it("runs minute tick and updates autopost timing when eligible", async () => {
    await invoke({ method: "GET", pathname: "/api/companion/state" });
    const task = readCompanionTask();
    expect(task).toBeDefined();

    const metadata = (task?.metadata as Record<string, unknown>) ?? {};
    const state = metadata[COMPANION_STATE_METADATA_KEY] as Record<
      string,
      unknown
    >;
    state.autopost = {
      ...(state.autopost as Record<string, unknown>),
      enabled: true,
      dryRun: true,
      nextAttemptAtMs: Date.now() - 1_000,
      pauseUntilMs: null,
    };
    state.stats = {
      ...(state.stats as Record<string, unknown>),
      mood: 80,
      hunger: 80,
      energy: 80,
      social: 80,
    };

    await runCompanionMinuteTick({
      runtime,
      broadcastWs: (data) => {
        broadcasted.push(data);
      },
    });

    const updatedTask = readCompanionTask();
    const updatedState = ((updatedTask?.metadata as Record<string, unknown>)[
      COMPANION_STATE_METADATA_KEY
    ] ?? {}) as Record<string, unknown>;

    const autopost = (updatedState.autopost ?? {}) as Record<string, unknown>;
    expect(typeof autopost.lastAttemptAtMs).toBe("number");
  });
});
