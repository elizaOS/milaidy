// @vitest-environment jsdom
import crypto from "node:crypto";
import React, {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  type CreateTriggerRequest,
  MiladyClient,
  type TriggerHealthSnapshot,
  type TriggerRunRecord,
  type TriggerSummary,
  type UpdateTriggerRequest,
} from "../../src/api-client";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

import { TriggersView } from "../../src/components/TriggersView";

interface TriggerViewContextShape {
  triggers: TriggerSummary[];
  triggersLoading: boolean;
  triggersSaving: boolean;
  triggerRunsById: Record<string, TriggerRunRecord[]>;
  triggerHealth: TriggerHealthSnapshot | null;
  triggerError: string | null;
  loadTriggers: () => Promise<void>;
  createTrigger: (
    request: CreateTriggerRequest,
  ) => Promise<TriggerSummary | null>;
  updateTrigger: (
    id: string,
    request: UpdateTriggerRequest,
  ) => Promise<TriggerSummary | null>;
  deleteTrigger: (id: string) => Promise<boolean>;
  runTriggerNow: (id: string) => Promise<boolean>;
  loadTriggerRuns: (id: string) => Promise<void>;
  loadTriggerHealth: () => Promise<void>;
}

type UUID = string;

type TaskMetadataValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | TaskMetadataValue[]
  | { [key: string]: TaskMetadataValue };

interface TaskRecord {
  id?: UUID;
  name: string;
  description?: string;
  tags?: string[];
  roomId?: UUID;
  metadata?: { [key: string]: TaskMetadataValue };
}

interface RuntimeLike {
  agentId: UUID;
  character: { name: string };
  getSetting: (key: string) => string | number | boolean | undefined;
  getService: (serviceType: string) => object | null;
  getTasks: (query?: { tags?: string[] }) => Promise<TaskRecord[]>;
  getTask: (taskId: UUID) => Promise<TaskRecord | null>;
  getRoomsByWorld: () => Promise<object[]>;
  createTask: (task: TaskRecord) => Promise<UUID>;
  updateTask: (taskId: UUID, update: Partial<TaskRecord>) => Promise<void>;
  deleteTask: (taskId: UUID) => Promise<void>;
  createMemory: () => Promise<void>;
  getTaskWorker: () => null;
  registerTaskWorker: () => void;
  logger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

interface TriggerRuntimeHarness {
  runtime: RuntimeLike;
  injectAutonomousInstruction: ReturnType<typeof vi.fn>;
}

function createTriggerRuntimeHarness(): TriggerRuntimeHarness {
  let tasks: TaskRecord[] = [];
  const injectAutonomousInstruction = vi.fn(
    async (_params: {
      instructions: string;
      source: string;
      wakeMode: "inject_now" | "next_autonomy_cycle";
      triggerId: UUID;
      triggerTaskId: UUID;
    }) => undefined,
  );

  const runtime: RuntimeLike = {
    agentId: "00000000-0000-0000-0000-000000000001",
    character: { name: "TriggerUiE2E" },
    getSetting: (_key: string) => undefined,
    getService: (serviceType: string) => {
      if (serviceType !== "AUTONOMY") return null;
      return {
        getAutonomousRoomId: () => "00000000-0000-0000-0000-000000000201",
        injectAutonomousInstruction,
      } as {
        getAutonomousRoomId: () => UUID;
        injectAutonomousInstruction: (params: {
          instructions: string;
          source: string;
          wakeMode: "inject_now" | "next_autonomy_cycle";
          triggerId: UUID;
          triggerTaskId: UUID;
        }) => Promise<void>;
      };
    },
    getTasks: async (query?: { tags?: string[] }) => {
      if (!query?.tags || query.tags.length === 0) return tasks;
      return tasks.filter((task) =>
        query.tags?.every((tag) => task.tags?.includes(tag)),
      );
    },
    getTask: async (taskId: UUID) =>
      tasks.find((task) => task.id === taskId) ?? null,
    getRoomsByWorld: async () => [],
    createTask: async (task: TaskRecord) => {
      const id = crypto.randomUUID();
      const created: TaskRecord = {
        ...task,
        id,
      };
      tasks.push(created);
      return id;
    },
    updateTask: async (taskId: UUID, update: Partial<TaskRecord>) => {
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
    deleteTask: async (taskId: UUID) => {
      tasks = tasks.filter((task) => task.id !== taskId);
    },
    createMemory: vi.fn(async () => undefined),
    getTaskWorker: () => null,
    registerTaskWorker: () => undefined,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };

  return {
    runtime,
    injectAutonomousInstruction,
  };
}

function sortTriggers(items: TriggerSummary[]): TriggerSummary[] {
  return [...items].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function TriggerUiHarness(props: { client: MiladyClient }): ReactElement {
  const { client } = props;
  const [triggers, setTriggers] = useState<TriggerSummary[]>([]);
  const [triggersLoading, setTriggersLoading] = useState(false);
  const [triggersSaving, setTriggersSaving] = useState(false);
  const [triggerRunsById, setTriggerRunsById] = useState<
    Record<string, TriggerRunRecord[]>
  >({});
  const [triggerHealth, setTriggerHealth] =
    useState<TriggerHealthSnapshot | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const loadTriggers = useCallback(async () => {
    setTriggersLoading(true);
    try {
      const response = await client.getTriggers();
      setTriggers(sortTriggers(response.triggers));
      setTriggerError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load triggers";
      setTriggerError(message);
      setTriggers([]);
    } finally {
      setTriggersLoading(false);
    }
  }, [client]);

  const loadTriggerHealth = useCallback(async () => {
    try {
      const health = await client.getTriggerHealth();
      setTriggerHealth(health);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load trigger health";
      setTriggerError(message);
      setTriggerHealth(null);
    }
  }, [client]);

  const loadTriggerRuns = useCallback(
    async (id: string) => {
      try {
        const response = await client.getTriggerRuns(id);
        setTriggerRunsById((prev) => ({
          ...prev,
          [id]: response.runs,
        }));
        setTriggerError(null);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load trigger runs";
        setTriggerError(message);
      }
    },
    [client],
  );

  const createTrigger = useCallback(
    async (request: CreateTriggerRequest): Promise<TriggerSummary | null> => {
      setTriggersSaving(true);
      try {
        const response = await client.createTrigger(request);
        const created = response.trigger;
        setTriggers((prev) => sortTriggers([...prev, created]));
        setTriggerError(null);
        await loadTriggerHealth();
        return created;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create trigger";
        setTriggerError(message);
        return null;
      } finally {
        setTriggersSaving(false);
      }
    },
    [client, loadTriggerHealth],
  );

  const updateTrigger = useCallback(
    async (
      id: string,
      request: UpdateTriggerRequest,
    ): Promise<TriggerSummary | null> => {
      setTriggersSaving(true);
      try {
        const response = await client.updateTrigger(id, request);
        const updated = response.trigger;
        setTriggers((prev) =>
          sortTriggers(
            prev.map((item) => (item.id === updated.id ? updated : item)),
          ),
        );
        setTriggerError(null);
        await loadTriggerHealth();
        return updated;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to update trigger";
        setTriggerError(message);
        return null;
      } finally {
        setTriggersSaving(false);
      }
    },
    [client, loadTriggerHealth],
  );

  const deleteTrigger = useCallback(
    async (id: string): Promise<boolean> => {
      setTriggersSaving(true);
      try {
        await client.deleteTrigger(id);
        setTriggers((prev) => prev.filter((item) => item.id !== id));
        setTriggerRunsById((prev) => {
          const next: Record<string, TriggerRunRecord[]> = {};
          for (const [key, value] of Object.entries(prev)) {
            if (key !== id) next[key] = value;
          }
          return next;
        });
        setTriggerError(null);
        await loadTriggerHealth();
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete trigger";
        setTriggerError(message);
        return false;
      } finally {
        setTriggersSaving(false);
      }
    },
    [client, loadTriggerHealth],
  );

  const runTriggerNow = useCallback(
    async (id: string): Promise<boolean> => {
      setTriggersSaving(true);
      try {
        const response = await client.runTriggerNow(id);
        if (response.trigger) {
          setTriggers((prev) =>
            sortTriggers(
              prev.map((item) =>
                item.id === response.trigger?.id ? response.trigger : item,
              ),
            ),
          );
        } else {
          await loadTriggers();
        }
        await loadTriggerRuns(id);
        await loadTriggerHealth();
        setTriggerError(null);
        return response.ok;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to run trigger";
        setTriggerError(message);
        return false;
      } finally {
        setTriggersSaving(false);
      }
    },
    [client, loadTriggerHealth, loadTriggerRuns, loadTriggers],
  );

  useEffect(() => {
    void loadTriggers();
    void loadTriggerHealth();
  }, [loadTriggers, loadTriggerHealth]);

  const appContext = useMemo<TriggerViewContextShape>(
    () => ({
      triggers,
      triggersLoading,
      triggersSaving,
      triggerRunsById,
      triggerHealth,
      triggerError,
      loadTriggers,
      createTrigger,
      updateTrigger,
      deleteTrigger,
      runTriggerNow,
      loadTriggerRuns,
      loadTriggerHealth,
    }),
    [
      triggers,
      triggersLoading,
      triggersSaving,
      triggerRunsById,
      triggerHealth,
      triggerError,
      loadTriggers,
      createTrigger,
      updateTrigger,
      deleteTrigger,
      runTriggerNow,
      loadTriggerRuns,
      loadTriggerHealth,
    ],
  );

  mockUseApp.mockReturnValue(appContext);
  return React.createElement(TriggersView);
}

function nodeText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : ""))
    .join("")
    .trim();
}

function findButtonByText(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "button" && nodeText(node) === label,
  );
  if (!matches[0]) throw new Error(`Button "${label}" not found`);
  return matches[0];
}

function findInputByPlaceholder(
  root: TestRenderer.ReactTestInstance,
  placeholder: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "input" && node.props.placeholder === placeholder,
  );
  if (!matches[0]) throw new Error(`Input "${placeholder}" not found`);
  return matches[0];
}

function findTextareaByPlaceholder(
  root: TestRenderer.ReactTestInstance,
  placeholder: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) =>
      node.type === "textarea" && node.props.placeholder === placeholder,
  );
  if (!matches[0]) throw new Error(`Textarea "${placeholder}" not found`);
  return matches[0];
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("TriggersView UI E2E", () => {
  let server: { port: number; close: () => Promise<void> } | null = null;
  let runtimeHarness: TriggerRuntimeHarness;
  let startApiServerFn:
    | ((options?: {
        port?: number;
        runtime?: object;
      }) => Promise<{ port: number; close: () => Promise<void> }>)
    | null = null;

  beforeAll(async () => {
    const serverModule = await import("../../../../src/api/server");
    startApiServerFn = serverModule.startApiServer;
    if (!startApiServerFn) {
      throw new Error("Failed to load startApiServer");
    }

    runtimeHarness = createTriggerRuntimeHarness();
    server = await startApiServerFn({
      port: 0,
      runtime: runtimeHarness.runtime,
    });
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  beforeEach(() => {
    mockUseApp.mockReset();
    runtimeHarness.injectAutonomousInstruction.mockClear();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    Object.defineProperty(window, "scrollTo", {
      value: vi.fn(),
      writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates, updates, executes, inspects runs, and deletes triggers via live API", async () => {
    if (!server) {
      throw new Error("Server was not initialized");
    }

    const client = new MiladyClient(`http://127.0.0.1:${server.port}`);
    const triggerDisplayName = "Trigger UI E2E";

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(TriggerUiHarness, { client }),
      );
    });
    await flush();

    const root = tree?.root;
    const displayNameInput = findInputByPlaceholder(
      root,
      "e.g. Daily Digest, Heartbeat Check",
    );
    const instructionsInput = findTextareaByPlaceholder(
      root,
      "What should the agent do when this trigger fires?",
    );

    await act(async () => {
      displayNameInput.props.onChange({
        target: { value: triggerDisplayName },
      });
      instructionsInput.props.onChange({
        target: { value: "Execute this UI E2E trigger task" },
      });
    });

    await act(async () => {
      await findButtonByText(root, "Create Trigger").props.onClick();
    });
    await flush();

    expect(
      root.findAll(
        (node) => node.type === "span" && nodeText(node) === triggerDisplayName,
      ).length,
    ).toBe(1);

    const renamedTriggerDisplayName = "Trigger UI E2E Updated";
    await act(async () => {
      await findButtonByText(root, "Edit").props.onClick();
    });
    await flush();

    await act(async () => {
      displayNameInput.props.onChange({
        target: { value: renamedTriggerDisplayName },
      });
    });

    await act(async () => {
      await findButtonByText(root, "Save Changes").props.onClick();
    });
    await flush();

    expect(
      root.findAll(
        (node) =>
          node.type === "span" && nodeText(node) === renamedTriggerDisplayName,
      ).length,
    ).toBe(1);

    await act(async () => {
      await findButtonByText(root, "Run now").props.onClick();
    });
    await flush();

    expect(runtimeHarness.injectAutonomousInstruction).toHaveBeenCalledTimes(1);

    await act(async () => {
      await findButtonByText(root, "Runs").props.onClick();
    });
    await flush();

    const successRows = root.findAll(
      (node) => node.type === "span" && nodeText(node).includes("success"),
    );
    expect(successRows.length).toBeGreaterThan(0);

    await act(async () => {
      await findButtonByText(root, "Delete").props.onClick();
    });
    await flush();

    expect(
      root.findAll(
        (node) =>
          node.type === "span" && nodeText(node) === renamedTriggerDisplayName,
      ).length,
    ).toBe(0);
  });
});
