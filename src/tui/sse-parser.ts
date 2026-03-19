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

function commonPrefixLength(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length);
  let index = 0;
  while (
    index < maxLength &&
    left.charCodeAt(index) === right.charCodeAt(index)
  ) {
    index += 1;
  }
  return index;
}

function commonSuffixLength(
  left: string,
  right: string,
  sharedPrefixLength: number,
): number {
  const maxLength = Math.min(
    left.length - sharedPrefixLength,
    right.length - sharedPrefixLength,
  );
  let length = 0;
  while (
    length < maxLength &&
    left.charCodeAt(left.length - 1 - length) ===
      right.charCodeAt(right.length - 1 - length)
  ) {
    length += 1;
  }
  return length;
}

function isLikelySnapshotReplacement(
  existing: string,
  incoming: string,
): boolean {
  const sharedPrefixLength = commonPrefixLength(existing, incoming);
  const sharedSuffixLength = commonSuffixLength(
    existing,
    incoming,
    sharedPrefixLength,
  );
  const sharedLength = sharedPrefixLength + sharedSuffixLength;
  const minLength = Math.min(existing.length, incoming.length);

  return (
    sharedPrefixLength >= 8 ||
    sharedLength >= Math.max(4, Math.ceil(minLength * 0.7))
  );
}

export function mergeStreamingText(existing: string, incoming: string): string {
  if (!incoming) return existing;
  if (!existing) return incoming;
  if (incoming === existing) return existing;

  if (incoming.startsWith(existing)) {
    return incoming;
  }

  if (incoming.includes(existing)) {
    return incoming;
  }

  if (existing.startsWith(incoming)) {
    return existing;
  }

  const maxOverlap = Math.min(existing.length, incoming.length);
  const existingLength = existing.length;
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const existingStart = existingLength - overlap;
    let match = true;
    for (let index = 0; index < overlap; index += 1) {
      if (
        existing.charCodeAt(existingStart + index) !==
        incoming.charCodeAt(index)
      ) {
        match = false;
        break;
      }
    }
    if (!match) continue;

    if (overlap === incoming.length) {
      return incoming.length === 1 ? `${existing}${incoming}` : existing;
    }

    return `${existing}${incoming.slice(overlap)}`;
  }

  if (isLikelySnapshotReplacement(existing, incoming)) {
    return incoming;
  }

  return `${existing}${incoming}`;
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
