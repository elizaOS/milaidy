import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentRuntime,
  elizaLogger,
  type Memory,
  ModelType,
  type Plugin,
  stringToUuid,
} from "@elizaos/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3939; // Fixed port for benchmark

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function toPlugin(candidate: unknown, source: string): Plugin {
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`Plugin from ${source} was not an object`);
  }

  const pluginLike = candidate as { name?: unknown };
  if (typeof pluginLike.name !== "string" || pluginLike.name.length === 0) {
    throw new Error(`Plugin from ${source} was missing a valid name`);
  }

  // Local workspace plugins can carry a slightly different type identity.
  return candidate as Plugin;
}

// Proper robust server implementation
export async function startBenchmarkServer() {
  elizaLogger.info("[bench] Initializing milaidy benchmark runtime...");

  // Plugins
  const plugins: Plugin[] = [];

  // 1. SQL Plugin (Core) - Registers adapter automatically?
  try {
    const { default: sqlPlugin } = await import("@elizaos/plugin-sql");
    plugins.push(toPlugin(sqlPlugin, "@elizaos/plugin-sql"));
    elizaLogger.info("[bench] Loaded core plugin: @elizaos/plugin-sql");
  } catch (error: unknown) {
    elizaLogger.error(
      `[bench] Failed to load sql plugin: ${formatUnknownError(error)}`,
    );
  }

  // 2. Computer Use Plugin (Local)
  if (process.env.MILAIDY_ENABLE_COMPUTERUSE) {
    try {
      // Import directly from source to ensure we use Native backend (not MCP)
      // const computerUsePlugin = await import("@elizaos/plugin-computeruse").then(m => m.computerUsePlugin || m.default);
      const { computerUsePlugin } = await import(
        "../../../eliza/packages/plugin-computeruse/src/index.ts"
      );
      plugins.push(
        toPlugin(
          computerUsePlugin,
          "../../../eliza/packages/plugin-computeruse/src/index.ts",
        ),
      );
      elizaLogger.info(
        "[bench] Loaded local plugin: @elizaos/plugin-computeruse",
      );
    } catch (error: unknown) {
      elizaLogger.error(
        `[bench] Failed to load computer use plugin: ${formatUnknownError(error)}`,
      );
    }
  }

  // 3. OpenAI Plugin (for Groq)
  try {
    const { default: openaiPlugin } = await import("@elizaos/plugin-openai");
    plugins.push(toPlugin(openaiPlugin, "@elizaos/plugin-openai"));
    elizaLogger.info("[bench] Loaded plugin: @elizaos/plugin-openai");
  } catch (error: unknown) {
    elizaLogger.error(
      `[bench] Failed to load openai plugin: ${formatUnknownError(error)}`,
    );
  }

  // 4. Mock Plugin
  if (process.env.MILAIDY_BENCH_MOCK === "true") {
    try {
      // Updated import path if needed, assuming relative to this file
      const { mockPlugin } = await import("./mock-plugin.ts");
      plugins.push(toPlugin(mockPlugin, "./mock-plugin.ts"));
      elizaLogger.info("[bench] Loaded mock plugin");
    } catch (error: unknown) {
      elizaLogger.error(
        `[bench] Failed to load mock plugin: ${formatUnknownError(error)}`,
      );
    }
  }

  // Runtime Configuration
  const runtime = new AgentRuntime({
    character: {
      name: "Kira",
      bio: ["A computer user agent."],
      messageExamples: [],
      topics: [],
      adjectives: [],
      plugins: [],
    },
    plugins: plugins,
  });

  await runtime.initialize();
  elizaLogger.info(
    `[bench] Runtime initialized — agent=${runtime.character.name}, plugins=${plugins.length}`,
  );

  // HTTP Server for Benchmark Adapter
  const server = http.createServer(async (req, res) => {
    // CORs
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === "/api/benchmark/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ready" }));
      return;
    }

    if (req.url === "/api/benchmark/reset" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.url === "/api/benchmark/message" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { text, image } = JSON.parse(body) as {
            text?: unknown;
            image?: unknown;
          };
          if (typeof text !== "string" || text.trim().length === 0) {
            throw new Error(
              "Request body must include non-empty string `text`",
            );
          }

          elizaLogger.info(`[bench] Received prompt: ${text}`);

          // Use Mock Plugin Text Generation directly if available?
          // Or follow standard flow.

          // Standard flow:
          // 1. Embed text (for memory search)
          // 2. Generate response (LLM)

          // If mock plugin simulates LLM, runtime.generateText is fine.
          // But if mocks rely on "text_generation" vs "TEXT_GENERATION"...

          // We will invoke `mockPlugin` logic if needed.
          // But preferably use standard `runtime.generateText`.

          const incomingMessage: Memory = {
            content: { text },
            entityId: stringToUuid("user"),
            agentId: runtime.agentId,
            roomId: stringToUuid("bench-room"),
          };
          const state = await runtime.composeState(incomingMessage);

          // Force generation
          // We use `generateText` with basic context
          // For Computer Use, we expect actions.
          // Mock plugin returns <BENCHMARK_ACTION>...

          // Define Prompt Context
          const promptContext = `Task: ${text}
          
          You are an AI agent that can control a computer.
          Available actions: CLICK, TYPE, SCROLL, etc.
          
          Current State:
          ${JSON.stringify(state)}
          ${image ? `\nAttached Image:\n${JSON.stringify(image)}\n` : ""}
          
          Generate the next action to take.
          `;

          // Generate text
          try {
            const { text: generatedText } = await runtime.generateText(
              promptContext,
              {
                modelType: ModelType.TEXT_SMALL,
                stopSequences: [],
              },
            );
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                text: generatedText,
                actions: [], // Parse if needed here, but adapter does it
              }),
            );
          } catch (err: unknown) {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            elizaLogger.error(
              `[bench] Text generation error: ${formatUnknownError(err)}`,
            );
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: errorMessage }));
          }
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          elizaLogger.error(
            `[bench] Request error: ${formatUnknownError(err)}`,
          );
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: errorMessage }));
        }
      });
      return;
    }

    // Fallback 404
    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(PORT, () => {
    elizaLogger.info(
      `[bench] Milaidy benchmark server listening on port ${PORT}`,
    );
    console.log(`MILAIDY_BENCH_READY port=${PORT}`); // Signal for python adapter
  });
}

// Invoke start
startBenchmarkServer().catch((err) => {
  elizaLogger.error(
    `[bench] Failed to start benchmark server: ${formatUnknownError(err)}`,
  );
  process.exit(1);
});
