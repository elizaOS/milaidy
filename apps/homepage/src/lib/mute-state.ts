const MUTE_KEY = "milady-muted-agents";

function getMutedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(MUTE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveMutedSet(set: Set<string>): void {
  localStorage.setItem(MUTE_KEY, JSON.stringify([...set]));
}

export function isAgentMuted(agentId: string): boolean {
  return getMutedSet().has(agentId);
}

export function toggleAgentMute(agentId: string): boolean {
  const set = getMutedSet();
  if (set.has(agentId)) {
    set.delete(agentId);
    saveMutedSet(set);
    return false;
  }
  set.add(agentId);
  saveMutedSet(set);
  return true;
}

export function setAgentMuted(agentId: string, muted: boolean): void {
  const set = getMutedSet();
  if (muted) {
    set.add(agentId);
  } else {
    set.delete(agentId);
  }
  saveMutedSet(set);
}
