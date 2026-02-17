import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";

export interface MockApiServerOptions {
  port?: number;
  onboardingComplete?: boolean;
  auth?: {
    token: string;
    pairingCode?: string;
    pairingEnabled?: boolean;
    expiresAt?: number | null;
  };
  permissions?: Partial<
    Record<
      PermissionId,
      Partial<
        Pick<PermissionStateRecord, "status" | "canRequest" | "lastChecked">
      >
    >
  >;
}

export interface MockApiServer {
  baseUrl: string;
  requests: string[];
  close: () => Promise<void>;
}

type JsonObject = Record<string, unknown>;

type AgentState =
  | "not_started"
  | "starting"
  | "running"
  | "paused"
  | "stopped"
  | "restarting"
  | "error";
type PermissionStatus =
  | "granted"
  | "denied"
  | "not-determined"
  | "restricted"
  | "not-applicable";
type PermissionId =
  | "accessibility"
  | "screen-recording"
  | "microphone"
  | "camera"
  | "shell";
type PermissionStateRecord = {
  id: PermissionId;
  status: PermissionStatus;
  lastChecked: number;
  canRequest: boolean;
};
type PermissionsStateRecord = Record<PermissionId, PermissionStateRecord>;

interface ConversationRecord {
  id: string;
  title: string;
  roomId: string;
  createdAt: string;
  updatedAt: string;
}

interface MessageRecord {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface CustomActionRecord {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  handler: { type: "http" | "shell" | "code"; [key: string]: unknown };
  parameters: Array<{ name: string; type?: string; required?: boolean }>;
  createdAt: string;
  updatedAt: string;
}

const onboardingOptions = {
  names: ["Milady", "Lilypad", "Orbit", "Nova", "Echo"],
  styles: [
    {
      catchphrase: "chaotic",
      hint: "chaotic good",
      bio: ["Chaotic and curious AI companion."],
      system: "You are {{name}}.",
      style: { all: ["be concise"], chat: ["friendly"], post: ["playful"] },
      adjectives: ["curious", "playful"],
      topics: ["ai", "crypto"],
      postExamples: ["hello world"],
      messageExamples: [[{ name: "User", content: { text: "hello" } }]],
    },
    {
      catchphrase: "serious",
      hint: "focused and practical",
      bio: ["Focused assistant."],
      system: "You are {{name}}.",
      style: { all: ["clear"], chat: ["direct"], post: ["brief"] },
      adjectives: ["focused"],
      topics: ["engineering"],
      postExamples: [],
      messageExamples: [[{ name: "User", content: { text: "status?" } }]],
    },
  ],
  providers: [
    {
      id: "ollama",
      name: "Ollama",
      envKey: null,
      pluginName: "@elizaos/plugin-ollama",
      keyPrefix: null,
      description: "Use local Ollama",
    },
    {
      id: "openai",
      name: "OpenAI",
      envKey: "OPENAI_API_KEY",
      pluginName: "@elizaos/plugin-openai",
      keyPrefix: "sk-",
      description: "OpenAI API",
    },
  ],
  cloudProviders: [
    {
      id: "elizacloud",
      name: "Eliza Cloud",
      description: "Managed cloud runtime",
    },
  ],
  models: {
    small: [
      {
        id: "small-model",
        name: "Small Model",
        provider: "elizacloud",
        description: "Fast",
      },
    ],
    large: [
      {
        id: "large-model",
        name: "Large Model",
        provider: "elizacloud",
        description: "High quality",
      },
    ],
  },
  inventoryProviders: [
    {
      id: "evm",
      name: "EVM",
      description: "Ethereum-compatible chains",
      rpcProviders: [
        {
          id: "elizacloud",
          name: "Eliza Cloud",
          description: "Managed RPC",
          envKey: null,
          requiresKey: false,
        },
      ],
    },
    {
      id: "solana",
      name: "Solana",
      description: "Solana chain",
      rpcProviders: [
        {
          id: "elizacloud",
          name: "Eliza Cloud",
          description: "Managed RPC",
          envKey: null,
          requiresKey: false,
        },
      ],
    },
  ],
  sharedStyleRules: "",
};

function applyCors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  applyCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonObject;
  } catch {
    return {};
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultPermissionsState(): PermissionsStateRecord {
  const now = Date.now();
  return {
    accessibility: {
      id: "accessibility",
      status: "granted",
      lastChecked: now,
      canRequest: false,
    },
    "screen-recording": {
      id: "screen-recording",
      status: "granted",
      lastChecked: now,
      canRequest: false,
    },
    microphone: {
      id: "microphone",
      status: "granted",
      lastChecked: now,
      canRequest: false,
    },
    camera: {
      id: "camera",
      status: "granted",
      lastChecked: now,
      canRequest: false,
    },
    shell: {
      id: "shell",
      status: "granted",
      lastChecked: now,
      canRequest: false,
    },
  };
}

function mergePermissionsState(
  base: PermissionsStateRecord,
  patch?: MockApiServerOptions["permissions"],
): PermissionsStateRecord {
  if (!patch) return base;
  const next = { ...base };
  for (const [id, partialState] of Object.entries(patch) as Array<
    [PermissionId, MockApiServerOptions["permissions"][PermissionId]]
  >) {
    if (!partialState) continue;
    next[id] = {
      ...next[id],
      ...partialState,
      id,
      lastChecked: partialState.lastChecked ?? Date.now(),
    };
  }
  return next;
}

export async function startMockApiServer(
  options: MockApiServerOptions = {},
): Promise<MockApiServer> {
  const requests: string[] = [];
  let onboardingComplete = Boolean(options.onboardingComplete);
  let agentState: AgentState = onboardingComplete ? "running" : "not_started";
  let permissionStates = mergePermissionsState(
    createDefaultPermissionsState(),
    options.permissions,
  );
  const requiredAuthToken = options.auth?.token?.trim() || null;
  const pairingCode = options.auth?.pairingCode ?? "1234-5678";
  const pairingEnabled =
    options.auth?.pairingEnabled ?? Boolean(requiredAuthToken);
  const pairingExpiresAt =
    options.auth?.expiresAt ??
    (pairingEnabled ? Date.now() + 10 * 60 * 1000 : null);
  const agentName = "Milady";

  const conversations: ConversationRecord[] = [
    {
      id: "conv-1",
      title: "General",
      roomId: "room-1",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ];
  const messagesByConversation = new Map<string, MessageRecord[]>([
    [
      "conv-1",
      [
        {
          id: "msg-1",
          role: "assistant",
          text: "hello from mock backend",
          timestamp: Date.now(),
        },
      ],
    ],
  ]);

  const plugins = [
    {
      id: "openai",
      name: "OpenAI",
      description: "OpenAI provider",
      enabled: false,
      configured: false,
      envKey: "OPENAI_API_KEY",
      category: "ai-provider",
      source: "bundled",
      parameters: [],
      validationErrors: [],
      validationWarnings: [],
    },
    {
      id: "ollama",
      name: "Ollama",
      description: "Local provider",
      enabled: true,
      configured: true,
      envKey: null,
      category: "ai-provider",
      source: "bundled",
      parameters: [],
      validationErrors: [],
      validationWarnings: [],
    },
    {
      id: "discord",
      name: "Discord",
      description: "Discord connector",
      enabled: false,
      configured: false,
      envKey: "DISCORD_API_TOKEN",
      category: "connector",
      source: "bundled",
      parameters: [],
      validationErrors: [],
      validationWarnings: [],
    },
    {
      id: "telegram",
      name: "Telegram",
      description: "Telegram connector",
      enabled: false,
      configured: false,
      envKey: "TELEGRAM_BOT_TOKEN",
      category: "connector",
      source: "bundled",
      parameters: [],
      validationErrors: [],
      validationWarnings: [],
    },
    {
      id: "todo",
      name: "Todo",
      description: "Task manager",
      enabled: true,
      configured: true,
      envKey: null,
      category: "feature",
      source: "bundled",
      parameters: [],
      validationErrors: [],
      validationWarnings: [],
    },
  ];

  const skills = [
    {
      id: "skill-1",
      name: "welcome-skill",
      description: "A sample skill",
      enabled: true,
      scanStatus: "clean",
    },
  ];

  const customActions: CustomActionRecord[] = [];

  let config: JsonObject = {
    settings: { avatarIndex: 1 },
    models: { small: "small-model", large: "large-model" },
    cloud: { enabled: true },
    messages: {
      tts: {
        provider: "simple-voice",
      },
    },
    env: { vars: {} },
    agents: {
      defaults: {
        model: { primary: "small-model" },
      },
    },
  };

  const statusPayload = () => ({
    state: agentState,
    agentName,
    model: "mock-model",
    startedAt: Date.now() - 60_000,
    uptime: 60_000,
  });

  const server = http.createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const host = req.headers.host ?? "127.0.0.1";
    const url = new URL(req.url ?? "/", `http://${host}`);
    const { pathname, searchParams } = url;
    requests.push(`${method} ${pathname}`);

    if (method === "OPTIONS") {
      applyCors(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    if (method === "GET" && pathname === "/api/auth/status") {
      json(res, 200, {
        required: Boolean(requiredAuthToken),
        pairingEnabled,
        expiresAt: pairingExpiresAt,
      });
      return;
    }
    if (method === "POST" && pathname === "/api/auth/pair") {
      if (!requiredAuthToken || !pairingEnabled) {
        json(res, 400, { error: "Pairing is not enabled" });
        return;
      }
      const body = await readJson(req);
      const code = typeof body.code === "string" ? body.code.trim() : "";
      if (!code) {
        json(res, 400, { error: "Pairing code required" });
        return;
      }
      if (code !== pairingCode) {
        json(res, 403, { error: "Invalid pairing code" });
        return;
      }
      json(res, 200, { token: requiredAuthToken });
      return;
    }

    if (requiredAuthToken) {
      const authHeader = req.headers.authorization ?? "";
      if (authHeader !== `Bearer ${requiredAuthToken}`) {
        json(res, 401, { error: "Unauthorized" });
        return;
      }
    }

    if (method === "GET" && pathname === "/api/permissions") {
      json(res, 200, permissionStates);
      return;
    }
    if (method === "POST" && pathname === "/api/permissions/refresh") {
      json(res, 200, permissionStates);
      return;
    }
    if (method === "GET" && pathname === "/api/permissions/shell") {
      json(res, 200, { enabled: permissionStates.shell.status === "granted" });
      return;
    }
    if (method === "PUT" && pathname === "/api/permissions/shell") {
      const body = await readJson(req);
      const enabled = body.enabled === true;
      permissionStates = {
        ...permissionStates,
        shell: {
          ...permissionStates.shell,
          status: enabled ? "granted" : "denied",
          canRequest: !enabled,
          lastChecked: Date.now(),
        },
      };
      json(res, 200, permissionStates.shell);
      return;
    }
    if (method === "PUT" && pathname === "/api/permissions/state") {
      const body = await readJson(req);
      const incoming = body.permissions as
        | Record<string, PermissionStateRecord>
        | undefined;
      if (!incoming || typeof incoming !== "object") {
        json(res, 400, { error: "Invalid permissions payload" });
        return;
      }
      for (const [id, state] of Object.entries(incoming) as Array<
        [PermissionId, PermissionStateRecord]
      >) {
        if (!permissionStates[id] || !state) continue;
        permissionStates[id] = {
          ...permissionStates[id],
          ...state,
          id,
          lastChecked: state.lastChecked ?? Date.now(),
        };
      }
      json(res, 200, { updated: true, permissions: permissionStates });
      return;
    }
    if (
      method === "POST" &&
      pathname.startsWith("/api/permissions/") &&
      pathname.endsWith("/request")
    ) {
      const id = pathname.slice(
        "/api/permissions/".length,
        -"/request".length,
      ) as PermissionId;
      if (!permissionStates[id]) {
        json(res, 400, { error: "Unknown permission" });
        return;
      }
      permissionStates = {
        ...permissionStates,
        [id]: {
          ...permissionStates[id],
          status: "granted",
          canRequest: false,
          lastChecked: Date.now(),
        },
      };
      json(res, 200, permissionStates[id]);
      return;
    }
    if (
      method === "POST" &&
      pathname.startsWith("/api/permissions/") &&
      pathname.endsWith("/open-settings")
    ) {
      const id = pathname.slice(
        "/api/permissions/".length,
        -"/open-settings".length,
      ) as PermissionId;
      if (!permissionStates[id]) {
        json(res, 400, { error: "Unknown permission" });
        return;
      }
      json(res, 200, { ok: true, id });
      return;
    }
    if (method === "GET" && pathname.startsWith("/api/permissions/")) {
      const id = pathname.slice("/api/permissions/".length) as PermissionId;
      if (!permissionStates[id]) {
        json(res, 404, { error: "Unknown permission" });
        return;
      }
      json(res, 200, permissionStates[id]);
      return;
    }
    if (method === "GET" && pathname === "/api/onboarding/status") {
      json(res, 200, { complete: onboardingComplete });
      return;
    }
    if (method === "GET" && pathname === "/api/onboarding/options") {
      json(res, 200, onboardingOptions);
      return;
    }
    if (method === "POST" && pathname === "/api/onboarding") {
      onboardingComplete = true;
      agentState = "running";
      json(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && pathname === "/api/status") {
      json(res, 200, statusPayload());
      return;
    }
    if (method === "POST" && pathname === "/api/agent/start") {
      agentState = "running";
      json(res, 200, { status: statusPayload() });
      return;
    }
    if (method === "POST" && pathname === "/api/agent/stop") {
      agentState = "stopped";
      json(res, 200, { status: statusPayload() });
      return;
    }
    if (method === "POST" && pathname === "/api/agent/pause") {
      agentState = "paused";
      json(res, 200, { status: statusPayload() });
      return;
    }
    if (method === "POST" && pathname === "/api/agent/resume") {
      agentState = "running";
      json(res, 200, { status: statusPayload() });
      return;
    }
    if (method === "POST" && pathname === "/api/agent/restart") {
      agentState = "running";
      json(res, 200, { status: statusPayload() });
      return;
    }
    if (method === "POST" && pathname === "/api/restart") {
      agentState = "running";
      json(res, 200, { ok: true });
      return;
    }
    if (method === "POST" && pathname === "/api/agent/reset") {
      onboardingComplete = false;
      agentState = "not_started";
      json(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && pathname === "/api/conversations") {
      json(res, 200, { conversations });
      return;
    }
    if (method === "POST" && pathname === "/api/conversations") {
      const conv: ConversationRecord = {
        id: randomUUID(),
        title: "New Conversation",
        roomId: randomUUID(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      conversations.unshift(conv);
      messagesByConversation.set(conv.id, []);
      json(res, 200, { conversation: conv });
      return;
    }

    const conversationMessagesMatch = pathname.match(
      /^\/api\/conversations\/([^/]+)\/messages$/,
    );
    if (method === "GET" && conversationMessagesMatch) {
      const id = decodeURIComponent(conversationMessagesMatch[1]);
      json(res, 200, { messages: messagesByConversation.get(id) ?? [] });
      return;
    }

    const greetingMatch = pathname.match(
      /^\/api\/conversations\/([^/]+)\/greeting$/,
    );
    if (method === "POST" && greetingMatch) {
      json(res, 200, { text: "hello from milady" });
      return;
    }

    if (method === "GET" && pathname === "/api/agent/events") {
      json(res, 200, {
        events: [],
        latestEventId: null,
        totalBuffered: 0,
        replayed: true,
      });
      return;
    }

    if (method === "GET" && pathname === "/api/workbench/overview") {
      json(res, 200, {
        tasks: [],
        triggers: [],
        todos: [],
        autonomy: { enabled: true, thinking: false, lastEventAt: null },
        tasksAvailable: true,
        triggersAvailable: true,
        todosAvailable: true,
      });
      return;
    }

    if (method === "GET" && pathname === "/api/wallet/addresses") {
      json(res, 200, {
        evmAddress: "0x1234567890abcdef1234567890abcdef12345678",
        solanaAddress: "7YfA9q2w8GJTkf3k4sydp6q9Q8h5k2m1u8r7t6v5w4x3",
      });
      return;
    }
    if (method === "GET" && pathname === "/api/wallet/config") {
      json(res, 200, {
        alchemyKeySet: true,
        infuraKeySet: false,
        ankrKeySet: false,
        heliusKeySet: true,
        birdeyeKeySet: false,
        evmChains: ["ethereum", "base"],
        evmAddress: "0x1234567890abcdef1234567890abcdef12345678",
        solanaAddress: "7YfA9q2w8GJTkf3k4sydp6q9Q8h5k2m1u8r7t6v5w4x3",
      });
      return;
    }
    if (method === "GET" && pathname === "/api/wallet/balances") {
      json(res, 200, {
        evm: {
          address: "0x1234567890abcdef1234567890abcdef12345678",
          chains: [
            {
              chain: "ethereum",
              chainId: 1,
              nativeBalance: "1.234",
              nativeSymbol: "ETH",
              nativeValueUsd: "3200.00",
              tokens: [],
              error: null,
            },
          ],
        },
        solana: {
          address: "7YfA9q2w8GJTkf3k4sydp6q9Q8h5k2m1u8r7t6v5w4x3",
          solBalance: "0.5",
          solValueUsd: "50.00",
          tokens: [],
        },
      });
      return;
    }
    if (method === "GET" && pathname === "/api/wallet/nfts") {
      json(res, 200, { evm: [], solana: { nfts: [] } });
      return;
    }

    if (method === "GET" && pathname === "/api/cloud/status") {
      json(res, 200, {
        connected: false,
        enabled: true,
        hasApiKey: false,
        userId: null,
        organizationId: null,
        topUpUrl: "https://www.elizacloud.ai",
      });
      return;
    }
    if (method === "GET" && pathname === "/api/cloud/credits") {
      json(res, 200, {
        connected: false,
        balance: null,
        low: false,
        critical: false,
        topUpUrl: "https://www.elizacloud.ai",
      });
      return;
    }

    if (method === "GET" && pathname === "/api/config") {
      json(res, 200, config);
      return;
    }
    if (method === "PUT" && pathname === "/api/config") {
      const patch = await readJson(req);
      config = { ...config, ...patch };
      json(res, 200, config);
      return;
    }
    if (method === "GET" && pathname === "/api/config/schema") {
      json(res, 200, {
        schema: { type: "object", properties: {} },
        uiHints: {},
        version: "mock",
        generatedAt: nowIso(),
      });
      return;
    }

    if (method === "GET" && pathname === "/api/character") {
      json(res, 200, {
        character: {
          name: agentName,
          username: "milady",
          bio: ["A mock agent for desktop e2e"],
          system: "You are Milady",
          adjectives: ["friendly"],
          topics: ["testing"],
          style: { all: [], chat: [], post: [] },
          postExamples: [],
          messageExamples: [],
        },
      });
      return;
    }
    if (method === "PUT" && pathname === "/api/character") {
      json(res, 200, { ok: true, agentName });
      return;
    }
    if (method === "POST" && pathname === "/api/character/generate") {
      json(res, 200, { generated: "mock generated text" });
      return;
    }
    if (method === "POST" && pathname === "/api/character/random-name") {
      json(res, 200, { name: "Milady" });
      return;
    }

    if (method === "GET" && pathname === "/api/plugins") {
      json(res, 200, { plugins });
      return;
    }
    if (method === "GET" && pathname === "/api/skills") {
      json(res, 200, { skills });
      return;
    }
    if (method === "POST" && pathname === "/api/skills/refresh") {
      json(res, 200, { skills });
      return;
    }

    if (method === "GET" && pathname === "/api/connectors") {
      json(res, 200, { connectors: {} });
      return;
    }

    if (method === "GET" && pathname === "/api/custom-actions") {
      json(res, 200, { actions: customActions });
      return;
    }
    if (method === "POST" && pathname === "/api/custom-actions") {
      const body = await readJson(req);
      const now = nowIso();
      const action: CustomActionRecord = {
        id: randomUUID(),
        name: String(body.name ?? "Mock Action"),
        description:
          typeof body.description === "string" ? body.description : undefined,
        enabled: body.enabled !== false,
        handler: (body.handler as CustomActionRecord["handler"]) ?? {
          type: "code",
        },
        parameters: Array.isArray(body.parameters)
          ? (body.parameters as CustomActionRecord["parameters"])
          : [],
        createdAt: now,
        updatedAt: now,
      };
      customActions.unshift(action);
      json(res, 200, { ok: true, action });
      return;
    }
    const customActionMatch = pathname.match(
      /^\/api\/custom-actions\/([^/]+)$/,
    );
    if (method === "PUT" && customActionMatch) {
      const id = decodeURIComponent(customActionMatch[1]);
      const body = await readJson(req);
      const idx = customActions.findIndex((a) => a.id === id);
      if (idx < 0) {
        json(res, 404, { error: "Custom action not found" });
        return;
      }
      const next = {
        ...customActions[idx],
        ...body,
        id,
        updatedAt: nowIso(),
      } as CustomActionRecord;
      customActions[idx] = next;
      json(res, 200, { ok: true, action: next });
      return;
    }
    if (method === "DELETE" && customActionMatch) {
      const id = decodeURIComponent(customActionMatch[1]);
      const idx = customActions.findIndex((a) => a.id === id);
      if (idx >= 0) customActions.splice(idx, 1);
      json(res, 200, { ok: true });
      return;
    }
    const customActionTestMatch = pathname.match(
      /^\/api\/custom-actions\/([^/]+)\/test$/,
    );
    if (method === "POST" && customActionTestMatch) {
      json(res, 200, { ok: true, output: "Mock action output", durationMs: 1 });
      return;
    }
    if (method === "POST" && pathname === "/api/custom-actions/generate") {
      json(res, 200, {
        ok: true,
        generated: {
          name: "generated-action",
          description: "Generated by mock API",
          enabled: true,
          handler: { type: "code", source: "return 'hello';" },
          parameters: [],
        },
      });
      return;
    }

    if (method === "GET" && pathname === "/api/apps") {
      json(res, 200, [
        {
          name: "@elizaos/app-hyperscape",
          displayName: "Hyperscape",
          description: "Mock app",
          category: "game",
          launchType: "viewer",
          launchUrl: null,
          icon: null,
          capabilities: [],
          stars: 100,
          repository: "https://github.com/elizaos/app-hyperscape",
          latestVersion: "1.0.0",
          supports: { v0: false, v1: false, v2: true },
          npm: {
            package: "@elizaos/app-hyperscape",
            v0Version: null,
            v1Version: null,
            v2Version: "1.0.0",
          },
          viewer: {
            url: "https://example.com/mock-app",
            sandbox: "allow-scripts allow-same-origin",
            postMessageAuth: false,
          },
        },
      ]);
      return;
    }
    if (method === "GET" && pathname === "/api/apps/installed") {
      json(res, 200, []);
      return;
    }
    if (method === "POST" && pathname === "/api/apps/launch") {
      json(res, 200, {
        pluginInstalled: true,
        needsRestart: false,
        displayName: "Hyperscape",
        launchType: "viewer",
        launchUrl: null,
        viewer: {
          url: "https://example.com/mock-app",
          sandbox: "allow-scripts allow-same-origin",
          postMessageAuth: false,
          authMessage: null,
        },
      });
      return;
    }
    if (
      method === "GET" &&
      pathname === "/api/apps/hyperscape/embedded-agents"
    ) {
      json(res, 200, { success: true, agents: [], count: 0 });
      return;
    }

    if (method === "GET" && pathname === "/api/registry/status") {
      json(res, 200, {
        registered: false,
        tokenId: 0,
        agentName,
        agentEndpoint: "",
        capabilitiesHash: "",
        isActive: false,
        tokenURI: "",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        totalAgents: 0,
        configured: true,
      });
      return;
    }
    if (method === "GET" && pathname === "/api/drop/status") {
      json(res, 200, {
        dropEnabled: false,
        publicMintOpen: false,
        whitelistMintOpen: false,
        mintedOut: false,
        currentSupply: 0,
        maxSupply: 2138,
        shinyPrice: "0.1",
        userHasMinted: false,
      });
      return;
    }
    if (method === "GET" && pathname === "/api/whitelist/status") {
      json(res, 200, {
        eligible: false,
        twitterVerified: false,
        ogCode: null,
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      });
      return;
    }

    if (method === "GET" && pathname === "/api/triggers") {
      json(res, 200, { triggers: [] });
      return;
    }
    if (method === "GET" && pathname === "/api/triggers/health") {
      json(res, 200, {
        triggersEnabled: true,
        activeTriggers: 0,
        disabledTriggers: 0,
        totalExecutions: 0,
        totalFailures: 0,
        totalSkipped: 0,
      });
      return;
    }

    if (method === "GET" && pathname === "/api/training/status") {
      json(res, 200, {
        runningJobs: 0,
        queuedJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        modelCount: 0,
        datasetCount: 0,
        runtimeAvailable: true,
      });
      return;
    }
    if (method === "GET" && pathname === "/api/training/trajectories") {
      json(res, 200, {
        available: true,
        total: 0,
        trajectories: [],
      });
      return;
    }
    if (method === "GET" && pathname === "/api/training/datasets") {
      json(res, 200, { datasets: [] });
      return;
    }
    if (method === "GET" && pathname === "/api/training/jobs") {
      json(res, 200, { jobs: [] });
      return;
    }
    if (method === "GET" && pathname === "/api/training/models") {
      json(res, 200, { models: [] });
      return;
    }

    if (method === "GET" && pathname === "/api/trajectories") {
      const limit = Number(searchParams.get("limit") ?? "50");
      const offset = Number(searchParams.get("offset") ?? "0");
      json(res, 200, { trajectories: [], total: 0, offset, limit });
      return;
    }
    if (method === "GET" && pathname === "/api/trajectories/stats") {
      json(res, 200, {
        totalTrajectories: 0,
        totalLlmCalls: 0,
        totalProviderAccesses: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        averageDurationMs: 0,
        bySource: {},
        byModel: {},
      });
      return;
    }
    if (method === "GET" && pathname === "/api/trajectories/config") {
      json(res, 200, { enabled: true });
      return;
    }
    if (
      (method === "PUT" || method === "POST") &&
      pathname === "/api/trajectories/config"
    ) {
      await readJson(req);
      json(res, 200, { enabled: true });
      return;
    }
    if (method === "DELETE" && pathname === "/api/trajectories") {
      json(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && pathname === "/api/runtime") {
      json(res, 200, {
        runtimeAvailable: true,
        generatedAt: Date.now(),
        settings: {
          maxDepth: 2,
          maxArrayLength: 20,
          maxObjectEntries: 20,
          maxStringLength: 200,
        },
        meta: {
          agentId: "agent-1",
          agentState: agentState,
          agentName,
          model: "mock-model",
          pluginCount: plugins.length,
          actionCount: 0,
          providerCount: 1,
          evaluatorCount: 0,
          serviceTypeCount: 0,
          serviceCount: 0,
        },
        order: {
          plugins: [],
          actions: [],
          providers: [],
          evaluators: [],
          services: [],
        },
        sections: {
          runtime: {},
          plugins: {},
          actions: {},
          providers: {},
          evaluators: {},
          services: {},
        },
      });
      return;
    }

    if (method === "GET" && pathname === "/api/database/status") {
      json(res, 200, {
        provider: "pglite",
        connected: true,
        serverVersion: "16.0",
        tableCount: 0,
        pgliteDataDir: null,
        postgresHost: null,
      });
      return;
    }
    if (method === "GET" && pathname === "/api/database/tables") {
      json(res, 200, { tables: [] });
      return;
    }
    if (method === "POST" && pathname === "/api/database/query") {
      json(res, 200, { columns: [], rows: [], rowCount: 0, durationMs: 1 });
      return;
    }
    if (method === "GET" && pathname === "/api/database/config") {
      json(res, 200, {
        config: {},
        activeProvider: "pglite",
        needsRestart: false,
      });
      return;
    }

    if (method === "GET" && pathname === "/api/logs") {
      json(res, 200, {
        entries: [
          {
            timestamp: Date.now(),
            level: "info",
            message: "mock backend ready",
            source: "mock",
            tags: ["mock"],
          },
        ],
        sources: ["mock"],
        tags: ["mock"],
      });
      return;
    }

    if (method === "GET" && pathname === "/api/knowledge/stats") {
      json(res, 200, {
        documentCount: 0,
        fragmentCount: 0,
        agentId: "agent-1",
      });
      return;
    }
    if (method === "GET" && pathname === "/api/knowledge/documents") {
      json(res, 200, { documents: [], total: 0, limit: 100, offset: 0 });
      return;
    }

    if (method === "GET" && pathname === "/api/update/status") {
      json(res, 200, {
        currentVersion: "0.0.0",
        channel: "stable",
        installMethod: "dev",
        updateAvailable: false,
        latestVersion: null,
        channels: { stable: null, beta: null, nightly: null },
        distTags: { stable: "latest", beta: "beta", nightly: "nightly" },
        lastCheckAt: nowIso(),
        error: null,
      });
      return;
    }
    if (method === "GET" && pathname === "/api/extension/status") {
      json(res, 200, {
        relayReachable: false,
        relayPort: 18792,
        extensionPath: null,
      });
      return;
    }

    if (method === "GET" && pathname.startsWith("/api/")) {
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { error: "Not found" });
  });

  const wsServer = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const host = req.headers.host ?? "127.0.0.1";
    const requestUrl = new URL(req.url ?? "/", `http://${host}`);
    if (requestUrl.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wsServer.handleUpgrade(req, socket, head, (ws) => {
      wsServer.emit("connection", ws, req);
    });
  });

  wsServer.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "status", ...statusPayload() }));
  });

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 2138, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    requests,
    close: async () => {
      for (const client of wsServer.clients) {
        client.close();
      }
      await new Promise<void>((resolve) => wsServer.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
