/**
 * Local type stubs for @elizaos/plugin-agent-orchestrator.
 *
 * The installed version (0.2.0) has a broken `types` entry in package.json
 * (points to dist/index.d.ts which doesn't exist — actual types are at
 * dist/src/index.d.ts). Rather than patching the package, we define minimal
 * interfaces here covering only what server.ts actually uses.
 */

/** Coordination decision returned by the LLM when evaluating a swarm event. */
export interface CoordinationLLMResponse {
  action: "respond" | "escalate" | "ignore" | "complete";
  response?: string;
  useKeys?: boolean;
  keys?: string[];
  reasoning: string;
}

/** Swarm coordinator event broadcast over WS. */
export interface SwarmEvent {
  type: string;
  [key: string]: unknown;
}

/** Per-session task context provided to the coordinator. */
export interface TaskContext {
  sessionId: string;
  agentType: string;
  label: string;
  originalTask: string;
  workdir: string;
}

/** Console bridge exposed by PTYService for terminal I/O. */
export interface ConsoleBridge {
  // biome-ignore lint/suspicious/noExplicitAny: EventEmitter-style listener signature
  on(event: string, listener: (...args: any[]) => void): void;
  // biome-ignore lint/suspicious/noExplicitAny: EventEmitter-style listener signature
  off(event: string, listener: (...args: any[]) => void): void;
  writeRaw(sessionId: string, data: string): void;
  resize(sessionId: string, cols: number, rows: number): void;
}

/** PTY service interface (accessed via runtime.getService). */
export interface PTYService {
  consoleBridge?: ConsoleBridge;
  stopSession?(sessionId: string): Promise<void>;
}

const VALID_ACTIONS = ["respond", "escalate", "ignore", "complete"];

/**
 * Find the first JSON object containing an "action" key using balanced brace
 * matching. This handles nested objects correctly, unlike a simple regex.
 */
function extractJsonWithAction(text: string): string | null {
  const idx = text.indexOf('"action"');
  if (idx === -1) return null;
  // Find the opening brace before "action"
  const start = text.lastIndexOf("{", idx);
  if (start === -1) return null;
  // Count braces to find the matching close brace
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/**
 * Parse a JSON action block from Milaidy's natural language response.
 * Looks for a fenced ```json block first, then bare JSON with "action" key.
 * Returns null if no valid action block is found.
 */
export function parseActionBlock(text: string): CoordinationLLMResponse | null {
  if (!text) return null;
  // Try fenced ```json block first
  const fenced = text.match(/```(?:json)?\s*\n?(\{[\s\S]*?\})\s*\n?```/);
  // Bare JSON fallback: use balanced brace matching to handle nested objects
  const jsonStr = fenced?.[1] ?? extractJsonWithAction(text);
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (!VALID_ACTIONS.includes(parsed.action)) return null;
    const result: CoordinationLLMResponse = {
      action: parsed.action,
      reasoning: parsed.reasoning || "",
    };
    if (parsed.action === "respond") {
      if (parsed.useKeys && Array.isArray(parsed.keys)) {
        result.useKeys = true;
        result.keys = parsed.keys.map(String);
      } else if (typeof parsed.response === "string") {
        result.response = parsed.response;
      } else return null;
    }
    return result;
  } catch {
    return null;
  }
}
