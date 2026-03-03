export interface SseEventBreak {
  index: number;
  length: number;
}

export interface SseDrainResult {
  events: string[];
  remaining: string;
}

export interface ConversationStreamPayload {
  type?: string;
  text?: string;
  fullText?: string;
  agentName?: string;
  message?: string;
}

/**
 * Find the next SSE event boundary in the buffer.
 * Supports both LF (\n\n) and CRLF (\r\n\r\n) framing.
 */
export function findSseEventBreak(buffer: string): SseEventBreak | null {
  const lfBreak = buffer.indexOf("\n\n");
  const crlfBreak = buffer.indexOf("\r\n\r\n");

  if (lfBreak === -1 && crlfBreak === -1) return null;
  if (lfBreak === -1) return { index: crlfBreak, length: 4 };
  if (crlfBreak === -1) return { index: lfBreak, length: 2 };

  return lfBreak < crlfBreak
    ? { index: lfBreak, length: 2 }
    : { index: crlfBreak, length: 4 };
}

/**
 * Split a chunk buffer into complete SSE raw events + the remaining tail.
 */
export function drainSseEvents(buffer: string): SseDrainResult {
  const events: string[] = [];
  let remaining = buffer;

  let eventBreak = findSseEventBreak(remaining);
  while (eventBreak) {
    events.push(remaining.slice(0, eventBreak.index));
    remaining = remaining.slice(eventBreak.index + eventBreak.length);
    eventBreak = findSseEventBreak(remaining);
  }

  return { events, remaining };
}

/**
 * Extract `data:` payloads from one raw SSE event block.
 */
export function extractSseDataPayloads(rawEvent: string): string[] {
  const payloads: string[] = [];
  for (const line of rawEvent.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    payloads.push(payload);
  }
  return payloads;
}

/**
 * Parse JSON payload for conversation streaming events.
 */
export function parseConversationStreamPayload(
  payload: string,
): ConversationStreamPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  return {
    type: typeof record.type === "string" ? record.type : undefined,
    text: typeof record.text === "string" ? record.text : undefined,
    fullText: typeof record.fullText === "string" ? record.fullText : undefined,
    agentName:
      typeof record.agentName === "string" ? record.agentName : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
  };
}
