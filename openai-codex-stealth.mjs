/**
 * OpenAI Codex Stealth Mode
 *
 * Monkey-patches global fetch to intercept OpenAI API requests made with
 * ChatGPT subscription OAuth tokens. Converts chat/completions requests
 * to the Codex responses API format and routes them to chatgpt.com/backend-api.
 *
 * Handles:
 * 1. /v1/chat/completions → /codex/responses (format conversion)
 * 2. /v1/embeddings → local fallback (subscriptions don't support embeddings API)
 * 3. /v1/models → passthrough (works with subscription tokens)
 *
 * Loaded before the elizaOS runtime so ALL OpenAI calls are patched.
 */

const CODEX_BASE_URL = "https://chatgpt.com/backend-api";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

// Codex API only supports specific model names — remap standard ones
const DEFAULT_CODEX_MODEL = "gpt-5.3-codex";

const MODEL_REMAP = {
  // Standard API models → Codex 5.3
  "gpt-4o": DEFAULT_CODEX_MODEL,
  "gpt-4o-mini": DEFAULT_CODEX_MODEL,
  "gpt-4.1": DEFAULT_CODEX_MODEL,
  "gpt-4.1-mini": DEFAULT_CODEX_MODEL,
  "gpt-4.1-nano": DEFAULT_CODEX_MODEL,
  "gpt-4": DEFAULT_CODEX_MODEL,
  "gpt-4-turbo": DEFAULT_CODEX_MODEL,
  "gpt-3.5-turbo": DEFAULT_CODEX_MODEL,
  "o3-mini": DEFAULT_CODEX_MODEL,
  o3: DEFAULT_CODEX_MODEL,
  o1: DEFAULT_CODEX_MODEL,
  "o1-mini": DEFAULT_CODEX_MODEL,
  "o1-preview": DEFAULT_CODEX_MODEL,
  // elizaOS defaults (plugin-openai alpha.3)
  "gpt-5": DEFAULT_CODEX_MODEL,
  "gpt-5-mini": DEFAULT_CODEX_MODEL,
  "gpt-5-mini-transcribe": DEFAULT_CODEX_MODEL,
  "gpt-5.1": DEFAULT_CODEX_MODEL,
};

function remapModel(model) {
  return MODEL_REMAP[model] || model;
}

// Detect ChatGPT subscription OAuth tokens (JWT format from auth.openai.com)
function isSubscriptionToken(val) {
  if (typeof val !== "string") return false;
  // Standard API keys start with sk-
  if (val.startsWith("sk-")) return false;
  // OAuth tokens are JWTs (3 dot-separated parts)
  const parts = val.split(".");
  if (parts.length !== 3) return false;
  // Verify it has the chatgpt account claim
  try {
    const payload = JSON.parse(atob(parts[1]));
    return !!payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
  } catch {
    return false;
  }
}

function extractAccountId(token) {
  try {
    const parts = token.split(".");
    const payload = JSON.parse(atob(parts[1]));
    return payload[JWT_CLAIM_PATH]?.chatgpt_account_id;
  } catch {
    return null;
  }
}

function extractToken(headers) {
  if (!headers) return null;
  // Check Authorization: Bearer <token>
  const auth = headers.Authorization || headers.authorization;
  if (auth) {
    const token = auth.replace(/^Bearer\s+/i, "");
    if (isSubscriptionToken(token)) return token;
  }
  return null;
}

// ============================================================================
// Chat Completions → Responses API conversion
// ============================================================================

function convertMessagesToInput(messages) {
  const input = [];
  for (const msg of messages) {
    if (msg.role === "system") continue; // handled separately as instructions

    const role = msg.role === "assistant" ? "assistant" : "user";

    if (typeof msg.content === "string") {
      input.push({
        role,
        content: [
          {
            type: role === "user" ? "input_text" : "output_text",
            text: msg.content,
          },
        ],
      });
    } else if (Array.isArray(msg.content)) {
      const parts = msg.content.map((part) => {
        if (part.type === "text") {
          return {
            type: role === "user" ? "input_text" : "output_text",
            text: part.text,
          };
        }
        if (part.type === "image_url") {
          return { type: "input_image", image_url: part.image_url.url };
        }
        return part;
      });
      input.push({ role, content: parts });
    }

    // Handle tool calls from assistant
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        input.push({
          type: "function_call",
          id: tc.id,
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        });
      }
    }

    // Handle tool results
    if (msg.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: msg.tool_call_id,
        output:
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content),
      });
    }
  }
  return input;
}

function convertToolsToResponsesFormat(tools) {
  if (!tools) return undefined;
  return tools.map((tool) => ({
    type: "function",
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
    strict: null,
  }));
}

function buildResponsesBody(chatBody) {
  // Extract system prompt from messages
  const systemMessages = (chatBody.messages || [])
    .filter((m) => m.role === "system")
    .map((m) =>
      typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    );
  const instructions = systemMessages.join("\n\n") || undefined;

  const mappedModel = remapModel(chatBody.model);
  // Codex API requires stream:true always — we'll convert back for non-streaming callers
  const body = {
    model: mappedModel,
    store: false,
    stream: true,
    input: convertMessagesToInput(chatBody.messages || []),
    text: { verbosity: "medium" },
    include: ["reasoning.encrypted_content"],
    tool_choice: chatBody.tool_choice || "auto",
    parallel_tool_calls: true,
  };

  // Codex API requires instructions field, always provide one
  body.instructions = instructions || "You are a helpful assistant.";

  if (chatBody.tools) {
    body.tools = convertToolsToResponsesFormat(chatBody.tools);
  }

  if (chatBody.temperature !== undefined) {
    body.temperature = chatBody.temperature;
  }

  if (chatBody.max_tokens !== undefined) {
    body.max_completion_tokens = chatBody.max_tokens;
  }

  return body;
}

// ============================================================================
// Responses → Chat Completions SSE stream conversion
// ============================================================================

function createChatCompletionChunk(id, model, delta, finishReason = null) {
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  };
}

function transformResponsesStream(_responsesBody, model) {
  const id = `chatcmpl-${Date.now()}`;
  let sentRole = false;
  let currentToolCallIndex = -1;
  const toolCallIds = new Map(); // item_id -> index

  const transform = new TransformStream({
    transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      const lines = text.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") {
          if (data === "[DONE]") {
            controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          }
          continue;
        }

        let event;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }

        const type = event.type;

        // Send initial role
        if (
          type === "response.output_item.added" &&
          event.item?.type === "message" &&
          !sentRole
        ) {
          sentRole = true;
          const chunk = createChatCompletionChunk(id, model, {
            role: "assistant",
            content: "",
          });
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`),
          );
        }

        // Text content delta
        if (
          type === "response.output_text.delta" ||
          type === "response.content_part.delta"
        ) {
          const deltaText = event.delta?.text ?? event.delta ?? "";
          if (typeof deltaText === "string" && deltaText) {
            const chunk = createChatCompletionChunk(id, model, {
              content: deltaText,
            });
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`),
            );
          }
        }

        // Function call added
        if (
          type === "response.output_item.added" &&
          event.item?.type === "function_call"
        ) {
          currentToolCallIndex++;
          toolCallIds.set(event.item.id, currentToolCallIndex);
          const chunk = createChatCompletionChunk(id, model, {
            tool_calls: [
              {
                index: currentToolCallIndex,
                id: event.item.call_id || event.item.id,
                type: "function",
                function: {
                  name: event.item.name || "",
                  arguments: "",
                },
              },
            ],
          });
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`),
          );
        }

        // Function call arguments delta
        if (type === "response.function_call_arguments.delta") {
          const idx = toolCallIds.get(event.item_id) ?? currentToolCallIndex;
          const chunk = createChatCompletionChunk(id, model, {
            tool_calls: [
              {
                index: idx,
                function: {
                  arguments: event.delta || "",
                },
              },
            ],
          });
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`),
          );
        }

        // Done
        if (type === "response.completed" || type === "response.done") {
          const finishChunk = createChatCompletionChunk(id, model, {}, "stop");

          // Add usage if available
          const usage = event.response?.usage;
          if (usage) {
            finishChunk.usage = {
              prompt_tokens: usage.input_tokens || 0,
              completion_tokens: usage.output_tokens || 0,
              total_tokens:
                (usage.input_tokens || 0) + (usage.output_tokens || 0),
            };
          }

          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify(finishChunk)}\n\n`,
            ),
          );
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        }

        // Error
        if (type === "error" || type === "response.failed") {
          const msg =
            event.message || event.response?.error?.message || "Unknown error";
          console.error(`[openai-stealth] Codex error: ${msg}`);
        }
      }
    },
  });

  return transform;
}

// Non-streaming response conversion
function _convertResponsesResultToCompletion(responsesResult, model) {
  const id = `chatcmpl-${Date.now()}`;
  const output = responsesResult.output || [];

  let content = "";
  const toolCalls = [];

  for (const item of output) {
    if (item.type === "message" && item.content) {
      for (const part of item.content) {
        if (part.type === "output_text") {
          content += part.text;
        }
      }
    }
    if (item.type === "function_call") {
      toolCalls.push({
        id: item.call_id || item.id,
        type: "function",
        function: {
          name: item.name,
          arguments: item.arguments,
        },
      });
    }
  }

  const message = { role: "assistant", content: content || null };
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  const usage = responsesResult.usage;
  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
      },
    ],
    usage: usage
      ? {
          prompt_tokens: usage.input_tokens || 0,
          completion_tokens: usage.output_tokens || 0,
          total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
        }
      : undefined,
  };
}

// ============================================================================
// Fetch Interceptor
// ============================================================================

const originalFetch = globalThis.fetch;

globalThis.fetch = async function openaiStealthFetch(input, init) {
  const url = typeof input === "string" ? input : input?.url || "";

  // Only intercept OpenAI API calls
  if (!url.includes("api.openai.com")) {
    return originalFetch(input, init);
  }

  if (!init) {
    return originalFetch(input, init);
  }

  const token = extractToken(init.headers || {});
  if (!token) {
    // Not a subscription token, pass through
    return originalFetch(input, init);
  }

  const accountId = extractAccountId(token);
  if (!accountId) {
    console.warn("[openai-stealth] Could not extract account ID from token");
    return originalFetch(input, init);
  }

  // === Handle /v1/chat/completions ===
  if (url.includes("/chat/completions")) {
    let chatBody;
    try {
      chatBody = JSON.parse(init.body);
    } catch {
      return originalFetch(input, init);
    }

    const isStreaming = chatBody.stream === true;
    const originalModel = chatBody.model;
    chatBody.model = remapModel(chatBody.model);
    const responsesBody = buildResponsesBody(chatBody);

    console.log(
      `[openai-stealth] ${originalModel}${originalModel !== chatBody.model ? ` → ${chatBody.model}` : ""} → chatgpt.com/backend-api/codex/responses (${isStreaming ? "stream" : "sync"})`,
    );

    const codexUrl = `${CODEX_BASE_URL}/codex/responses`;
    const headers = {
      Authorization: `Bearer ${token}`,
      "chatgpt-account-id": accountId,
      "OpenAI-Beta": "responses=experimental",
      originator: "pi",
      "User-Agent": "pi (linux; stealth)",
      accept: "text/event-stream",
      "content-type": "application/json",
    };

    const response = await originalFetch(codexUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(responsesBody),
      signal: init.signal,
    });

    if (!response.ok) {
      // Return error in OpenAI format
      const errorText = await response.text();
      console.error(
        `[openai-stealth] Codex API error ${response.status}: ${errorText}`,
      );

      // Try to parse friendly error
      let errorMessage = errorText;
      try {
        const parsed = JSON.parse(errorText);
        const err = parsed?.error;
        if (err?.code?.includes("usage_limit")) {
          const plan = err.plan_type ? ` (${err.plan_type} plan)` : "";
          errorMessage = `ChatGPT usage limit reached${plan}. Try again later.`;
        } else {
          errorMessage = err?.message || errorText;
        }
      } catch {}

      return new Response(
        JSON.stringify({
          error: {
            message: errorMessage,
            type: "api_error",
            code: response.status,
          },
        }),
        {
          status: response.status,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (isStreaming && response.body) {
      // Transform the responses stream → chat completions stream
      const transform = transformResponsesStream(responsesBody, chatBody.model);
      const transformedStream = response.body.pipeThrough(transform);

      return new Response(transformedStream, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
      });
    } else {
      // Non-streaming caller but Codex always streams — collect SSE and build JSON response
      const fullText = await response.text();
      const events = fullText
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .filter((d) => d && d !== "[DONE]");

      let content = "";
      const toolCalls = [];
      let usage = null;

      for (const eventStr of events) {
        try {
          const event = JSON.parse(eventStr);
          const type = event.type;

          // Collect text deltas
          if (
            type === "response.output_text.delta" ||
            type === "response.content_part.delta"
          ) {
            const deltaText = event.delta?.text ?? event.delta ?? "";
            if (typeof deltaText === "string") content += deltaText;
          }

          // Collect function calls from completed response
          if (type === "response.completed" || type === "response.done") {
            const resp = event.response;
            if (resp?.usage) {
              usage = {
                prompt_tokens: resp.usage.input_tokens || 0,
                completion_tokens: resp.usage.output_tokens || 0,
                total_tokens:
                  (resp.usage.input_tokens || 0) +
                  (resp.usage.output_tokens || 0),
              };
            }
            // Extract any function calls from output
            for (const item of resp?.output || []) {
              if (item.type === "function_call") {
                toolCalls.push({
                  id: item.call_id || item.id,
                  type: "function",
                  function: { name: item.name, arguments: item.arguments },
                });
              }
            }
          }
        } catch {}
      }

      const message = { role: "assistant", content: content || null };
      if (toolCalls.length > 0) message.tool_calls = toolCalls;

      const completion = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: chatBody.model,
        choices: [
          {
            index: 0,
            message,
            finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
          },
        ],
        usage,
      };

      return new Response(JSON.stringify(completion), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
  }

  // === Handle /v1/embeddings ===
  if (url.includes("/embeddings")) {
    // ChatGPT subscriptions don't support embeddings API
    // Return a zero vector so the runtime doesn't crash
    let body;
    try {
      body = JSON.parse(init.body);
    } catch {
      body = {};
    }

    const inputs = Array.isArray(body.input) ? body.input : [body.input || ""];
    const dimensions = body.dimensions || 1536;

    console.log(
      `[openai-stealth] Embeddings not supported with subscription token, returning zero vectors (${inputs.length} inputs)`,
    );

    const data = inputs.map((_, i) => ({
      object: "embedding",
      index: i,
      embedding: new Array(dimensions).fill(0),
    }));

    return new Response(
      JSON.stringify({
        object: "list",
        data,
        model: body.model || "text-embedding-3-small",
        usage: { prompt_tokens: 0, total_tokens: 0 },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }

  // === Handle /v1/models ===
  if (url.includes("/models")) {
    // Models endpoint doesn't work with subscription tokens either
    // Return a minimal list so the runtime can check model availability
    console.log(
      "[openai-stealth] Models list → returning defaults for subscription",
    );
    return new Response(
      JSON.stringify({
        object: "list",
        data: [
          { id: "gpt-4o", object: "model", owned_by: "openai" },
          { id: "gpt-4o-mini", object: "model", owned_by: "openai" },
          { id: "gpt-4.1", object: "model", owned_by: "openai" },
          { id: "gpt-4.1-mini", object: "model", owned_by: "openai" },
          { id: "o3-mini", object: "model", owned_by: "openai" },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }

  // Everything else: pass through
  return originalFetch(input, init);
};

console.log(
  "[openai-stealth] OpenAI Codex stealth mode active — ChatGPT subscription requests will be routed to chatgpt.com/backend-api",
);
