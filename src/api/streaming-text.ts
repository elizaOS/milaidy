export * from "@elizaos/autonomous/api/streaming-text";

export function computeStreamingDelta(
  existing: string,
  incoming: string,
): string {
  if (!incoming) return "";
  if (!existing) return incoming;
  if (incoming === existing) return "";
  if (incoming.startsWith(existing)) return incoming.slice(existing.length);
  if (existing.startsWith(incoming)) return "";
  if (existing.endsWith(incoming) || existing.includes(incoming)) return "";

  const maxOverlap = Math.min(existing.length, incoming.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (existing.endsWith(incoming.slice(0, overlap))) {
      return incoming.slice(overlap);
    }
  }

  return incoming;
}
