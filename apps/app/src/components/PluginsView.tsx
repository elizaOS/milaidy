/**
 * Plugins view — tag-filtered plugin management.
 *
 * Renders a unified plugin list with searchable/filterable cards and per-plugin settings.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppContext";
import type { PluginInfo, PluginParamDef } from "../api-client";
import { client } from "../api-client";
import type { ConfigUiHint } from "../types";
import type { JsonSchemaObject } from "./config-catalog";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import { autoLabel } from "./shared/labels";
import { WhatsAppQrOverlay } from "./WhatsAppQrOverlay";

/* ── UI Showcase Plugin ────────────────────────────────────────────── */

/**
 * Synthetic plugin that demonstrates all 23 field renderers.
 * Appears in the plugin list as a reference/documentation plugin.
 */
const SHOWCASE_PLUGIN: PluginInfo = {
  id: "__ui-showcase__",
  name: "UI Field Showcase",
  description:
    "Interactive reference of all 23 field renderers. Not a real plugin — expand to see every UI component in action.",
  enabled: false,
  configured: true,
  envKey: null,
  category: "feature",
  source: "bundled",
  validationErrors: [],
  validationWarnings: [],
  version: "1.0.0",
  icon: "🧩",
  parameters: [
    // 1. text
    {
      key: "DISPLAY_NAME",
      type: "string",
      description: "A simple single-line text input for names or short values.",
      required: true,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 2. password
    {
      key: "SECRET_TOKEN",
      type: "string",
      description:
        "Masked password input with show/hide toggle and server-backed reveal.",
      required: true,
      sensitive: true,
      currentValue: null,
      isSet: false,
    },
    // 3. number
    {
      key: "SERVER_PORT",
      type: "number",
      description: "Numeric input with min/max range and step control.",
      required: false,
      sensitive: false,
      default: "3000",
      currentValue: null,
      isSet: false,
    },
    // 4. boolean
    {
      key: "ENABLE_LOGGING",
      type: "boolean",
      description: "Toggle switch — on/off. Auto-detected from ENABLE_ prefix.",
      required: false,
      sensitive: false,
      default: "true",
      currentValue: null,
      isSet: false,
    },
    // 5. url
    {
      key: "WEBHOOK_URL",
      type: "string",
      description:
        "URL input with format validation. Auto-detected from _URL suffix.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 6. select
    {
      key: "DEPLOY_REGION",
      type: "string",
      description:
        "Dropdown selector populated from hint.options. Auto-detected for region/zone keys.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 7. textarea
    {
      key: "SYSTEM_PROMPT",
      type: "string",
      description:
        "Multi-line text input for long values like prompts or templates. Auto-detected from _PROMPT suffix.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 8. email
    {
      key: "CONTACT_EMAIL",
      type: "string",
      description: "Email input with format validation. Renders type=email.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 9. color
    {
      key: "THEME_COLOR",
      type: "string",
      description: "Color picker with hex value text input side-by-side.",
      required: false,
      sensitive: false,
      default: "#4a90d9",
      currentValue: null,
      isSet: false,
    },
    // 10. radio
    {
      key: "AUTH_MODE",
      type: "string",
      description:
        "Radio button group — best for 2-3 mutually exclusive options. Uses 'basic' or 'oauth'.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 11. multiselect
    {
      key: "ENABLED_FEATURES",
      type: "string",
      description:
        "Checkbox group for selecting multiple values from a fixed set.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 12. date
    {
      key: "START_DATE",
      type: "string",
      description: "Date picker input. Auto-detected from _DATE suffix.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 13. datetime
    {
      key: "SCHEDULED_AT",
      type: "string",
      description: "Combined date and time picker for scheduling.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 14. json
    {
      key: "METADATA_CONFIG",
      type: "string",
      description:
        "JSON editor with syntax validation. Shows parse errors inline.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 15. code
    {
      key: "RESPONSE_TEMPLATE",
      type: "string",
      description:
        "Code editor with monospaced font for templates and snippets.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 16. array
    {
      key: "ALLOWED_ORIGINS",
      type: "string",
      description:
        "Comma-separated list of origins with add/remove UI for each item.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 17. keyvalue
    {
      key: "CUSTOM_HEADERS",
      type: "string",
      description: "Key-value pair editor with add/remove rows.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 18. file
    {
      key: "CERT_FILE",
      type: "string",
      description: "File path input for certificates, configs, or data files.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 19. custom
    {
      key: "CUSTOM_COMPONENT",
      type: "string",
      description: "Placeholder for plugin-provided custom React components.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 20. markdown
    {
      key: "RELEASE_NOTES",
      type: "string",
      description:
        "Markdown editor with Edit/Preview toggle for rich text content.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 21. checkbox-group
    {
      key: "NOTIFICATION_CHANNELS",
      type: "string",
      description:
        "Checkbox group with per-option descriptions — similar to multiselect but with checkbox UX.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 22. group
    {
      key: "CONNECTION_GROUP",
      type: "string",
      description:
        "Fieldset container for visually grouping related configuration fields.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
    // 23. table
    {
      key: "ROUTE_TABLE",
      type: "string",
      description:
        "Tabular data editor with add/remove rows and column headers.",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
  ],
  configUiHints: {
    DISPLAY_NAME: {
      label: "Display Name",
      group: "Basic Fields",
      width: "half",
      help: "Renderer: text — single-line text input",
    },
    SECRET_TOKEN: {
      label: "Secret Token",
      group: "Basic Fields",
      width: "half",
      help: "Renderer: password — masked with show/hide toggle",
    },
    SERVER_PORT: {
      label: "Server Port",
      group: "Basic Fields",
      width: "third",
      min: 1,
      max: 65535,
      unit: "port",
      help: "Renderer: number — with min/max range and unit label",
    },
    ENABLE_LOGGING: {
      label: "Enable Logging",
      group: "Basic Fields",
      width: "third",
      help: "Renderer: boolean — pill-shaped toggle switch",
    },
    WEBHOOK_URL: {
      label: "Webhook URL",
      group: "Basic Fields",
      width: "full",
      placeholder: "https://example.com/webhook",
      help: "Renderer: url — URL input with format validation",
    },
    DEPLOY_REGION: {
      label: "Deploy Region",
      group: "Selection Fields",
      width: "half",
      type: "select",
      options: [
        { value: "us-east-1", label: "US East (Virginia)" },
        { value: "us-west-2", label: "US West (Oregon)" },
        { value: "eu-west-1", label: "EU (Ireland)" },
        { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
      ],
      help: "Renderer: select — dropdown with enhanced option labels",
    },
    SYSTEM_PROMPT: {
      label: "System Prompt",
      group: "Text Fields",
      width: "full",
      help: "Renderer: textarea — multi-line text input for long content",
    },
    CONTACT_EMAIL: {
      label: "Contact Email",
      group: "Text Fields",
      width: "half",
      type: "email",
      placeholder: "admin@example.com",
      help: "Renderer: email — email input with format validation",
    },
    THEME_COLOR: {
      label: "Theme Color",
      group: "Selection Fields",
      width: "third",
      type: "color",
      help: "Renderer: color — color picker swatch + hex input",
    },
    AUTH_MODE: {
      label: "Auth Mode",
      group: "Selection Fields",
      width: "half",
      type: "radio",
      options: [
        {
          value: "basic",
          label: "Basic Auth",
          description: "Username and password",
        },
        {
          value: "oauth",
          label: "OAuth 2.0",
          description: "Token-based authentication",
        },
        {
          value: "apikey",
          label: "API Key",
          description: "Header-based API key",
        },
      ],
      help: "Renderer: radio — radio button group with descriptions",
    },
    ENABLED_FEATURES: {
      label: "Enabled Features",
      group: "Selection Fields",
      width: "full",
      type: "multiselect",
      options: [
        { value: "auth", label: "Authentication" },
        { value: "logging", label: "Logging" },
        { value: "caching", label: "Caching" },
        { value: "webhooks", label: "Webhooks" },
        { value: "ratelimit", label: "Rate Limiting" },
      ],
      help: "Renderer: multiselect — checkbox group for multiple selections",
    },
    START_DATE: {
      label: "Start Date",
      group: "Date & Time",
      width: "half",
      type: "date",
      help: "Renderer: date — native date picker",
    },
    SCHEDULED_AT: {
      label: "Scheduled At",
      group: "Date & Time",
      width: "half",
      type: "datetime",
      help: "Renderer: datetime — date + time picker",
    },
    METADATA_CONFIG: {
      label: "Metadata Config",
      group: "Structured Data",
      width: "full",
      type: "json",
      help: "Renderer: json — JSON editor with inline validation",
    },
    RESPONSE_TEMPLATE: {
      label: "Response Template",
      group: "Structured Data",
      width: "full",
      type: "code",
      help: "Renderer: code — monospaced code editor",
    },
    ALLOWED_ORIGINS: {
      label: "Allowed Origins",
      group: "Structured Data",
      width: "full",
      type: "array",
      help: "Renderer: array — add/remove items list",
    },
    CUSTOM_HEADERS: {
      label: "Custom Headers",
      group: "Structured Data",
      width: "full",
      type: "keyvalue",
      help: "Renderer: keyvalue — key-value pair editor",
    },
    CERT_FILE: {
      label: "Certificate File",
      group: "File Paths",
      width: "full",
      type: "file",
      help: "Renderer: file — file path input",
    },
    CUSTOM_COMPONENT: {
      label: "Custom Component",
      group: "File Paths",
      width: "full",
      type: "custom",
      help: "Renderer: custom — placeholder for plugin-provided React components",
      advanced: true,
    },
    RELEASE_NOTES: {
      label: "Release Notes",
      group: "Text Fields",
      width: "full",
      type: "markdown",
      help: "Renderer: markdown — textarea with Edit/Preview toggle",
    },
    NOTIFICATION_CHANNELS: {
      label: "Notification Channels",
      group: "Selection Fields",
      width: "full",
      type: "checkbox-group",
      options: [
        {
          value: "email",
          label: "Email",
          description: "Send notifications via email",
        },
        {
          value: "slack",
          label: "Slack",
          description: "Post to Slack channels",
        },
        {
          value: "webhook",
          label: "Webhook",
          description: "HTTP POST to configured URL",
        },
        { value: "sms", label: "SMS", description: "Text message alerts" },
      ],
      help: "Renderer: checkbox-group — vertical checkbox list with descriptions",
    },
    CONNECTION_GROUP: {
      label: "Connection Settings",
      group: "Structured Data",
      width: "full",
      type: "group",
      help: "Renderer: group — fieldset container with legend",
    },
    ROUTE_TABLE: {
      label: "Route Table",
      group: "Structured Data",
      width: "full",
      type: "table",
      help: "Renderer: table — tabular data editor with add/remove rows",
    },
  },
};

/* ── Always-on plugins (hidden from all views) ────────────────────────── */

/**
 * Plugin IDs hidden from Features/Connectors views.
 * Core plugins are visible in Admin > Plugins instead.
 */
const ALWAYS_ON_PLUGIN_IDS = new Set([
  // Core (always loaded)
  "sql",
  "local-embedding",
  "knowledge",
  "agent-skills",
  "directives",
  "commands",
  "personality",
  "experience",
  // Optional core (shown in admin)
  "agent-orchestrator",
  "shell",
  "plugin-manager",
  "cli",
  "code",
  "edge-tts",
  "pdf",
  "scratchpad",
  "secrets-manager",
  "todo",
  "trust",
  "form",
  "goals",
  "scheduling",
  // Internal / infrastructure
  "elizacloud",
  "evm",
  "memory",
  "rolodex",
  "tts",
  "elevenlabs",
  "cron",
  "webhooks",
  "browser",
  "vision",
  "computeruse",
]);

/* ── Helpers ────────────────────────────────────────────────────────── */

/** Detect advanced / debug parameters that should be collapsed by default. */
export function isAdvancedParam(param: PluginParamDef): boolean {
  const k = param.key.toUpperCase();
  const d = (param.description ?? "").toLowerCase();
  return (
    k.includes("EXPERIMENTAL") ||
    k.includes("DEBUG") ||
    k.includes("VERBOSE") ||
    k.includes("TELEMETRY") ||
    k.includes("BROWSER_BASE") ||
    d.includes("experimental") ||
    d.includes("advanced") ||
    d.includes("debug")
  );
}

/** Convert PluginParamDef[] to a JSON Schema + ConfigUiHints for ConfigRenderer. */
export function paramsToSchema(
  params: PluginParamDef[],
  pluginId: string,
): {
  schema: JsonSchemaObject;
  hints: Record<string, ConfigUiHint>;
} {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  const hints: Record<string, ConfigUiHint> = {};

  for (const p of params) {
    // Build JSON Schema property
    const prop: Record<string, unknown> = {};
    if (p.type === "boolean") {
      prop.type = "boolean";
    } else if (p.type === "number") {
      prop.type = "number";
    } else {
      prop.type = "string";
    }
    if (p.description) prop.description = p.description;
    if (p.default != null) prop.default = p.default;
    if (p.options?.length) {
      prop.enum = p.options;
    }

    // Auto-detect format from key name
    const keyUpper = p.key.toUpperCase();
    if (
      keyUpper.includes("URL") ||
      keyUpper.includes("ENDPOINT") ||
      keyUpper.includes("BASE_URL")
    ) {
      prop.format = "uri";
    } else if (keyUpper.includes("EMAIL")) {
      prop.format = "email";
    } else if (
      keyUpper.includes("_DATE") ||
      keyUpper.includes("_SINCE") ||
      keyUpper.includes("_UNTIL")
    ) {
      prop.format = "date";
    }

    // Auto-detect number types from key patterns
    if (keyUpper.includes("PORT") && prop.type === "string") {
      prop.type = "number";
    } else if (
      (keyUpper.includes("TIMEOUT") ||
        keyUpper.includes("INTERVAL") ||
        keyUpper.includes("_MS")) &&
      prop.type === "string"
    ) {
      prop.type = "number";
    } else if (
      (keyUpper.includes("COUNT") ||
        keyUpper.includes("LIMIT") ||
        keyUpper.startsWith("MAX_")) &&
      prop.type === "string"
    ) {
      prop.type = "number";
    } else if (
      (keyUpper.includes("RETRY") || keyUpper.includes("RETRIES")) &&
      prop.type === "string"
    ) {
      prop.type = "number";
    }

    // Auto-detect boolean from key patterns
    if (
      prop.type === "string" &&
      (keyUpper.includes("SHOULD_") ||
        keyUpper.endsWith("_ENABLED") ||
        keyUpper.endsWith("_DISABLED") ||
        keyUpper.startsWith("USE_") ||
        keyUpper.startsWith("ALLOW_") ||
        keyUpper.startsWith("IS_") ||
        keyUpper.startsWith("ENABLE_") ||
        keyUpper.startsWith("DISABLE_") ||
        keyUpper.startsWith("FORCE_") ||
        keyUpper.endsWith("_AUTONOMOUS_MODE"))
    ) {
      prop.type = "boolean";
    }

    // Auto-detect number from key patterns (RATE, DELAY, THRESHOLD, SIZE, TEMPERATURE)
    if (
      prop.type === "string" &&
      (keyUpper.includes("_RATE") ||
        keyUpper.includes("DELAY") ||
        keyUpper.includes("THRESHOLD") ||
        keyUpper.includes("_SIZE") ||
        keyUpper.includes("TEMPERATURE") ||
        keyUpper.includes("_DEPTH") ||
        keyUpper.includes("_PERCENT") ||
        keyUpper.includes("_RATIO"))
    ) {
      prop.type = "number";
    }

    // Auto-detect comma-separated lists → array renderer
    if (prop.type === "string" && !prop.enum) {
      const descLower = (p.description || "").toLowerCase();
      const isCommaSep =
        descLower.includes("comma-separated") ||
        descLower.includes("comma separated");
      const isListSuffix =
        keyUpper.endsWith("_IDS") ||
        keyUpper.endsWith("_CHANNELS") ||
        keyUpper.endsWith("_ROOMS") ||
        keyUpper.endsWith("_RELAYS") ||
        keyUpper.endsWith("_FEEDS") ||
        keyUpper.endsWith("_DEXES") ||
        keyUpper.endsWith("_WHITELIST") ||
        keyUpper.endsWith("_BLACKLIST") ||
        keyUpper.endsWith("_ALLOWLIST") ||
        keyUpper.endsWith("_SPACES") ||
        keyUpper.endsWith("_THREADS") ||
        keyUpper.endsWith("_ROLES") ||
        keyUpper.endsWith("_TENANTS") ||
        keyUpper.endsWith("_DIRS");
      if (isCommaSep || isListSuffix) {
        prop.type = "array";
        prop.items = { type: "string" };
      }
    }

    // Auto-detect textarea (prompts, instructions, templates, greetings)
    if (prop.type === "string" && !prop.enum && !keyUpper.includes("MODEL")) {
      if (
        keyUpper.includes("INSTRUCTIONS") ||
        keyUpper.includes("_GREETING") ||
        keyUpper.endsWith("_PROMPT") ||
        keyUpper.endsWith("_TEMPLATE") ||
        keyUpper.includes("SYSTEM_MESSAGE")
      ) {
        prop.maxLength = 999;
      }
    }

    // Auto-detect JSON fields (json-encoded or serialized values)
    if (prop.type === "string" && !p.sensitive) {
      const descLower = (p.description || "").toLowerCase();
      if (
        descLower.includes("json-encoded") ||
        descLower.includes("json array") ||
        descLower.includes("serialized") ||
        descLower.includes("json format")
      ) {
        (prop as Record<string, unknown>).__jsonHint = true;
      }
    }

    // Auto-detect file/directory paths → file renderer
    if (prop.type === "string") {
      if (
        (keyUpper.endsWith("_PATH") && !keyUpper.includes("WEBHOOK")) ||
        keyUpper.endsWith("_DIR") ||
        keyUpper.endsWith("_DIRECTORY") ||
        keyUpper.endsWith("_FOLDER") ||
        keyUpper.endsWith("_FILE")
      ) {
        (prop as Record<string, unknown>).__fileHint = true;
      }
    }

    // Auto-detect textarea from long descriptions
    if (p.description && p.description.length > 200) {
      prop.maxLength = 999;
    }

    properties[p.key] = prop;

    if (p.required) required.push(p.key);

    // Build UI hint
    const hint: ConfigUiHint = {
      label: autoLabel(p.key, pluginId),
      sensitive: p.sensitive ?? false,
      advanced: isAdvancedParam(p),
    };

    // Port numbers — constrain range
    if (keyUpper.includes("PORT")) {
      hint.min = 1;
      hint.max = 65535;
      prop.minimum = 1;
      prop.maximum = 65535;
    }

    // Timeout/interval — show unit
    if (
      keyUpper.includes("TIMEOUT") ||
      keyUpper.includes("INTERVAL") ||
      keyUpper.includes("_MS")
    ) {
      hint.unit = "ms";
      prop.minimum = 0;
      hint.min = 0;
    }

    // Count/limit — non-negative
    if (
      keyUpper.includes("COUNT") ||
      keyUpper.includes("LIMIT") ||
      keyUpper.startsWith("MAX_")
    ) {
      hint.min = 0;
      prop.minimum = 0;
    }

    // Retry — bounded range
    if (keyUpper.includes("RETRY") || keyUpper.includes("RETRIES")) {
      hint.min = 0;
      hint.max = 100;
      prop.minimum = 0;
      prop.maximum = 100;
    }

    // Debug/verbose/enabled — mark as advanced
    if (
      keyUpper.includes("DEBUG") ||
      keyUpper.includes("VERBOSE") ||
      keyUpper.includes("ENABLED")
    ) {
      hint.advanced = true;
    }

    // Model selection — NOT advanced (important user-facing choice)
    if (keyUpper.includes("MODEL") && p.options?.length) {
      hint.advanced = false;
    }

    // Region/zone — suggest common cloud regions when no options provided
    if (
      (keyUpper.includes("REGION") || keyUpper.includes("ZONE")) &&
      !p.options?.length
    ) {
      hint.type = "select";
      hint.options = [
        { value: "us-east-1", label: "US East (N. Virginia)" },
        { value: "us-west-2", label: "US West (Oregon)" },
        { value: "eu-west-1", label: "EU (Ireland)" },
        { value: "eu-central-1", label: "EU (Frankfurt)" },
        { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
        { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
      ];
    }

    // File/directory path → file renderer
    if ((prop as Record<string, unknown>).__fileHint) {
      hint.type = "file";
      delete (prop as Record<string, unknown>).__fileHint;
    }

    // JSON-encoded value → json renderer
    if ((prop as Record<string, unknown>).__jsonHint) {
      hint.type = "json";
      delete (prop as Record<string, unknown>).__jsonHint;
    }

    // Model name fields — helpful placeholder (overridden by server-provided model options via configUiHints)
    if (
      keyUpper.includes("MODEL") &&
      prop.type === "string" &&
      !p.options?.length
    ) {
      if (!hint.placeholder) {
        if (keyUpper.includes("EMBEDDING")) {
          hint.placeholder = "e.g., text-embedding-3-small";
        } else if (keyUpper.includes("TTS")) {
          hint.placeholder = "e.g., tts-1, eleven_multilingual_v2";
        } else if (keyUpper.includes("STT")) {
          hint.placeholder = "e.g., whisper-1";
        } else if (keyUpper.includes("IMAGE")) {
          hint.placeholder = "e.g., dall-e-3, gpt-4o";
        } else {
          hint.placeholder = "e.g., gpt-4o, claude-sonnet-4-20250514";
        }
      }
    }

    // Mode/strategy fields — extract options from description if available
    if (
      prop.type === "string" &&
      !prop.enum &&
      !p.sensitive &&
      (keyUpper.endsWith("_MODE") || keyUpper.endsWith("_STRATEGY"))
    ) {
      const desc = p.description ?? "";
      // Match "auto | local | mcp" or "filesystem|in-context|sqlite"
      const pipeMatch =
        desc.match(/:\s*([a-z0-9_-]+(?:\s*[|/]\s*[a-z0-9_-]+)+)/i) ??
        desc.match(/\(([a-z0-9_-]+(?:\s*[|/,]\s*[a-z0-9_-]+)+)\)/i);
      if (pipeMatch) {
        const opts = pipeMatch[1]
          .split(/[|/,]/)
          .map((s) => s.trim())
          .filter(Boolean);
        const safeOpts = opts.filter((v) => /^[a-z0-9_-]+$/i.test(v));
        if (safeOpts.length >= 2 && safeOpts.length <= 10) {
          hint.type = "select";
          hint.options = safeOpts.map((v) => ({ value: v, label: v }));
        }
      } else {
        // Match 'polling' or 'webhook' -or- 'env', 'oauth', or 'bearer' style
        const quotedOpts = [...desc.matchAll(/'([a-z0-9_-]+)'/gi)].map(
          (m) => m[1],
        );
        const safeQuoted = quotedOpts.filter((v) => /^[a-z0-9_-]+$/i.test(v));
        if (safeQuoted.length >= 2 && safeQuoted.length <= 10) {
          // Radio for 2 options, select for 3+
          hint.type = safeQuoted.length === 2 ? "radio" : "select";
          hint.options = safeQuoted.map((v) => ({ value: v, label: v }));
        }
      }
    }

    if (p.description) {
      hint.help = p.description;
      if (p.default != null) hint.help += ` (default: ${String(p.default)})`;
    }
    if (p.sensitive)
      hint.placeholder = p.isSet ? "********  (already set)" : "Enter value...";
    else if (p.default) hint.placeholder = `Default: ${String(p.default)}`;
    hints[p.key] = hint;
  }

  return {
    schema: { type: "object", properties, required } as JsonSchemaObject,
    hints,
  };
}

/* ── PluginConfigForm bridge ─────────────────────────────────────────── */

function PluginConfigForm({
  plugin,
  pluginConfigs,
  onParamChange,
}: {
  plugin: PluginInfo;
  pluginConfigs: Record<string, Record<string, string>>;
  onParamChange: (pluginId: string, paramKey: string, value: string) => void;
}) {
  const params = plugin.parameters ?? [];
  const { schema, hints: autoHints } = useMemo(
    () => paramsToSchema(params, plugin.id),
    [params, plugin.id],
  );

  // Merge server-provided configUiHints over auto-generated hints.
  // Server hints take priority (override auto-generated ones).
  const hints = useMemo(() => {
    const serverHints = plugin.configUiHints;
    if (!serverHints || Object.keys(serverHints).length === 0) return autoHints;
    const merged: Record<string, ConfigUiHint> = { ...autoHints };
    for (const [key, serverHint] of Object.entries(serverHints)) {
      merged[key] = { ...merged[key], ...serverHint };
    }
    return merged;
  }, [autoHints, plugin.configUiHints]);

  // Build values from current config state + existing server values.
  // Array-typed fields need comma-separated strings parsed into arrays.
  const values = useMemo(() => {
    const v: Record<string, unknown> = {};
    const props = (schema.properties ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    for (const p of params) {
      const isArrayField = props[p.key]?.type === "array";
      const configValue = pluginConfigs[plugin.id]?.[p.key];
      if (configValue !== undefined) {
        if (isArrayField && typeof configValue === "string") {
          v[p.key] = configValue
            ? configValue
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean)
            : [];
        } else {
          v[p.key] = configValue;
        }
      } else if (p.isSet && !p.sensitive && p.currentValue != null) {
        if (isArrayField && typeof p.currentValue === "string") {
          v[p.key] = String(p.currentValue)
            ? String(p.currentValue)
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean)
            : [];
        } else {
          v[p.key] = p.currentValue;
        }
      }
    }
    return v;
  }, [params, plugin.id, pluginConfigs, schema]);

  const setKeys = useMemo(
    () =>
      new Set(
        params
          .filter((p: PluginParamDef) => p.isSet)
          .map((p: PluginParamDef) => p.key),
      ),
    [params],
  );

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      // Join array values back to comma-separated strings for env var storage
      const stringValue = Array.isArray(value)
        ? value.join(", ")
        : String(value ?? "");
      onParamChange(plugin.id, key, stringValue);
    },
    [plugin.id, onParamChange],
  );

  return (
    <ConfigRenderer
      schema={schema}
      hints={hints}
      values={values}
      setKeys={setKeys}
      registry={defaultRegistry}
      pluginId={plugin.id}
      onChange={handleChange}
    />
  );
}

/* ── Default Icons ─────────────────────────────────────────────────── */

const DEFAULT_ICONS: Record<string, string> = {
  // AI Providers
  anthropic: "🧠",
  "google-genai": "✦",
  groq: "⚡",
  "local-ai": "🖥️",
  ollama: "🦙",
  openai: "◐",
  openrouter: "🔀",
  "vercel-ai-gateway": "▲",
  xai: "𝕏",
  // Connectors — chat & social
  discord: "💬",
  telegram: "✈️",
  slack: "💼",
  twitter: "🐦",
  whatsapp: "📱",
  signal: "🔒",
  imessage: "💭",
  bluebubbles: "🫧",
  bluesky: "🦋",
  farcaster: "🟣",
  instagram: "📸",
  nostr: "🔑",
  twitch: "🎮",
  matrix: "🔗",
  mattermost: "💠",
  msteams: "🟦",
  "google-chat": "💚",
  feishu: "🪶",
  line: "🟢",
  "nextcloud-talk": "☁️",
  tlon: "🌀",
  zalo: "💙",
  zalouser: "💙",
  // Features — voice & audio
  "edge-tts": "🗣️",
  elevenlabs: "🎙️",
  tts: "🔊",
  "simple-voice": "🎤",
  "robot-voice": "🤖",
  // Features — blockchain & finance
  evm: "⛓️",
  solana: "◎",
  "auto-trader": "📈",
  "lp-manager": "💹",
  "social-alpha": "📊",
  polymarket: "🎲",
  x402: "💳",
  trust: "🤝",
  iq: "🧩",
  // Features — dev tools & infra
  cli: "⌨️",
  code: "💻",
  shell: "🐚",
  github: "🐙",
  linear: "◻️",
  mcp: "🔌",
  browser: "🌐",
  computeruse: "🖱️",
  n8n: "⚙️",
  webhooks: "🪝",
  // Features — knowledge & memory
  knowledge: "📚",
  memory: "🧬",
  "local-embedding": "📐",
  pdf: "📄",
  "secrets-manager": "🔐",
  scratchpad: "📝",
  rlm: "🔄",
  // Features — agents & orchestration
  "agent-orchestrator": "🎯",
  "agent-skills": "🛠️",
  "plugin-manager": "📦",
  "copilot-proxy": "🤝",
  directives: "📋",
  goals: "🎯",
  "eliza-classic": "👩",
  // Features — media & content
  vision: "👁️",
  rss: "📡",
  "gmail-watch": "📧",
  prose: "✍️",
  form: "📝",
  // Features — scheduling & automation
  cron: "⏰",
  scheduling: "📅",
  todo: "✅",
  commands: "⌘",
  // Features — storage & logging
  "s3-storage": "🗄️",
  "trajectory-logger": "📉",
  experience: "🌟",
  // Features — gaming & misc
  minecraft: "⛏️",
  roblox: "🧱",
  babylon: "🎮",
  mysticism: "🔮",
  personality: "🎭",
  moltbook: "📖",
  tee: "🔏",
  blooio: "🟠",
  acp: "🏗️",
  elizacloud: "☁️",
  twilio: "📞",
};

/** Resolve display icon: explicit plugin.icon, fallback to default map, or null. */
function resolveIcon(p: PluginInfo): string | null {
  if (p.icon) return p.icon;
  return DEFAULT_ICONS[p.id] ?? null;
}

/* ── Sub-group Classification ──────────────────────────────────────── */

/** Map plugin IDs to fine-grained sub-groups for the "Feature" category. */
const FEATURE_SUBGROUP: Record<string, string> = {
  // Voice & Audio
  "edge-tts": "voice",
  elevenlabs: "voice",
  tts: "voice",
  "simple-voice": "voice",
  "robot-voice": "voice",
  // Blockchain & Finance
  evm: "blockchain",
  solana: "blockchain",
  "auto-trader": "blockchain",
  "lp-manager": "blockchain",
  "social-alpha": "blockchain",
  polymarket: "blockchain",
  x402: "blockchain",
  trust: "blockchain",
  iq: "blockchain",
  // Dev Tools & Infrastructure
  cli: "devtools",
  code: "devtools",
  shell: "devtools",
  github: "devtools",
  linear: "devtools",
  mcp: "devtools",
  browser: "devtools",
  computeruse: "devtools",
  n8n: "devtools",
  webhooks: "devtools",
  // Knowledge & Memory
  knowledge: "knowledge",
  memory: "knowledge",
  "local-embedding": "knowledge",
  pdf: "knowledge",
  "secrets-manager": "knowledge",
  scratchpad: "knowledge",
  rlm: "knowledge",
  // Agents & Orchestration
  "agent-orchestrator": "agents",
  "agent-skills": "agents",
  "plugin-manager": "agents",
  "copilot-proxy": "agents",
  directives: "agents",
  goals: "agents",
  "eliza-classic": "agents",
  // Media & Content
  vision: "media",
  rss: "media",
  "gmail-watch": "media",
  prose: "media",
  form: "media",
  // Scheduling & Automation
  cron: "automation",
  scheduling: "automation",
  todo: "automation",
  commands: "automation",
  // Storage & Logging
  "s3-storage": "storage",
  "trajectory-logger": "storage",
  experience: "storage",
  // Gaming & Creative
  minecraft: "gaming",
  roblox: "gaming",
  babylon: "gaming",
  mysticism: "gaming",
  personality: "gaming",
  moltbook: "gaming",
};

const SUBGROUP_DISPLAY_ORDER = [
  "ai-provider",
  "connector",
  "voice",
  "blockchain",
  "devtools",
  "knowledge",
  "agents",
  "media",
  "automation",
  "storage",
  "gaming",
  "feature-other",
  "showcase",
] as const;

const SUBGROUP_LABELS: Record<string, string> = {
  "ai-provider": "AI Providers",
  connector: "Connectors",
  voice: "Voice & Audio",
  blockchain: "Blockchain & Finance",
  devtools: "Dev Tools & Infrastructure",
  knowledge: "Knowledge & Memory",
  agents: "Agents & Orchestration",
  media: "Media & Content",
  automation: "Scheduling & Automation",
  storage: "Storage & Logging",
  gaming: "Gaming & Creative",
  "feature-other": "Other Features",
  showcase: "Showcase",
};

function subgroupForPlugin(plugin: PluginInfo): string {
  if (plugin.id === "__ui-showcase__") return "showcase";
  if (plugin.category === "ai-provider") return "ai-provider";
  if (plugin.category === "connector") return "connector";
  return FEATURE_SUBGROUP[plugin.id] ?? "feature-other";
}

type StatusFilter = "all" | "enabled";
type PluginsViewMode = "all" | "connectors";

/* ── Shared PluginListView ─────────────────────────────────────────── */

interface PluginListViewProps {
  /** Label used in search placeholder and empty state messages. */
  label: string;
  /** Optional list mode for pre-filtered views like Connectors. */
  mode?: PluginsViewMode;
}

function PluginListView({ label, mode = "all" }: PluginListViewProps) {
  const {
    plugins,
    pluginStatusFilter,
    pluginSearch,
    pluginSettingsOpen,
    pluginSaving,
    pluginSaveSuccess,
    loadPlugins,
    handlePluginToggle,
    handlePluginConfigSave,
    setActionNotice,
    setState,
  } = useApp();

  const [pluginConfigs, setPluginConfigs] = useState<
    Record<string, Record<string, string>>
  >({});
  const [testResults, setTestResults] = useState<
    Map<
      string,
      {
        success: boolean;
        message?: string;
        error?: string;
        durationMs: number;
        loading: boolean;
      }
    >
  >(new Map());
  const [addDirOpen, setAddDirOpen] = useState(false);
  const [addDirPath, setAddDirPath] = useState("");
  const [addDirLoading, setAddDirLoading] = useState(false);
  const [installingPlugins, setInstallingPlugins] = useState<Set<string>>(
    new Set(),
  );
  const [installProgress, setInstallProgress] = useState<
    Map<string, { phase: string; message: string }>
  >(new Map());
  const [togglingPlugins, setTogglingPlugins] = useState<Set<string>>(
    new Set(),
  );
  const hasPluginToggleInFlight = togglingPlugins.size > 0;

  // ── Drag-to-reorder state ────────────────────────────────────────
  const [pluginOrder, setPluginOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("pluginOrder");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);

  // Load plugins on mount
  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  // Listen for install progress events via WebSocket
  useEffect(() => {
    const unbind = client.onWsEvent(
      "install-progress",
      (data: Record<string, unknown>) => {
        const pluginName = data.pluginName as string;
        const phase = data.phase as string;
        const message = data.message as string;
        if (!pluginName) return;
        if (phase === "complete" || phase === "error") {
          setInstallProgress((prev) => {
            const next = new Map(prev);
            next.delete(pluginName);
            return next;
          });
        } else {
          setInstallProgress((prev) =>
            new Map(prev).set(pluginName, { phase, message }),
          );
        }
      },
    );
    return unbind;
  }, []);

  // Persist custom order
  useEffect(() => {
    if (pluginOrder.length > 0) {
      localStorage.setItem("pluginOrder", JSON.stringify(pluginOrder));
    }
  }, [pluginOrder]);

  // ── Derived data ───────────────────────────────────────────────────

  /** Plugins shown in the unified view (hide always-on internals + database-only entries). */
  const categoryPlugins = useMemo(
    () =>
      plugins.filter(
        (p: PluginInfo) =>
          p.category !== "database" &&
          !ALWAYS_ON_PLUGIN_IDS.has(p.id) &&
          (mode !== "connectors" || p.category === "connector"),
      ),
    [plugins, mode],
  );

  const nonDbPlugins = useMemo(() => {
    const real = categoryPlugins;
    return [SHOWCASE_PLUGIN, ...real];
  }, [categoryPlugins]);

  const filtered = useMemo(() => {
    const searchLower = pluginSearch.toLowerCase();
    return categoryPlugins.filter((p: PluginInfo) => {
      const matchesStatus =
        pluginStatusFilter === "all" ||
        (pluginStatusFilter === "enabled" && p.enabled);
      const matchesSearch =
        !searchLower ||
        p.name.toLowerCase().includes(searchLower) ||
        (p.description ?? "").toLowerCase().includes(searchLower) ||
        p.id.toLowerCase().includes(searchLower);
      return matchesStatus && matchesSearch;
    });
  }, [categoryPlugins, pluginStatusFilter, pluginSearch]);

  const sorted = useMemo(() => {
    const defaultSort = (a: PluginInfo, b: PluginInfo) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      if (a.enabled && b.enabled) {
        const aNeedsConfig =
          a.parameters?.some((p: PluginParamDef) => p.required && !p.isSet) ??
          false;
        const bNeedsConfig =
          b.parameters?.some((p: PluginParamDef) => p.required && !p.isSet) ??
          false;
        if (aNeedsConfig !== bNeedsConfig) return aNeedsConfig ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    };
    if (pluginOrder.length === 0) return [...filtered].sort(defaultSort);
    // Custom order: sort by position, unknowns at end in default order
    const orderMap = new Map(pluginOrder.map((id, i) => [id, i]));
    return [...filtered].sort((a, b) => {
      const ai = orderMap.get(a.id);
      const bi = orderMap.get(b.id);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return defaultSort(a, b);
    });
  }, [filtered, pluginOrder]);

  const enabledCount = useMemo(
    () => categoryPlugins.filter((p: PluginInfo) => p.enabled).length,
    [categoryPlugins],
  );

  const pluginsWithSubgroup = useMemo(
    () =>
      sorted.map((plugin) => ({
        plugin,
        subgroup: subgroupForPlugin(plugin),
      })),
    [sorted],
  );

  const [subgroupFilter, setSubgroupFilter] = useState<string>("all");
  const showSubgroupFilters = mode !== "connectors";

  const subgroupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const { subgroup } of pluginsWithSubgroup) {
      counts[subgroup] = (counts[subgroup] ?? 0) + 1;
    }
    return counts;
  }, [pluginsWithSubgroup]);

  const subgroupTags = useMemo(() => {
    const dynamicTags = SUBGROUP_DISPLAY_ORDER.filter(
      (sg) => (subgroupCounts[sg] ?? 0) > 0,
    ).map((sg) => ({
      id: sg,
      label: SUBGROUP_LABELS[sg],
      count: subgroupCounts[sg] ?? 0,
    }));
    return [{ id: "all", label: "All", count: sorted.length }, ...dynamicTags];
  }, [sorted.length, subgroupCounts]);

  useEffect(() => {
    if (!showSubgroupFilters) return;
    if (subgroupFilter === "all") return;
    if (!subgroupTags.some((tag) => tag.id === subgroupFilter)) {
      setSubgroupFilter("all");
    }
  }, [showSubgroupFilters, subgroupFilter, subgroupTags]);

  const visiblePlugins = useMemo(() => {
    if (!showSubgroupFilters) return sorted;
    if (subgroupFilter === "all") return sorted;
    return pluginsWithSubgroup
      .filter(({ subgroup }) => subgroup === subgroupFilter)
      .map(({ plugin }) => plugin);
  }, [showSubgroupFilters, pluginsWithSubgroup, sorted, subgroupFilter]);

  // ── Handlers ───────────────────────────────────────────────────────

  const toggleSettings = (pluginId: string) => {
    const next = new Set<string>();
    if (!pluginSettingsOpen.has(pluginId)) next.add(pluginId);
    setState("pluginSettingsOpen", next);
  };

  const handleParamChange = (
    pluginId: string,
    paramKey: string,
    value: string,
  ) => {
    setPluginConfigs((prev) => ({
      ...prev,
      [pluginId]: { ...prev[pluginId], [paramKey]: value },
    }));
  };

  const handleConfigSave = async (pluginId: string) => {
    // Showcase plugin: no-op save (it's not a real plugin)
    if (pluginId === "__ui-showcase__") return;
    const config = pluginConfigs[pluginId] ?? {};
    await handlePluginConfigSave(pluginId, config);
    setPluginConfigs((prev) => {
      const next = { ...prev };
      delete next[pluginId];
      return next;
    });
  };

  const handleConfigReset = (pluginId: string) => {
    setPluginConfigs((prev) => {
      const next = { ...prev };
      delete next[pluginId];
      return next;
    });
  };

  const handleTestConnection = async (pluginId: string) => {
    setTestResults((prev) => {
      const next = new Map(prev);
      next.set(pluginId, { success: false, loading: true, durationMs: 0 });
      return next;
    });
    try {
      const result = await client.testPluginConnection(pluginId);
      setTestResults((prev) => {
        const next = new Map(prev);
        next.set(pluginId, { ...result, loading: false });
        return next;
      });
    } catch (err) {
      setTestResults((prev) => {
        const next = new Map(prev);
        next.set(pluginId, {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          loading: false,
          durationMs: 0,
        });
        return next;
      });
    }
  };

  const handleInstallPlugin = async (pluginId: string, npmName: string) => {
    setInstallingPlugins((prev) => new Set(prev).add(pluginId));
    try {
      await client.installRegistryPlugin(npmName);
      await loadPlugins();
      setActionNotice(
        `${npmName} installed. Restart required to activate.`,
        "success",
      );
    } catch (err) {
      setActionNotice(
        `Failed to install ${npmName}: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
        3800,
      );
      // Still try to refresh in case install succeeded but restart failed
      try {
        await loadPlugins();
      } catch {
        /* ignore */
      }
    } finally {
      setInstallingPlugins((prev) => {
        const next = new Set(prev);
        next.delete(pluginId);
        return next;
      });
    }
  };

  const handleTogglePlugin = useCallback(
    async (pluginId: string, enabled: boolean) => {
      let shouldStart = false;
      setTogglingPlugins((prev) => {
        if (prev.has(pluginId) || prev.size > 0) return prev;
        shouldStart = true;
        return new Set(prev).add(pluginId);
      });
      if (!shouldStart) return;

      try {
        await handlePluginToggle(pluginId, enabled);
      } finally {
        setTogglingPlugins((prev) => {
          const next = new Set(prev);
          next.delete(pluginId);
          return next;
        });
      }
    },
    [handlePluginToggle],
  );

  // ── Add from directory ──────────────────────────────────────────────

  const handleAddFromDirectory = async () => {
    const trimmed = addDirPath.trim();
    if (!trimmed) return;
    setAddDirLoading(true);
    try {
      await client.installRegistryPlugin(trimmed);
      await loadPlugins();
      setAddDirPath("");
      setAddDirOpen(false);
      setActionNotice(`Plugin installed from ${trimmed}`, "success");
    } catch (err) {
      setActionNotice(
        `Failed to add plugin: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
        3800,
      );
    }
    setAddDirLoading(false);
  };

  // ── Drag-to-reorder handlers ─────────────────────────────────────

  const handleDragStart = useCallback(
    (e: React.DragEvent, pluginId: string) => {
      dragRef.current = pluginId;
      setDraggingId(pluginId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", pluginId);
    },
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent, pluginId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragRef.current && dragRef.current !== pluginId) {
      setDragOverId(pluginId);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      const srcId = dragRef.current;
      if (!srcId || srcId === targetId) {
        dragRef.current = null;
        setDraggingId(null);
        setDragOverId(null);
        return;
      }
      // Materialize current sorted order, then splice
      setPluginOrder(() => {
        // Build full order: items in custom order first, then any new ones
        const allIds = nonDbPlugins.map((p: PluginInfo) => p.id);
        let ids: string[];
        if (pluginOrder.length > 0) {
          const known = new Set(pluginOrder);
          ids = [...pluginOrder, ...allIds.filter((id) => !known.has(id))];
        } else {
          ids = sorted.map((p: PluginInfo) => p.id);
          // Pad with any nonDbPlugins not currently in sorted (due to filters)
          const inSorted = new Set(ids);
          for (const id of allIds) {
            if (!inSorted.has(id)) ids.push(id);
          }
        }
        const fromIdx = ids.indexOf(srcId);
        const toIdx = ids.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) return ids;
        ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, srcId);
        return ids;
      });
      dragRef.current = null;
      setDraggingId(null);
      setDragOverId(null);
    },
    [nonDbPlugins, pluginOrder, sorted],
  );

  const handleDragEnd = useCallback(() => {
    dragRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleResetOrder = useCallback(() => {
    setPluginOrder([]);
    localStorage.removeItem("pluginOrder");
  }, []);

  // ── Card renderers ────────────────────────────────────────────────

  const renderPluginCard = (p: PluginInfo) => {
    const hasParams = p.parameters && p.parameters.length > 0;
    const isOpen = pluginSettingsOpen.has(p.id);
    const setCount = hasParams
      ? p.parameters.filter((param: PluginParamDef) => param.isSet).length
      : 0;
    const totalCount = hasParams ? p.parameters.length : 0;
    const allParamsSet = !hasParams || setCount === totalCount;
    const isShowcase = p.id === "__ui-showcase__";
    const categoryLabel = isShowcase
      ? "showcase"
      : p.category === "ai-provider"
        ? "ai provider"
        : p.category;

    const enabledBorder = isShowcase
      ? "border-l-[3px] border-l-accent"
      : p.enabled
        ? !allParamsSet && hasParams
          ? "border-l-[3px] border-l-warn"
          : "border-l-[3px] border-l-accent"
        : "";
    const isToggleBusy = togglingPlugins.has(p.id);
    const toggleDisabled =
      isToggleBusy || (hasPluginToggleInFlight && !isToggleBusy);

    const isDragging = draggingId === p.id;
    const isDragOver = dragOverId === p.id && draggingId !== p.id;

    return (
      <li
        key={p.id}
        draggable
        onDragStart={(e) => handleDragStart(e, p.id)}
        onDragOver={(e) => handleDragOver(e, p.id)}
        onDrop={(e) => handleDrop(e, p.id)}
        onDragEnd={handleDragEnd}
        className={`border border-border bg-card transition-colors duration-150 flex flex-col ${enabledBorder} ${
          isOpen ? "ring-1 ring-accent" : "hover:border-accent/40"
        } ${isDragging ? "opacity-30" : ""} ${isDragOver ? "ring-2 ring-accent/60" : ""}`}
        data-plugin-id={p.id}
      >
        {/* Top: drag handle + icon + name + toggle */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-1">
          <span
            className="text-[10px] text-muted opacity-30 hover:opacity-70 cursor-grab active:cursor-grabbing shrink-0 select-none leading-none"
            title="Drag to reorder"
          >
            &#x2807;
          </span>
          <span className="font-bold text-sm flex items-center gap-1.5 min-w-0 truncate flex-1">
            {(() => {
              const icon = resolveIcon(p);
              if (!icon) return null;
              return icon.startsWith("http") ? (
                <img
                  src={icon}
                  alt=""
                  className="w-4 h-4 rounded-sm object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="text-sm">{icon}</span>
              );
            })()}
            {p.name}
          </span>
          {isShowcase ? (
            <span className="text-[10px] font-bold tracking-wider px-2.5 py-[2px] border border-accent text-accent bg-accent-subtle shrink-0">
              DEMO
            </span>
          ) : (
            <button
              type="button"
              data-plugin-toggle={p.id}
              className={`text-[10px] font-bold tracking-wider px-2.5 py-[2px] border transition-colors duration-150 shrink-0 ${
                p.enabled
                  ? "bg-accent text-accent-fg border-accent"
                  : "bg-transparent text-muted border-border hover:text-txt"
              } ${
                toggleDisabled
                  ? "opacity-60 cursor-not-allowed"
                  : "cursor-pointer"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                void handleTogglePlugin(p.id, !p.enabled);
              }}
              disabled={toggleDisabled}
            >
              {isToggleBusy ? "APPLYING" : p.enabled ? "ON" : "OFF"}
            </button>
          )}
        </div>

        {/* Badges: category + version + loaded status */}
        <div className="flex items-center gap-1.5 px-3 pb-1.5">
          <span className="text-[10px] px-1.5 py-px border border-border bg-surface text-muted lowercase tracking-wide whitespace-nowrap">
            {categoryLabel}
          </span>
          {p.version && (
            <span className="text-[10px] font-mono text-muted opacity-70">
              v{p.version}
            </span>
          )}
          {p.enabled && !p.isActive && !isShowcase && (
            <span
              className={`text-[10px] px-1.5 py-px border lowercase tracking-wide whitespace-nowrap ${
                p.loadError
                  ? "border-destructive bg-[rgba(153,27,27,0.04)] text-destructive"
                  : "border-warn bg-[rgba(234,179,8,0.06)] text-warn"
              }`}
              title={
                p.loadError || "Plugin is enabled but not loaded in the runtime"
              }
            >
              {p.loadError ? "load failed" : "not installed"}
            </span>
          )}
          {isToggleBusy && (
            <span className="text-[10px] px-1.5 py-px border border-accent bg-accent-subtle text-accent lowercase tracking-wide whitespace-nowrap">
              restarting...
            </span>
          )}
        </div>

        {/* Description — clamped to 3 lines */}
        <p
          className="text-xs text-muted px-3 pb-2 flex-1"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {p.description || "No description available"}
        </p>

        {/* Bottom bar: config status + settings button */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border mt-auto">
          {hasParams && !isShowcase ? (
            <>
              <span
                className={`inline-block w-[7px] h-[7px] rounded-full shrink-0 ${
                  allParamsSet ? "bg-ok" : "bg-destructive"
                }`}
              />
              <span className="text-[10px] text-muted">
                {setCount}/{totalCount} configured
              </span>
            </>
          ) : !hasParams && !isShowcase ? (
            <span className="text-[10px] text-muted opacity-50">
              No config needed
            </span>
          ) : (
            <span className="text-[10px] text-muted opacity-50">
              23 field demos
            </span>
          )}
          <div className="flex-1" />
          {p.enabled &&
            !p.isActive &&
            p.npmName &&
            !isShowcase &&
            !p.loadError && (
              <button
                type="button"
                className="text-[10px] px-2 py-[2px] border border-accent text-accent bg-transparent hover:bg-accent hover:text-accent-fg cursor-pointer transition-colors max-w-[180px] truncate"
                disabled={installingPlugins.has(p.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  handleInstallPlugin(p.id, p.npmName ?? "");
                }}
              >
                {installingPlugins.has(p.id)
                  ? installProgress.get(p.npmName ?? "")?.message ||
                    "Installing..."
                  : "Install"}
              </button>
            )}
          {hasParams && (
            <button
              type="button"
              className={`text-[10px] text-muted hover:text-accent cursor-pointer transition-colors flex items-center gap-1 ${
                isOpen ? "text-accent" : ""
              }`}
              onClick={() => toggleSettings(p.id)}
              title="Settings"
            >
              <span className="text-[11px]">&#9881;</span>
              <span
                className={`inline-block text-[8px] transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
              >
                &#9654;
              </span>
            </button>
          )}
        </div>

        {/* Validation errors */}
        {p.enabled && p.validationErrors && p.validationErrors.length > 0 && (
          <div className="px-3 py-1.5 border-t border-destructive bg-[rgba(153,27,27,0.04)] text-xs">
            {p.validationErrors.map(
              (err: { field: string; message: string }) => (
                <div
                  key={`${err.field}:${err.message}`}
                  className="text-destructive mb-0.5 text-[10px]"
                >
                  {err.field}: {err.message}
                </div>
              ),
            )}
          </div>
        )}

        {/* Validation warnings */}
        {p.enabled &&
          p.validationWarnings &&
          p.validationWarnings.length > 0 && (
            <div className="px-3 py-1">
              {p.validationWarnings.map(
                (w: { field: string; message: string }) => (
                  <div
                    key={`${w.field}:${w.message}`}
                    className="text-warn text-[10px]"
                  >
                    {w.message}
                  </div>
                ),
              )}
            </div>
          )}
      </li>
    );
  };

  /** Render a grid of plugin cards. */
  const renderPluginGrid = (plugins: PluginInfo[]) => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 m-0 p-0 list-none">
      {plugins.map((p: PluginInfo) => renderPluginCard(p))}
    </ul>
  );

  // Resolve the plugin whose settings dialog is currently open.
  // Exclude ai-provider plugins — those are configured in Settings.
  const settingsDialogPlugin = useMemo(() => {
    for (const id of pluginSettingsOpen) {
      const p = nonDbPlugins.find((pl: PluginInfo) => pl.id === id);
      if (p?.parameters && p.parameters.length > 0) return p;
    }
    return null;
  }, [pluginSettingsOpen, nonDbPlugins]);

  // ── Main render ────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar: search + status toggle */}
      <div className="flex items-center gap-2 mb-3.5 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <input
            type="text"
            className="w-full py-[5px] px-3 pr-8 border border-border bg-card text-[13px] transition-colors duration-150 focus:border-accent focus:outline-none placeholder:text-muted placeholder:italic"
            placeholder={`Search ${label.toLowerCase()}...`}
            value={pluginSearch}
            onChange={(e) => setState("pluginSearch", e.target.value)}
          />
          {pluginSearch && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-muted cursor-pointer text-sm px-1.5 py-px leading-none hover:text-txt"
              onClick={() => setState("pluginSearch", "")}
              title="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        {/* Status toggle: All / Enabled */}
        <div className="flex gap-1 shrink-0">
          {(["all", "enabled"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`px-2.5 py-[3px] border text-[11px] cursor-pointer transition-colors duration-150 ${
                pluginStatusFilter === s
                  ? "bg-accent text-accent-fg border-accent"
                  : "bg-surface text-txt border-border hover:bg-bg-hover"
              }`}
              onClick={() => setState("pluginStatusFilter", s as StatusFilter)}
            >
              {s === "all"
                ? `All (${categoryPlugins.length})`
                : `Enabled (${enabledCount})`}
            </button>
          ))}
        </div>

        {/* Reset order (only visible when custom order is set) */}
        {pluginOrder.length > 0 && (
          <button
            type="button"
            className="px-2.5 py-[3px] border border-border bg-surface text-muted text-[11px] cursor-pointer shrink-0 hover:text-txt hover:bg-bg-hover"
            onClick={handleResetOrder}
            title="Reset to default sort order"
          >
            Reset Order
          </button>
        )}

        {/* Add plugin button */}
        <button
          type="button"
          className="px-2.5 py-[3px] border border-accent bg-accent text-accent-fg text-[11px] cursor-pointer shrink-0 hover:bg-accent-hover hover:border-accent-hover"
          onClick={() => setAddDirOpen(true)}
        >
          + Add Plugin
        </button>
      </div>

      {hasPluginToggleInFlight && (
        <div className="mb-3 px-3 py-2 border border-accent bg-accent-subtle text-[11px] text-accent">
          Applying plugin change and waiting for agent restart...
        </div>
      )}

      {/* Tag filters */}
      {showSubgroupFilters && (
        <div className="flex items-center gap-1.5 mb-3.5 flex-wrap">
          {subgroupTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={`px-2.5 py-[3px] border text-[11px] cursor-pointer transition-colors duration-150 ${
                subgroupFilter === tag.id
                  ? "bg-accent text-accent-fg border-accent"
                  : "bg-surface text-txt border-border hover:bg-bg-hover"
              }`}
              onClick={() => setSubgroupFilter(tag.id)}
            >
              {tag.label} ({tag.count})
            </button>
          ))}
        </div>
      )}

      {/* Plugin grid */}
      <div className="overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="text-center py-10 px-5 text-muted border border-dashed border-border">
            {pluginSearch
              ? `No ${label.toLowerCase()} match your search.`
              : `No ${label.toLowerCase()} available.`}
          </div>
        ) : visiblePlugins.length === 0 ? (
          <div className="text-center py-10 px-5 text-muted border border-dashed border-border">
            {showSubgroupFilters
              ? "No plugins match this tag filter."
              : `No ${label.toLowerCase()} match your filters.`}
          </div>
        ) : (
          renderPluginGrid(visiblePlugins)
        )}
      </div>

      {/* Settings dialog */}
      {settingsDialogPlugin &&
        (() => {
          const p = settingsDialogPlugin;
          const isShowcase = p.id === "__ui-showcase__";
          const isSaving = pluginSaving.has(p.id);
          const saveSuccess = pluginSaveSuccess.has(p.id);
          const categoryLabel = isShowcase
            ? "showcase"
            : p.category === "ai-provider"
              ? "ai provider"
              : p.category;
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
              onClick={(e) => {
                if (e.target === e.currentTarget) toggleSettings(p.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleSettings(p.id);
                }
              }}
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-2xl max-h-[85vh] border border-border bg-card shadow-lg flex flex-col overflow-hidden">
                {/* Dialog header */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
                  <span className="font-bold text-sm flex items-center gap-1.5 flex-1 min-w-0">
                    {(() => {
                      const icon = resolveIcon(p);
                      if (!icon) return null;
                      return icon.startsWith("http") ? (
                        <img
                          src={icon}
                          alt=""
                          className="w-4 h-4 rounded-sm object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-sm">{icon}</span>
                      );
                    })()}
                    {p.name}
                  </span>
                  <span className="text-[10px] px-1.5 py-px border border-border bg-surface text-muted lowercase tracking-wide">
                    {categoryLabel}
                  </span>
                  {p.version && (
                    <span className="text-[10px] font-mono text-muted opacity-70">
                      v{p.version}
                    </span>
                  )}
                  {isShowcase && (
                    <span className="text-[10px] font-bold tracking-wider px-2.5 py-[2px] border border-accent text-accent bg-accent-subtle">
                      DEMO
                    </span>
                  )}
                  <button
                    type="button"
                    className="text-muted hover:text-txt text-lg leading-none px-1 cursor-pointer"
                    onClick={() => toggleSettings(p.id)}
                  >
                    &times;
                  </button>
                </div>

                {/* Dialog body — scrollable */}
                <div className="overflow-y-auto flex-1">
                  {/* Plugin details */}
                  <div className="px-5 pt-4 pb-1 flex items-center gap-3 flex-wrap text-xs text-muted">
                    {p.description && (
                      <span className="text-[12px] text-muted leading-relaxed">
                        {p.description}
                      </span>
                    )}
                  </div>
                  {(p.npmName || (p.pluginDeps && p.pluginDeps.length > 0)) && (
                    <div className="px-5 pb-2 flex items-center gap-3 flex-wrap">
                      {p.npmName && (
                        <span className="font-mono text-[10px] text-muted opacity-50">
                          {p.npmName}
                        </span>
                      )}
                      {p.pluginDeps && p.pluginDeps.length > 0 && (
                        <span className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] text-muted opacity-60">
                            depends on:
                          </span>
                          {p.pluginDeps.map((dep: string) => (
                            <span
                              key={dep}
                              className="text-[10px] px-1.5 py-px border border-border bg-accent-subtle text-muted rounded-sm"
                            >
                              {dep}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="px-5 py-3">
                    <PluginConfigForm
                      plugin={p}
                      pluginConfigs={pluginConfigs}
                      onParamChange={handleParamChange}
                    />
                    {p.id === "whatsapp" && (
                      <WhatsAppQrOverlay accountId="default" />
                    )}
                  </div>
                </div>

                {/* Dialog footer — actions (hidden for showcase) */}
                {!isShowcase && (
                  <div className="flex justify-end gap-2.5 px-5 py-3 border-t border-border shrink-0">
                    {p.enabled && !p.isActive && p.npmName && !p.loadError && (
                      <button
                        type="button"
                        className="px-3 py-1.5 text-[11px] border border-accent text-accent bg-transparent hover:bg-accent hover:text-accent-fg cursor-pointer rounded-sm transition-colors max-w-[260px] truncate"
                        disabled={installingPlugins.has(p.id)}
                        onClick={() =>
                          handleInstallPlugin(p.id, p.npmName ?? "")
                        }
                      >
                        {installingPlugins.has(p.id)
                          ? installProgress.get(p.npmName ?? "")?.message ||
                            "Installing..."
                          : "Install Plugin"}
                      </button>
                    )}
                    {p.loadError && (
                      <span
                        className="px-3 py-1.5 text-[11px] text-destructive"
                        title={p.loadError}
                      >
                        Package broken — missing compiled files
                      </span>
                    )}
                    {p.isActive && (
                      <button
                        type="button"
                        className={`px-3 py-1.5 text-[11px] border rounded-sm transition-colors ${
                          testResults.get(p.id)?.loading
                            ? "border-[var(--border)] text-[var(--muted)] cursor-wait"
                            : testResults.get(p.id)?.success
                              ? "border-[var(--ok)] text-[var(--ok)] bg-[color-mix(in_srgb,var(--ok)_5%,transparent)]"
                              : testResults.get(p.id)?.error
                                ? "border-[var(--destructive)] text-[var(--destructive)]"
                                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
                        }`}
                        disabled={testResults.get(p.id)?.loading}
                        onClick={() => handleTestConnection(p.id)}
                      >
                        {testResults.get(p.id)?.loading
                          ? "Testing..."
                          : testResults.get(p.id)?.success
                            ? `\u2713 OK (${testResults.get(p.id)?.durationMs}ms)`
                            : testResults.get(p.id)?.error
                              ? `\u2715 ${testResults.get(p.id)?.error}`
                              : "Test Connection"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="bg-transparent border border-border text-muted cursor-pointer text-[12px] px-4 py-1.5 rounded-sm hover:text-txt hover:bg-bg-hover transition-colors"
                      onClick={() => handleConfigReset(p.id)}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      className={`text-[12px] px-5 py-1.5 cursor-pointer border rounded-sm transition-all duration-200 font-medium ${
                        saveSuccess
                          ? "!bg-ok !text-white !border-ok"
                          : "bg-accent text-accent-fg border-accent hover:bg-accent-hover hover:shadow-sm"
                      }`}
                      onClick={() => handleConfigSave(p.id)}
                      disabled={isSaving}
                    >
                      {isSaving
                        ? "Saving..."
                        : saveSuccess
                          ? "\u2713 Saved"
                          : "Save Settings"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* Add from directory modal */}
      {addDirOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setAddDirOpen(false);
              setAddDirPath("");
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setAddDirOpen(false);
              setAddDirPath("");
            }
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md border border-border bg-card p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-sm">Add Plugin</div>
              <button
                type="button"
                className="text-muted hover:text-txt text-lg leading-none px-1"
                onClick={() => {
                  setAddDirOpen(false);
                  setAddDirPath("");
                }}
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-muted mb-3">
              Enter the path to a local plugin directory or package name.
            </p>

            <input
              type="text"
              className="w-full py-2 px-3 border border-border bg-bg text-[13px] font-mono transition-colors duration-150 focus:border-accent focus:outline-none placeholder:text-muted placeholder:font-body placeholder:italic"
              placeholder="/path/to/plugin or package-name"
              value={addDirPath}
              onChange={(e) => setAddDirPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddFromDirectory();
              }}
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-[5px] border border-border bg-transparent text-muted text-xs cursor-pointer hover:text-txt hover:bg-bg-hover"
                onClick={() => {
                  setAddDirOpen(false);
                  setAddDirPath("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-[5px] border border-accent bg-accent text-accent-fg text-xs cursor-pointer hover:bg-accent-hover hover:border-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={handleAddFromDirectory}
                disabled={addDirLoading || !addDirPath.trim()}
              >
                {addDirLoading ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Exported views ────────────────────────────────────────────────── */

/** Unified plugins view — tag-filtered plugin list. */
export function PluginsView({ mode = "all" }: { mode?: PluginsViewMode }) {
  return (
    <PluginListView
      label={mode === "connectors" ? "Connectors" : "Plugins"}
      mode={mode}
    />
  );
}
