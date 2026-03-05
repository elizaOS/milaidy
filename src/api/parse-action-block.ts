import type { CoordinationLLMResponse } from "@elizaos/plugin-agent-orchestrator";

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
 * Parse a JSON action block from Milaidy's natural language response.
 * Looks for a fenced ```json block first, then bare JSON with "action" key.
 * Returns null if no valid action block is found.
 */
export function parseActionBlock(text: string): CoordinationLLMResponse | null {
  if (!text) return null;
  // Try fenced ```json block first
  const fenced = text.match(/```(?:json)?\s*\n?(\{[\s\S]*?\})\s*\n?```/);
  // Bare JSON fallback: non-greedy match from first { containing "action" to next }
  const jsonStr = fenced?.[1] ?? text.match(/\{[^}]*"action"[^}]*\}/)?.[0];
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
