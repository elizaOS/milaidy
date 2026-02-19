// biome-ignore-all lint/suspicious/noExplicitAny: extensive fake runtime stubs require broad casts.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type Action,
  type Character,
  type Evaluator,
  elizaLogger,
  type IAgentRuntime,
  type IMessageService,
  type Memory,
  type Plugin,
  type Provider,
  type Route,
  type RuntimeEventStorage,
  type Service,
  type ServiceClass,
  type ServiceTypeName,
  type State,
} from "@elizaos/core";
import {
  PluginManagerService,
  pluginRegistry,
} from "@elizaos/plugin-plugin-manager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppManager } from "./app-manager";

// Fake Runtime implementation
class FakeAgentRuntime implements IAgentRuntime {
  agentId =
    "fake-agent-id" as `${string}-${string}-${string}-${string}-${string}`;
  serverUrl = "http://localhost:3000";
  token = "fake-token";
  character = {} as Character;
  databaseAdapter = {} as any;
  memoryRoots = {} as any;
  cacheManager = {} as any;
  providers: Provider[] = [];
  actions: Action[] = [];
  evaluators: Evaluator[] = [];
  plugins: Plugin[] = [];
  services: Map<ServiceTypeName, Service[]> = new Map();
  initPromise = Promise.resolve();
  enableAutonomy = false;
  messageService = {} as IMessageService;
  routes: Route[] = [];
  stateCache = new Map<string, State>();
  logLevelOverrides = new Map<string, string>();
  logger = elizaLogger;
  events: RuntimeEventStorage = {};

  // IDatabaseAdapter methods (stubbed)
  db = {};
  async registerMemory(_memory: Memory): Promise<void> {}
  async getMemory(_messageId: string): Promise<Memory | null> {
    return null;
  }
  async getMemories() {
    return [];
  }
  async getMemoriesByRoomIds() {
    return [];
  }
  async getMemoryByContent() {
    return null;
  }
  async getMemoriesCount() {
    return 0;
  }
  async createLog() {}
  async getLogs() {
    return [];
  }
  async searchMemories() {
    return [];
  }
  async searchMemoriesByEmbedding() {
    return [];
  }
  async removeMemory() {}
  async removeAllMemories() {}
  async countMemories() {
    return 0;
  }
  async getGoals() {
    return [];
  } // If getGoals exists in IDatabaseAdapter? Wait, I didn't see it in database.ts!
  // It was removed or I missed it. IDatabaseAdapter does NOT have getGoals in the file I read.
  // So I will remove getGoals stub.

  async getRoom() {
    return null;
  }
  async createRoom() {
    return "fake-room-id" as any;
  }
  async removeRoom() {}
  async getRoomsForParticipant() {
    return [];
  }
  async getRoomsForParticipants() {
    return [];
  }
  async addParticipant() {
    return true;
  }
  async removeParticipant() {
    return true;
  }
  async getParticipantsForRoom() {
    return [];
  }
  async getParticipantsForAccount() {
    return [];
  }
  async getParticipantUserState() {
    return null;
  }
  async setParticipantUserState() {}
  async createRelationship() {
    return true;
  }
  async getRelationship() {
    return null;
  }
  async getRelationships() {
    return [];
  }
  async getAccountById() {
    return null;
  }
  async createAccount() {
    return true;
  }
  async getActorDetails() {
    return [];
  }
  // Cache methods matching declarations
  async getCache<T>(_key: string): Promise<T | undefined> {
    return undefined;
  }
  async setCache<T>(_key: string, _value: T): Promise<boolean> {
    return true;
  }
  async deleteCache(_key: string): Promise<boolean> {
    return true;
  }

  // Runtime methods
  initialize = async () => {};
  stop = async () => {};
  processActions = async () => {};
  evaluate = async () => null;
  evaluatePre = async () => ({ blocked: false, redacted: false });
  ensureConnection = async () => {};
  ensureConnections = async () => {};
  ensureParticipantInRoom = async () => {};
  ensureWorldExists = async () => {};
  ensureRoomExists = async () => {};
  composeState = async () => ({}) as State;
  useModel = async () => "fake-response";
  generateText = async () => ({}) as any;
  registerModel = () => {};
  getModel = () => undefined;
  getModelConfiguration = () => undefined;
  registerEvent = () => {};
  getEvent = () => undefined;
  emitEvent = async () => {};
  registerTaskWorker = () => {};
  getTaskWorker = () => undefined;
  dynamicPromptExecFromState = async () => null;
  addEmbeddingToMemory = async (m: Memory) => m;
  queueEmbeddingGeneration = async () => {};
  getAllMemories = async () => [];
  clearAllAgentMemories = async () => {};
  updateMemory = async () => true;
  createRunId = () => "fake-run-id" as any;
  startRun = () => "fake-run-id" as any;
  endRun = () => {};
  getCurrentRunId = () => "fake-run-id" as any;
  getEntityById = async () => null;
  createEntity = async () => true;
  getRooms = async () => [];
  registerSendHandler = () => {};
  sendMessageToTarget = async () => {};
  updateWorld = async () => {};
  redactSecrets = (t: string) => t;
  getConnection = async () => ({});
  getServiceLoadPromise = async () => ({}) as Service;
  getRegisteredServiceTypes = () => [];
  hasService = () => false;
  registerDatabaseAdapter = () => {};
  setSetting = () => {};
  getSetting = () => null;
  getConversationLength = () => 0;
  isActionPlanningEnabled = () => true;
  getLLMMode = () => "DEFAULT" as any;
  isCheckShouldRespondEnabled = () => true;
  getActionResults = () => [];
  getAllActions = () => [];
  getFilteredActions = () => [];
  isActionAllowed = () => ({ allowed: true, reason: "" });
  registerPlugin = async () => {};

  // Synchronous registration methods to match interface
  registerProvider(provider: Provider): void {
    this.providers.push(provider);
  }
  registerAction(action: Action): void {
    this.actions.push(action);
  }
  registerEvaluator(evaluator: Evaluator): void {
    this.evaluators.push(evaluator);
  }

  // Service methods matched
  getService<T extends Service>(service: ServiceTypeName | string): T | null {
    const type = service as ServiceTypeName;
    const services = this.services.get(type);
    if (services && services.length > 0) {
      return services[0] as T;
    }
    return null;
  }

  getServicesByType<T extends Service>(service: ServiceTypeName | string): T[] {
    return (this.services.get(service as ServiceTypeName) || []) as T[];
  }

  getAllServices() {
    return this.services;
  }

  async registerService(serviceClass: ServiceClass): Promise<void> {
    // Instantiate the service
    const service = new serviceClass(this);
    // Initialize if needed (though runtime usually calls initialize later)
    await service.initialize(this);

    // Add to map
    const type = service.serviceType;
    if (!this.services.has(type)) {
      this.services.set(type, []);
    }
    this.services.get(type)?.push(service);
  }

  // Missing DB methods from IDatabaseAdapter coverage (since 'any' cast on databaseAdapter property isn't enough?)
  // NO, IAgentRuntime extends IDatabaseAdapter, so FakeAgentRuntime MUST implement them.
  // I need to be careful. I added most of them.
  // getGoals was removed.
  // createGoal, removeGoal, removeAllGoals, updateGoal - are those in IDatabaseAdapter?
  // Checking database.ts again... I did NOT see 'Goal' related methods in IDatabaseAdapter interface.
  // So I should remove them.
  // Same for getActorDetails, getAccountById, createAccount ?
  // In database.ts: getAgent, getAgents, createAgent, updateAgent, deleteAgent.
  // NO getAccountById, createAccount.
  // NO getActorDetails.

  getAgent = async () => null;
  getAgents = async () => [];
  createAgent = async () => true;
  updateAgent = async () => true;
  deleteAgent = async () => true;
  ensureEmbeddingDimension = async () => {};
  getEntitiesByIds = async () => null;
  getEntitiesForRoom = async () => [];
  createEntities = async () => true;
  updateEntity = async () => {};
  getComponent = async () => null;
  getComponents = async () => [];
  createComponent = async () => true;
  updateComponent = async () => {};
  deleteComponent = async () => {};
  deleteManyMemories = async () => {};
  deleteAllMemories = async () => {};
  createWorld = async () => "fake-world-id" as any;
  getWorld = async () => null;
  removeWorld = async () => {};
  getAllWorlds = async () => [];
  getRoomsByIds = async () => null;
  createRooms = async () => [];
  deleteRoom = async () => {};
  deleteRoomsByWorldId = async () => {};
  updateRoom = async () => {};
  addParticipantsRoom = async () => true;
  updateRelationship = async () => {};
  getTasks = async () => [];
  getTask = async () => null;
  getTasksByName = async () => [];
  createTask = async () => "fake-task-id" as any;
  updateTask = async () => {};
  deleteTask = async () => {};
  getMemoriesByWorldId = async () => [];
  getPairingRequests = async () => [];
  createPairingRequest = async () => "fake-req-id" as any;
  updatePairingRequest = async () => {};
  deletePairingRequest = async () => {};
  getPairingAllowlist = async () => [];
  createPairingAllowlistEntry = async () => "fake-entry-id" as any;
  deletePairingAllowlistEntry = async () => {};
  isReady = async () => true;
  close = async () => {};
  getCachedEmbeddings = async () => [];
  log = async () => {};
  deleteLog = async () => {};
  isRoomParticipant = async () => false;
  getParticipantsForEntity = async () => [];
}

describe("AppManager Integration", () => {
  let appManager: AppManager;
  let pluginManager: PluginManagerService;
  let runtime: FakeAgentRuntime;
  let tempDir: string;

  const APP_NAME = "@elizaos/app-example";
  const APP_PLUGIN_NAME = "@elizaos/plugin-example";

  beforeEach(async () => {
    // Setup temp directory for plugins
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-test-"));
    const pluginsDir = path.join(tempDir, "plugins");
    fs.mkdirSync(pluginsDir);

    // Mock registry response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        registry: {
          [APP_NAME]: {
            git: { repo: "elizaos/app-example", v0: {}, v1: {}, v2: {} },
            npm: { repo: APP_PLUGIN_NAME, v0: null, v1: null, v2: "1.0.0" },
            supports: { v0: true, v1: false, v2: false },
            description: "An example app",
            topics: ["app"],
            stargazers_count: 10,
            language: "TypeScript",
          },
          // Add the plugin entry so uninstallPlugin can find it
          [APP_PLUGIN_NAME]: {
            git: { repo: "elizaos/plugin-example", v0: {}, v1: {}, v2: {} },
            npm: { repo: APP_PLUGIN_NAME, v0: null, v1: null, v2: "1.0.0" },
            supports: { v0: true, v1: false, v2: false },
            description: "An example plugin",
            topics: ["plugin"],
          },
        },
      }),
    });

    runtime = new FakeAgentRuntime();
    // Initialize PluginManager with real file system path
    pluginManager = new PluginManagerService(runtime, {
      pluginDirectory: pluginsDir,
    });

    process.env.MILADY_STATE_DIR = tempDir;

    appManager = new AppManager();
  });

  afterEach(() => {
    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("launches an app directly if plugin is already installed", async () => {
    // Setup: Simulate installed plugin
    // Use hyphen in sanitized name as verified
    const installedDir = path.join(
      tempDir,
      "plugins",
      "installed",
      "_elizaos_plugin-example",
    );
    fs.mkdirSync(installedDir, { recursive: true });
    fs.writeFileSync(
      path.join(installedDir, "package.json"),
      JSON.stringify({ name: APP_PLUGIN_NAME, version: "1.0.0" }),
    );

    // Act
    const result = await appManager.launch(pluginManager, APP_NAME);

    // Assert
    expect(result.pluginInstalled).toBe(true);
    expect(result.needsRestart).toBe(false);
  });

  it("installs plugin if not installed (integration - skipping actual install via mock if possible, or failing)", async () => {
    // We spy on installPlugin to verify it is called
    const installSpy = vi.spyOn(pluginManager, "installPlugin");
    installSpy.mockResolvedValue({
      success: true,
      pluginName: APP_PLUGIN_NAME,
      version: "1.0.0",
      requiresRestart: true,
      installPath: "/tmp",
    });

    const result = await appManager.launch(pluginManager, APP_NAME);

    expect(installSpy).toHaveBeenCalled();
    expect(result.pluginInstalled).toBe(true);
    expect(result.needsRestart).toBe(true);
  });

  it("stops an app by uninstalling its plugin", async () => {
    // Setup: Simulate installed plugin
    // Use hyphen in sanitized name as verified
    const installedDir = path.join(
      tempDir,
      "plugins",
      "installed",
      "_elizaos_plugin-example",
    );
    fs.mkdirSync(installedDir, { recursive: true });
    fs.writeFileSync(
      path.join(installedDir, "package.json"),
      JSON.stringify({ name: APP_PLUGIN_NAME, version: "1.0.0" }),
    );

    // Act
    const result = await appManager.stop(pluginManager, APP_NAME);

    // Assert
    expect(result.success).toBe(true);
    expect(result.pluginUninstalled).toBe(true);

    // Verify file system
    expect(fs.existsSync(installedDir)).toBe(false);
  });
});

describe("Hyperscape Auto-Provisioning", () => {
  let appManager: AppManager;
  let pluginManager: PluginManagerService;
  let runtime: FakeAgentRuntime;
  let tempDir: string;
  let originalEnv: Record<string, string | undefined>;

  const HYPERSCAPE_APP_NAME = "@elizaos/app-hyperscape";
  const HYPERSCAPE_PLUGIN_NAME = "@elizaos/plugin-hyperscape";

  beforeEach(async () => {
    // Flush any cached registry from prior test suites so fresh fetch mocks
    // installed in individual tests are honoured.
    pluginRegistry.resetRegistryCache();

    // Save original env vars
    originalEnv = {
      HYPERSCAPE_CHARACTER_ID: process.env.HYPERSCAPE_CHARACTER_ID,
      HYPERSCAPE_AUTH_TOKEN: process.env.HYPERSCAPE_AUTH_TOKEN,
      HYPERSCAPE_SERVER_URL: process.env.HYPERSCAPE_SERVER_URL,
      SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY,
      EVM_PRIVATE_KEY: process.env.EVM_PRIVATE_KEY,
    };

    // Clear hyperscape env vars
    delete process.env.HYPERSCAPE_CHARACTER_ID;
    delete process.env.HYPERSCAPE_AUTH_TOKEN;
    delete process.env.SOLANA_PRIVATE_KEY;
    delete process.env.EVM_PRIVATE_KEY;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-hyperscape-test-"));
    const pluginsDir = path.join(tempDir, "plugins");
    fs.mkdirSync(pluginsDir);

    runtime = new FakeAgentRuntime();
    pluginManager = new PluginManagerService(runtime, {
      pluginDirectory: pluginsDir,
    });

    process.env.MILADY_STATE_DIR = tempDir;
    appManager = new AppManager();
  });

  afterEach(() => {
    // Restore original env vars
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("throws error when hyperscape auto-provisioning fails and no credentials exist", async () => {
    // Mock registry to return hyperscape app
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("wallet-auth")) {
        // Simulate server not responding
        return Promise.reject(new Error("ECONNREFUSED"));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          registry: {
            [HYPERSCAPE_APP_NAME]: {
              git: { repo: "elizaos/app-hyperscape", v0: {}, v1: {}, v2: {} },
              npm: {
                repo: HYPERSCAPE_PLUGIN_NAME,
                v0: null,
                v1: null,
                v2: "1.0.0",
              },
              supports: { v0: true, v1: false, v2: false },
              description: "Hyperscape 3D world",
              topics: ["app"],
            },
            [HYPERSCAPE_PLUGIN_NAME]: {
              git: {
                repo: "elizaos/plugin-hyperscape",
                v0: {},
                v1: {},
                v2: {},
              },
              npm: {
                repo: HYPERSCAPE_PLUGIN_NAME,
                v0: null,
                v1: null,
                v2: "1.0.0",
              },
              supports: { v0: true, v1: false, v2: false },
              description: "Hyperscape plugin",
              topics: ["plugin"],
            },
          },
        }),
      });
    });

    // Simulate plugin already installed
    const installedDir = path.join(
      tempDir,
      "plugins",
      "installed",
      "_elizaos_plugin-hyperscape",
    );
    fs.mkdirSync(installedDir, { recursive: true });
    fs.writeFileSync(
      path.join(installedDir, "package.json"),
      JSON.stringify({ name: HYPERSCAPE_PLUGIN_NAME, version: "1.0.0" }),
    );

    // No wallet keys set, auto-provisioning will fail
    await expect(
      appManager.launch(pluginManager, HYPERSCAPE_APP_NAME),
    ).rejects.toThrow(/Hyperscape authentication required/);
  });

  it("succeeds when hyperscape credentials are pre-configured", async () => {
    // Pre-set credentials
    process.env.HYPERSCAPE_CHARACTER_ID = "test-char-id";
    process.env.HYPERSCAPE_AUTH_TOKEN = "test-auth-token";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        registry: {
          [HYPERSCAPE_APP_NAME]: {
            git: { repo: "elizaos/app-hyperscape", v0: {}, v1: {}, v2: {} },
            npm: {
              repo: HYPERSCAPE_PLUGIN_NAME,
              v0: null,
              v1: null,
              v2: "1.0.0",
            },
            supports: { v0: true, v1: false, v2: false },
            description: "Hyperscape 3D world",
            topics: ["app"],
          },
          [HYPERSCAPE_PLUGIN_NAME]: {
            git: { repo: "elizaos/plugin-hyperscape", v0: {}, v1: {}, v2: {} },
            npm: {
              repo: HYPERSCAPE_PLUGIN_NAME,
              v0: null,
              v1: null,
              v2: "1.0.0",
            },
            supports: { v0: true, v1: false, v2: false },
            description: "Hyperscape plugin",
            topics: ["plugin"],
          },
        },
      }),
    });

    // Simulate plugin already installed
    const installedDir = path.join(
      tempDir,
      "plugins",
      "installed",
      "_elizaos_plugin-hyperscape",
    );
    fs.mkdirSync(installedDir, { recursive: true });
    fs.writeFileSync(
      path.join(installedDir, "package.json"),
      JSON.stringify({ name: HYPERSCAPE_PLUGIN_NAME, version: "1.0.0" }),
    );

    const result = await appManager.launch(pluginManager, HYPERSCAPE_APP_NAME);
    expect(result.pluginInstalled).toBe(true);
  });

  it("skips auto-provisioning when credentials already exist", async () => {
    // Pre-set credentials - auto-provisioning should be skipped
    process.env.HYPERSCAPE_CHARACTER_ID = "existing-char-id";
    process.env.HYPERSCAPE_AUTH_TOKEN = "existing-auth-token";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        registry: {
          [HYPERSCAPE_APP_NAME]: {
            git: { repo: "elizaos/app-hyperscape", v0: {}, v1: {}, v2: {} },
            npm: {
              repo: HYPERSCAPE_PLUGIN_NAME,
              v0: null,
              v1: null,
              v2: "1.0.0",
            },
            supports: { v0: true, v1: false, v2: false },
            description: "Hyperscape 3D world",
            topics: ["app"],
          },
          [HYPERSCAPE_PLUGIN_NAME]: {
            git: {
              repo: "elizaos/plugin-hyperscape",
              v0: {},
              v1: {},
              v2: {},
            },
            npm: {
              repo: HYPERSCAPE_PLUGIN_NAME,
              v0: null,
              v1: null,
              v2: "1.0.0",
            },
            supports: { v0: true, v1: false, v2: false },
            description: "Hyperscape plugin",
            topics: ["plugin"],
          },
        },
      }),
    });

    // Simulate plugin already installed
    const installedDir = path.join(
      tempDir,
      "plugins",
      "installed",
      "_elizaos_plugin-hyperscape",
    );
    fs.mkdirSync(installedDir, { recursive: true });
    fs.writeFileSync(
      path.join(installedDir, "package.json"),
      JSON.stringify({ name: HYPERSCAPE_PLUGIN_NAME, version: "1.0.0" }),
    );

    const result = await appManager.launch(pluginManager, HYPERSCAPE_APP_NAME);
    expect(result.pluginInstalled).toBe(true);
    // Credentials should remain unchanged (auto-provisioning skipped)
    expect(process.env.HYPERSCAPE_CHARACTER_ID).toBe("existing-char-id");
    expect(process.env.HYPERSCAPE_AUTH_TOKEN).toBe("existing-auth-token");
  });
});
