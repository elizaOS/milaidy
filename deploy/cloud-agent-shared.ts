/**
 * Shared Cloud Agent Logic
 *
 * Single implementation of the cloud-agent runtime, health server, and
 * bridge server. Both the main entrypoint and the template entrypoint
 * import from here, passing a config that captures the small differences.
 */

import * as crypto from "node:crypto";
import * as http from "node:http";

// ─── Types ──────────────────────────────────────────────────────────────

export interface BridgeRpcParams {
  text?: string;
  roomId?: string;
  mode?: string;
}

export interface CloudAgentConfig {
  /** Health endpoint port. Default: 2138 */
  port?: number;
  /** Bridge server port. Default: 18790 */
  bridgePort?: number;
  /**
   * If set, the bridge server requires `Authorization: Bearer <secret>`.
   * Omit or pass empty string to disable auth.
   */
  bridgeSecret?: string;
  /** Max request body size in bytes. Default: 1 MB */
  maxBodyBytes?: number;
  /** Max memories kept in state. 0 = unlimited. Default: 0 */
  maxMemories?: number;
  /**
   * Whether processMessage/processMessageStream accept a chat mode param.
   * When false the mode parameter is ignored (template behaviour).
   */
  enableChatMode?: boolean;
}

interface AgentRuntime {
  processMessage: (
    text: string,
    roomId: string,
    mode: "simple" | "power",
  ) => Promise<string>;
  processMessageStream: (
    text: string,
    roomId: string,
    mode: "simple" | "power",
    onChunk: (chunk: string) => void,
  ) => Promise<string>;
  getMemories: () => Array<Record<string, unknown>>;
  getConfig: () => Record<string, unknown>;
}

// ─── Main entry ─────────────────────────────────────────────────────────

export function startCloudAgent(userConfig: CloudAgentConfig = {}): void {
  const PORT = userConfig.port ?? Number(process.env.PORT ?? "2138");
  const BRIDGE_PORT =
    userConfig.bridgePort ?? Number(process.env.BRIDGE_PORT ?? "18790");
  const BRIDGE_SECRET = userConfig.bridgeSecret ?? "";
  const MAX_BODY_BYTES = userConfig.maxBodyBytes ?? 1_048_576;
  const MAX_MEMORIES = userConfig.maxMemories ?? 0;
  const enableChatMode = userConfig.enableChatMode ?? false;

  let agentRuntime: AgentRuntime | null = null;

  /** In-memory state that persists across snapshots. */
  const state = {
    memories: [] as Array<Record<string, unknown>>,
    config: {} as Record<string, unknown>,
    workspaceFiles: {} as Record<string, string>,
    startedAt: new Date().toISOString(),
  };

  /** Trim memories array to MAX_MEMORIES, removing oldest entries first. */
  function trimMemories(): void {
    if (MAX_MEMORIES > 0 && state.memories.length > MAX_MEMORIES) {
      state.memories.splice(0, state.memories.length - MAX_MEMORIES);
    }
  }

  function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let body = "";
      let totalBytes = 0;
      req.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (MAX_BODY_BYTES > 0 && totalBytes > MAX_BODY_BYTES) {
          req.destroy();
          reject(new Error("Request body too large"));
          return;
        }
        body += chunk;
      });
      req.on("end", () => resolve(body));
      req.on("error", reject);
    });
  }

  // ─── elizaOS Runtime ──────────────────────────────────────────────────

  async function initRuntime(): Promise<void> {
    const elizaAvailable = await import("@elizaos/core")
      .then(() => true)
      .catch(() => false);

    if (elizaAvailable) {
      const {
        AgentRuntime: AgentRuntimeCtor,
        createCharacter,
        createMessageMemory,
        stringToUuid,
        ChannelType,
      } = await import("@elizaos/core");

      const character = createCharacter({
        name: process.env.AGENT_NAME ?? "CloudAgent",
        bio: "An elizaOS agent running in the cloud.",
        settings: {
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

      const cloudPlugin = await import("@elizaos/plugin-elizacloud")
        .then((m) => m.default ?? m.elizaOSCloudPlugin)
        .catch(() => null);
      if (cloudPlugin) plugins.push(cloudPlugin);

      const sqlPlugin = await import("@elizaos/plugin-sql")
        .then((m) => m.default ?? m.sqlPlugin)
        .catch(() => null);
      if (sqlPlugin) plugins.push(sqlPlugin);

      const runtime = new AgentRuntimeCtor({ character, plugins });
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
          mode: "simple" | "power",
        ): Promise<string> => {
          const message = createMessageMemory({
            id: crypto.randomUUID() as ReturnType<typeof stringToUuid>,
            entityId: userId,
            roomId,
            content: {
              text,
              ...(enableChatMode ? { mode, simple: mode === "simple" } : {}),
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
          trimMemories();

          return responseText || "(no response)";
        },
        processMessageStream: async (
          text: string,
          _roomId: string,
          mode: "simple" | "power",
          onChunk: (chunk: string) => void,
        ): Promise<string> => {
          const message = createMessageMemory({
            id: crypto.randomUUID() as ReturnType<typeof stringToUuid>,
            entityId: userId,
            roomId,
            content: {
              text,
              ...(enableChatMode ? { mode, simple: mode === "simple" } : {}),
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
          trimMemories();

          return responseText || "(no response)";
        },
        getMemories: () => state.memories,
        getConfig: () => state.config,
      };

      console.log("[cloud-agent] elizaOS runtime initialized with real agent");
    } else {
      console.warn(
        "[cloud-agent] @elizaos/core not available, running in echo mode",
      );
      agentRuntime = {
        processMessage: async (
          text: string,
          _roomId: string,
          _mode: "simple" | "power",
        ): Promise<string> => {
          state.memories.push({ role: "user", text, timestamp: Date.now() });
          const reply = `[echo] ${text}`;
          state.memories.push({
            role: "assistant",
            text: reply,
            timestamp: Date.now(),
          });
          trimMemories();
          return reply;
        },
        processMessageStream: async (
          text: string,
          _roomId: string,
          _mode: "simple" | "power",
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
          trimMemories();
          return reply;
        },
        getMemories: () => state.memories,
        getConfig: () => state.config,
      };
    }
  }

  // ─── Health endpoint ──────────────────────────────────────────────────

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
        JSON.stringify({
          service: "elizaos-cloud-agent",
          status: "running",
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end("Not Found");
  });

  healthServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[cloud-agent] Health endpoint listening on port ${PORT}`);
  });

  // ─── Bridge HTTP server ───────────────────────────────────────────────

  const bridgeServer = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");

    // Auth check (only when BRIDGE_SECRET is configured)
    if (BRIDGE_SECRET) {
      const authHeader = req.headers["authorization"] ?? "";
      if (authHeader !== `Bearer ${BRIDGE_SECRET}`) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }

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
      const body = await readBody(req);
      const incoming = JSON.parse(body) as Partial<typeof state>;
      if (incoming.memories) state.memories = incoming.memories;
      if (incoming.config) state.config = incoming.config;
      if (incoming.workspaceFiles)
        state.workspaceFiles = incoming.workspaceFiles;
      console.log("[cloud-agent] State restored from snapshot");
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // ── SSE streaming endpoint ────────────────────────────────────────
    if (req.method === "POST" && req.url === "/bridge/stream") {
      if (!agentRuntime) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Agent runtime not ready" }));
        return;
      }

      const body = await readBody(req);
      const rpc = JSON.parse(body) as {
        jsonrpc: string;
        id?: string | number;
        method?: string;
        params?: BridgeRpcParams;
      };

      if (rpc.method !== "message.send") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Only message.send is streamable" }));
        return;
      }

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
      const mode: "simple" | "power" =
        rpc.params?.mode === "simple" ? "simple" : "power";

      sendEvent("connected", { rpcId: rpc.id, timestamp: Date.now() });

      await agentRuntime.processMessageStream(
        text,
        roomId,
        mode,
        (chunk: string) => {
          sendEvent("chunk", { text: chunk });
        },
      );

      sendEvent("done", { rpcId: rpc.id, timestamp: Date.now() });
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/bridge") {
      const body = await readBody(req);
      const rpc = JSON.parse(body) as {
        jsonrpc: string;
        id?: string | number;
        method?: string;
        params?: BridgeRpcParams;
      };

      if (rpc.method === "message.send") {
        if (!agentRuntime) {
          res.writeHead(503);
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: rpc.id,
              error: {
                code: -32000,
                message: "Agent runtime not ready",
              },
            }),
          );
          return;
        }
        const text = (rpc.params?.text as string) ?? "";
        const roomId = (rpc.params?.roomId as string) ?? "default";
        const mode: "simple" | "power" =
          rpc.params?.mode === "simple" ? "simple" : "power";
        const responseText = await agentRuntime.processMessage(
          text,
          roomId,
          mode,
        );
        res.writeHead(200);
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: {
              text: responseText,
              metadata: { timestamp: Date.now() },
            },
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
          error: {
            code: -32601,
            message: `Method not found: ${rpc.method}`,
          },
        }),
      );
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  bridgeServer.listen(BRIDGE_PORT, "0.0.0.0", () => {
    console.log(`[cloud-agent] Bridge server listening on port ${BRIDGE_PORT}`);
    if (!BRIDGE_SECRET) {
      console.warn(
        "[cloud-agent] WARNING: BRIDGE_SECRET is not set — bridge server is running without authentication",
      );
    }
  });

  // ─── Startup ──────────────────────────────────────────────────────────

  function shutdown() {
    console.log("[cloud-agent] Shutting down...");
    healthServer.close();
    bridgeServer.close();
    process.exit(0);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  initRuntime()
    .then(() => {
      console.log("[cloud-agent] Ready");
    })
    .catch((err) => {
      console.error("[cloud-agent] Runtime init failed:", err);
    });
}
