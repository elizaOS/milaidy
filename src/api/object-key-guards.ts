/**
 * Object key guards to prevent prototype-pollution vectors in untrusted JSON.
 */

export function isBlockedObjectKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

export function hasBlockedObjectKeyDeep(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(hasBlockedObjectKeyDeep);
  if (typeof value !== "object") return false;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isBlockedObjectKey(key)) return true;
    if (hasBlockedObjectKeyDeep(child)) return true;
  }
  return false;
}
