/**
 * CONFIGURE_PLUGIN action — applies plugin config/enabled state via local API.
 *
 * This lets the agent configure plugin settings directly (without requiring
 * the user to click an inline [CONFIG:pluginId] form first), while still
 * using the server-side validation in /api/plugins/:id.
 *
 * @module actions/configure-plugin
 */

import type { Action, HandlerOptions } from "@elizaos/core";

/** API port for posting plugin config updates. */
const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

function parseOptionalBoolean(
  value: unknown,
): { ok: true; value: boolean } | { ok: false } | { ok: true; value: null } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  if (typeof value === "boolean") return { ok: true, value };
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return { ok: true, value: true };
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return { ok: true, value: false };
    }
  }
  return { ok: false };
}

function parseConfigObject(
  raw: unknown,
): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: {} };
  }

  const objectValue =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;

  if (
    !objectValue ||
    typeof objectValue !== "object" ||
    Array.isArray(objectValue)
  ) {
    return {
      ok: false,
      error: "configJson must be a JSON object",
    };
  }

  const parsed: Record<string, string> = {};
  for (const [key, value] of Object.entries(objectValue)) {
    if (typeof key !== "string" || !key.trim()) continue;
    if (value === undefined || value === null) continue;
    parsed[key] = String(value);
  }
  return { ok: true, value: parsed };
}

export const configurePluginAction: Action = {
  name: "CONFIGURE_PLUGIN",
  similes: [
    "SET_PLUGIN_CONFIG",
    "UPDATE_PLUGIN_CONFIG",
    "ENABLE_PLUGIN_CONFIG",
    "SETUP_CONNECTOR",
  ],
  description:
    "Configure an installed plugin by pluginId. Supports setting config values " +
    "and optionally enabling/disabling the plugin.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;
      const pluginId =
        typeof params?.pluginId === "string"
          ? params.pluginId.trim()
          : undefined;
      if (!pluginId) {
        return { text: "Missing pluginId.", success: false };
      }

      const enabledParse = parseOptionalBoolean(params?.enabled);
      if (!enabledParse.ok) {
        return {
          text: 'enabled must be a boolean-like value ("true"/"false").',
          success: false,
        };
      }

      const configParse = parseConfigObject(params?.configJson);
      if (!configParse.ok) {
        return { text: configParse.error, success: false };
      }

      const body: {
        enabled?: boolean;
        config?: Record<string, string>;
      } = {};
      if (enabledParse.value !== null) body.enabled = enabledParse.value;
      if (Object.keys(configParse.value).length > 0) {
        body.config = configParse.value;
      }

      if (body.enabled === undefined && !body.config) {
        return {
          text: "Nothing to apply. Provide enabled and/or configJson.",
          success: false,
        };
      }

      const response = await fetch(
        `http://localhost:${API_PORT}/api/plugins/${encodeURIComponent(pluginId)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Milady-Agent-Action": "1",
          },
          body: JSON.stringify(body),
        },
      );

      const payload = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!response.ok || payload.ok === false) {
        const details =
          typeof payload.error === "string"
            ? payload.error
            : Array.isArray(payload.validationErrors)
              ? JSON.stringify(payload.validationErrors)
              : `HTTP ${response.status}`;
        return {
          text: `Failed to configure ${pluginId}: ${details}`,
          success: false,
        };
      }

      return {
        text: `Configured plugin ${pluginId}.`,
        success: true,
        data: {
          pluginId,
          enabled: body.enabled !== undefined ? body.enabled : "unchanged",
          configKeys: body.config ? Object.keys(body.config) : [],
        },
      };
    } catch (err) {
      return {
        text: `Plugin configuration failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },
  parameters: [
    {
      name: "pluginId",
      description: "Short plugin id, e.g. telegram, discord, knowledge.",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "configJson",
      description:
        'JSON object string for config patch, e.g. {"DISCORD_TOKEN":"..."}',
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "enabled",
      description:
        'Optional enable/disable toggle. Accepts true/false (or "1"/"0").',
      required: false,
      schema: { type: "string" as const },
    },
  ],
};
