/**
 * Cloud Agent Entrypoint
 *
 * Runs inside the ECS container. Starts a real ElizaOS AgentRuntime with
 * the ElizaCloud plugin for inference, serves a health endpoint on $PORT,
 * and a bridge HTTP server on $BRIDGE_PORT that forwards messages into
 * the runtime and serves snapshot/restore for state management.
 */

import * as crypto from "node:crypto";
import * as http from "node:http";
import { readRequestBody } from "../http-helpers.js";

const PORT = Number(process.env.PORT ?? "2138");
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT ?? "18790");

// ─── ElizaOS Runtime ────────────────────────────────────────────────────

/**
 * The runtime is initialized asynchronously. All bridge requests that
 * need the runtime check `agentRuntime` and return 503 if it hasn't
 * started yet.
 */
let agentRuntime: {
  processMessage: (text: string, roomId: string) => Promise<string>;
  processMessageStream: (
    text: string,
    roomId: string,
    onChunk: (chunk: string) => void,
  ) => Promise<string>;
  getMemories: () => Array<Record<string, unknown>>;
  getConfig: () => Record<string, unknown>;
} | null = null;

/** In-memory state that persists across snapshots. */
const state = {
  memories: [] as Array<Record<string, unknown>>,
  config: {} as Record<string, unknown>,
  workspaceFiles: {} as Record<string, string>,
  startedAt: new Date().toISOString(),
};

async function initRuntime(): Promise<void> {
  /**
   * Dynamic import — the ElizaOS packages may or may not be installed in
   * the container image. When they are, we get a real agent runtime. When
   * they aren't (e.g., during development or bare container testing), we
   * fall back to the echo handler so the bridge protocol is still
   * exercisable end-to-end.
   */
  const elizaAvailable = await import("@elizaos/core")
    .then(() => true)
    .catch(() => false);

  if (elizaAvailable) {
    const {
      AgentRuntime,
      createCharacter,
      createMessageMemory,
      stringToUuid,
      ChannelType,
    } = await import("@elizaos/core");

    const character = createCharacter({
      name: process.env.AGENT_NAME ?? "CloudAgent",
      bio: "An ElizaOS agent running in the cloud.",
      settings: {
        // Database connection — plugin-sql reads POSTGRES_URL from runtime
        // settings and auto-detects Neon URLs for the serverless driver.
        ...(process.env.DATABASE_URL
          ? {
              POSTGRES_URL: process.env.DATABASE_URL,
              DATABASE_URL: process.env.DATABASE_URL,
            }
          : {}),
      },
      secrets: {
        ...(process.env.ELIZAOS_CLOUD_API_KEY
          ? { ELIZAOS_CLOUD_API_KEY: process.env.ELIZAOS_CLOUD_API_KEY }
          : {}),
        ...(process.env.OPENAI_API_KEY
          ? { OPENAI_API_KEY: process.env.OPENAI_API_KEY }
          : {}),
        ...(process.env.ANTHROPIC_API_KEY
          ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }
          : {}),
        ...(process.env.GOOGLE_API_KEY
          ? { GOOGLE_API_KEY: process.env.GOOGLE_API_KEY }
          : {}),
        ...(process.env.XAI_API_KEY
          ? { XAI_API_KEY: process.env.XAI_API_KEY }
          : {}),
        ...(process.env.GROQ_API_KEY
          ? { GROQ_API_KEY: process.env.GROQ_API_KEY }
          : {}),
      },
    });

    const plugins = [];

    // Load ElizaCloud plugin for inference if available
    const cloudPlugin = await import("@elizaos/plugin-elizacloud")
      .then((m) => m.default ?? m.elizaOSCloudPlugin)
      .catch(() => null);
    if (cloudPlugin) plugins.push(cloudPlugin);

    // Load SQL plugin for persistence if available
    const sqlPlugin = await import("@elizaos/plugin-sql")
      .then((m) => m.default ?? m.sqlPlugin)
      .catch(() => null);
    if (sqlPlugin) plugins.push(sqlPlugin);

    const runtime = new AgentRuntime({ character, plugins });
    await runtime.initialize();

    const userId = crypto.randomUUID() as ReturnType<typeof stringToUuid>;
    const roomId = stringToUuid("cloud-agent-bridge-room");
    const worldId = stringToUuid("cloud-agent-world");

    await runtime.ensureConnection({
      entityId: userId,
      roomId,
      worldId,
      userName: "BridgeUser",
      source: "cloud-bridge",
      channelId: "cloud-bridge",
      type: ChannelType.DM,
    });

    agentRuntime = {
      processMessage: async (
        text: string,
        _roomId: string,
      ): Promise<string> => {
        const message = createMessageMemory({
          id: crypto.randomUUID() as ReturnType<typeof stringToUuid>,
          entityId: userId,
          roomId,
          content: {
            text,
            source: "cloud-bridge",
            channelType: ChannelType.DM,
          },
        });

        let responseText = "";
        await runtime.messageService?.handleMessage(
          runtime,
          message,
          async (content) => {
            if (content?.text) responseText += content.text;
            return [];
          },
        );

        state.memories.push({ role: "user", text, timestamp: Date.now() });
        state.memories.push({
          role: "assistant",
          text: responseText,
          timestamp: Date.now(),
        });

        return responseText || "(no response)";
      },
      processMessageStream: async (
        text: string,
        _roomId: string,
        onChunk: (chunk: string) => void,
      ): Promise<string> => {
        const message = createMessageMemory({
          id: crypto.randomUUID() as ReturnType<typeof stringToUuid>,
          entityId: userId,
          roomId,
          content: {
            text,
            source: "cloud-bridge",
            channelType: ChannelType.DM,
          },
        });

        let responseText = "";
        await runtime.messageService?.handleMessage(
          runtime,
          message,
          async (content) => {
            if (content?.text) {
              responseText += content.text;
              onChunk(content.text);
            }
            return [];
          },
        );

        state.memories.push({ role: "user", text, timestamp: Date.now() });
        state.memories.push({
          role: "assistant",
          text: responseText,
          timestamp: Date.now(),
        });

        return responseText || "(no response)";
      },
      getMemories: () => state.memories,
      getConfig: () => state.config,
    };

    console.log("[cloud-agent] ElizaOS runtime initialized with real agent");
  } else {
    // Fallback: no ElizaOS installed — echo mode for protocol testing
    console.warn(
      "[cloud-agent] @elizaos/core not available, running in echo mode",
    );
    agentRuntime = {
      processMessage: async (text: string): Promise<string> => {
        state.memories.push({ role: "user", text, timestamp: Date.now() });
        const reply = `[echo] ${text}`;
        state.memories.push({
          role: "assistant",
          text: reply,
          timestamp: Date.now(),
        });
        return reply;
      },
      processMessageStream: async (
        text: string,
        _roomId: string,
        onChunk: (chunk: string) => void,
      ): Promise<string> => {
        state.memories.push({ role: "user", text, timestamp: Date.now() });
        const reply = `[echo] ${text}`;
        onChunk(reply);
        state.memories.push({
          role: "assistant",
          text: reply,
          timestamp: Date.now(),
        });
        return reply;
      },
      getMemories: () => state.memories,
      getConfig: () => state.config,
    };
  }
}

// ─── Health endpoint ────────────────────────────────────────────────────

const healthServer = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: agentRuntime ? "healthy" : "initializing",
        uptime: process.uptime(),
        startedAt: state.startedAt,
        memoryUsage: process.memoryUsage().rss,
        runtimeReady: agentRuntime !== null,
      }),
    );
    return;
  }
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ service: "elizaos-cloud-agent", status: "running" }),
    );
    return;
  }
  res.writeHead(404);
  res.end("Not Found");
});

healthServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[cloud-agent] Health endpoint listening on port ${PORT}`);
});

// ─── Bridge HTTP server ─────────────────────────────────────────────────

const bridgeServer = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "POST" && req.url === "/api/snapshot") {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        memories: state.memories,
        config: state.config,
        workspaceFiles: state.workspaceFiles,
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  if (req.method === "POST" && req.url === "/api/restore") {
    const body = await readRequestBody(req);
    const incoming = JSON.parse(body) as Partial<typeof state>;
    if (incoming.memories) state.memories = incoming.memories;
    if (incoming.config) state.config = incoming.config;
    if (incoming.workspaceFiles) state.workspaceFiles = incoming.workspaceFiles;
    console.log("[cloud-agent] State restored from snapshot");
    res.writeHead(200);
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // ── SSE streaming endpoint ──────────────────────────────────────────────
  // Streams agent response chunks as Server-Sent Events.  The Eliza Cloud
  // proxy connects here and relays events to the Milaidy client.
  if (req.method === "POST" && req.url === "/bridge/stream") {
    if (!agentRuntime) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Agent runtime not ready" }));
      return;
    }

    const body = await readRequestBody(req);
    const rpc = JSON.parse(body) as {
      jsonrpc: string;
      id?: string | number;
      method?: string;
      params?: Record<string, unknown>;
    };

    if (rpc.method !== "message.send") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Only message.send is streamable" }));
      return;
    }

    // Switch to SSE mode
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const text = (rpc.params?.text as string) ?? "";
    const roomId = (rpc.params?.roomId as string) ?? "default";

    sendEvent("connected", { rpcId: rpc.id, timestamp: Date.now() });

    // The ElizaOS handleMessage callback fires once per response part
    // (typically the full response in a single call). True per-token
    // streaming requires the runtime's streaming context support, which
    // is not wired through the bridge protocol yet. For now, each
    // onChunk call emits one SSE event containing whatever text the
    // runtime produced in that callback invocation.
    await agentRuntime.processMessageStream(text, roomId, (chunk: string) => {
      sendEvent("chunk", { text: chunk });
    });

    sendEvent("done", { rpcId: rpc.id, timestamp: Date.now() });
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/bridge") {
    const body = await readRequestBody(req);
    const rpc = JSON.parse(body) as {
      jsonrpc: string;
      id?: string | number;
      method?: string;
      params?: Record<string, unknown>;
    };

    if (rpc.method === "message.send") {
      if (!agentRuntime) {
        res.writeHead(503);
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            error: { code: -32000, message: "Agent runtime not ready" },
          }),
        );
        return;
      }
      const text = (rpc.params?.text as string) ?? "";
      const roomId = (rpc.params?.roomId as string) ?? "default";
      const responseText = await agentRuntime.processMessage(text, roomId);
      res.writeHead(200);
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: rpc.id,
          result: { text: responseText, metadata: { timestamp: Date.now() } },
        }),
      );
      return;
    }

    if (rpc.method === "status.get") {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: rpc.id,
          result: {
            status: agentRuntime ? "running" : "initializing",
            uptime: process.uptime(),
            memoriesCount: state.memories.length,
            startedAt: state.startedAt,
          },
        }),
      );
      return;
    }

    if (rpc.method === "heartbeat") {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "heartbeat.ack",
          params: { timestamp: Date.now() },
        }),
      );
      return;
    }

    res.writeHead(200);
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: rpc.id,
        error: { code: -32601, message: `Method not found: ${rpc.method}` },
      }),
    );
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not Found" }));
});

bridgeServer.listen(BRIDGE_PORT, "0.0.0.0", () => {
  console.log(`[cloud-agent] Bridge server listening on port ${BRIDGE_PORT}`);
});

// ─── Startup ────────────────────────────────────────────────────────────

function shutdown() {
  console.log("[cloud-agent] Shutting down...");
  healthServer.close();
  bridgeServer.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Initialize runtime asynchronously — bridge returns 503 until ready
initRuntime()
  .then(() => {
    console.log("[cloud-agent] Ready");
  })
  .catch((err) => {
    console.error("[cloud-agent] Runtime init failed:", err);
    // Don't exit — health/bridge still work for diagnostics
  });
