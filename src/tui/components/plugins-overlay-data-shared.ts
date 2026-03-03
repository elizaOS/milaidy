import type { AgentRuntime } from "@elizaos/core";

export interface PluginsOverlayOptions {
  runtime: AgentRuntime;
  /** Optional API base URL for remote plugin management (e.g. http://127.0.0.1:31337). */
  apiBaseUrl?: string;
  onClose: () => void;
  requestRender: () => void;
}

export type ApiPluginParameter = {
  key: string;
  required?: boolean;
  sensitive?: boolean;
  currentValue?: string | null;
  isSet?: boolean;
};

export type ApiPluginEntry = {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  category?: string;
  version?: string;
  npmName?: string;
  parameters?: ApiPluginParameter[];
  configUiHints?: Record<string, { label?: string; options?: unknown[] }>;
};

export type ApiInstalledPluginInfo = {
  name?: string;
  version?: string;
};

export const API_MASKED_SENTINEL = "__MILADY_API_MASKED__";

export function registerPluginNameVariants(
  names: Set<string>,
  rawName: string,
): void {
  const trimmed = rawName.trim();
  if (!trimmed) return;

  names.add(trimmed);

  const normalized = trimmed
    .replace(/^@[^/]+\//, "")
    .replace(/^plugin-/, "")
    .trim();

  if (!normalized) return;

  names.add(normalized);
  names.add(`plugin-${normalized}`);
  names.add(`@elizaos/plugin-${normalized}`);
}

export function matchesInstalledPluginName(
  candidates: Set<string>,
  installedName: string,
): boolean {
  if (candidates.has(installedName)) return true;
  const normalized = installedName
    .replace(/^@[^/]+\//, "")
    .replace(/^plugin-/, "")
    .trim();
  return normalized.length > 0 && candidates.has(normalized);
}
