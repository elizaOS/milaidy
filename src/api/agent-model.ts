import type { AgentRuntime } from "@elizaos/core";

const MODEL_PLACEHOLDERS = new Set(["", "n/a", "na", "unknown", "provided"]);

const PROVIDER_HINTS = [
  "openai-codex",
  "openai-subscription",
  "anthropic-subscription",
  "openrouter",
  "moonshot",
  "kimi",
  "deepseek",
  "anthropic",
  "openai",
  "groq",
  "gemini",
  "google",
  "xai",
  "ollama",
  "pi-ai",
] as const;

function normalizeModelSpec(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (MODEL_PLACEHOLDERS.has(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

function readCharacterModel(runtime: AgentRuntime): string | undefined {
  const character = (runtime as { character?: unknown }).character;
  if (!character || typeof character !== "object") return undefined;

  const modelValue = (character as { model?: unknown }).model;
  const fromCharacterModel = normalizeModelSpec(modelValue);
  if (fromCharacterModel) return fromCharacterModel;

  const settings = (character as { settings?: unknown }).settings;
  if (!settings || typeof settings !== "object") return undefined;

  const model = (settings as { model?: unknown }).model;
  const fromSettingsModel = normalizeModelSpec(model);
  if (fromSettingsModel) return fromSettingsModel;

  if (!model || typeof model !== "object") return undefined;
  const modelObj = model as {
    primary?: unknown;
    large?: unknown;
    small?: unknown;
  };

  return (
    normalizeModelSpec(modelObj.primary) ??
    normalizeModelSpec(modelObj.large) ??
    normalizeModelSpec(modelObj.small)
  );
}

/**
 * Best-effort runtime model/provider label for /api/status and WS status events.
 *
 * Preference order:
 * 1) Explicit character model settings (provider/model)
 * 2) Loaded AI provider plugin name
 */
export function detectRuntimeModel(
  runtime: AgentRuntime | null,
): string | undefined {
  if (!runtime) return undefined;

  const configured = readCharacterModel(runtime);
  if (configured) return configured;

  const pluginNames = Array.isArray(runtime.plugins)
    ? runtime.plugins
        .map((plugin) =>
          typeof plugin?.name === "string" ? plugin.name.trim() : "",
        )
        .filter((name): name is string => name.length > 0)
    : [];
  if (pluginNames.length === 0) return undefined;

  const lowerPluginNames = pluginNames.map((name) => name.toLowerCase());
  for (const hint of PROVIDER_HINTS) {
    const index = lowerPluginNames.findIndex((name) => name.includes(hint));
    if (index >= 0) return pluginNames[index];
  }

  return undefined;
}
