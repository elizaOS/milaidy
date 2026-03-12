/**
 * Plugins view — tag-filtered plugin management.
 *
 * Renders a unified plugin list with searchable/filterable cards and per-plugin settings.
 */

import type { PluginInfo, PluginParamDef } from "@milady/app-core/api";
import { client } from "@milady/app-core/api";
import { autoLabel } from "@milady/app-core/components";
import type { ConfigUiHint } from "@milady/app-core/types";
import { resolveAppAssetUrl } from "@milady/app-core/utils";
import { Button, Input } from "@milady/ui";
import type { LucideIcon } from "lucide-react";
import {
  Binary,
  BookOpen,
  Bot,
  Brain,
  BrickWall,
  Briefcase,
  Calendar,
  Chrome,
  Circle,
  CircleDashed,
  CircleDot,
  ClipboardList,
  Clock,
  Cloud,
  Command,
  Construction,
  CreditCard,
  Diamond,
  Dna,
  Droplets,
  Eye,
  Feather,
  FileKey,
  FileText,
  Fingerprint,
  Gamepad,
  Gamepad2,
  Github,
  Handshake,
  Hash,
  Layers,
  Leaf,
  Link,
  Lock,
  LockKeyhole,
  Mail,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Mic,
  Monitor,
  MousePointer2,
  Package,
  PenTool,
  Phone,
  Pickaxe,
  Puzzle,
  RefreshCw,
  Rss,
  ScrollText,
  Send,
  Server,
  Settings,
  Shell,
  Shuffle,
  Smartphone,
  Sparkle,
  Sparkles,
  Square,
  Star,
  StickyNote,
  Target,
  Tornado,
  TrendingDown,
  Triangle,
  Twitter,
  Video,
  Volume2,
  Wallet,
  Webhook,
  Wrench,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppContext";
import { openExternalUrl } from "../utils/openExternalUrl";
import type { JsonSchemaObject } from "./config-catalog";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import { SHOWCASE_PLUGIN } from "./plugins/showcase-data";
import { WhatsAppQrOverlay } from "./WhatsAppQrOverlay";

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
  "miladycloud",
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
function isAdvancedParam(param: PluginParamDef): boolean {
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

const DEFAULT_ICONS: Record<string, LucideIcon> = {
  // AI Providers
  anthropic: Brain,
  "google-genai": Sparkles,
  groq: Zap,
  "local-ai": Monitor,
  ollama: Bot,
  openai: CircleDashed,
  openrouter: Shuffle,
  "vercel-ai-gateway": Triangle,
  xai: Hash,
  // Connectors — chat & social
  discord: MessageCircle,
  telegram: Send,
  slack: Briefcase,
  twitter: Twitter,
  whatsapp: Smartphone,
  signal: Lock,
  imessage: MessageSquare,
  bluebubbles: Droplets,
  bluesky: Leaf,
  farcaster: Circle,
  instagram: Video,
  nostr: Fingerprint,
  twitch: Gamepad2,
  matrix: Link,
  mattermost: Diamond,
  msteams: Square,
  "google-chat": MessagesSquare,
  feishu: Feather,
  line: Circle,
  "nextcloud-talk": Cloud,
  tlon: Tornado,
  zalo: Circle,
  zalouser: Circle,
  // Features — voice & audio
  "edge-tts": Volume2,
  elevenlabs: Mic,
  tts: Volume2,
  "simple-voice": Mic,
  "robot-voice": Bot,
  // Features — blockchain & finance
  evm: Link,
  solana: CircleDot,
  "auto-trader": TrendingDown,
  "lp-manager": Wallet,
  "social-alpha": Layers,
  polymarket: Gamepad2,
  x402: CreditCard,
  trust: Handshake,
  iq: Puzzle,
  // Features — dev tools & infra
  cli: Hash,
  code: Puzzle,
  shell: Shell,
  github: Github,
  linear: Square,
  mcp: Puzzle,
  browser: Chrome,
  computeruse: MousePointer2,
  n8n: Settings,
  webhooks: Webhook,
  // Features — knowledge & memory
  knowledge: BookOpen,
  memory: Dna,
  "local-embedding": Binary,
  pdf: FileText,
  "secrets-manager": FileKey,
  scratchpad: StickyNote,
  rlm: RefreshCw,
  // Features — agents & orchestration
  "agent-orchestrator": Target,
  "agent-skills": Wrench,
  "plugin-manager": Package,
  "copilot-proxy": Handshake,
  directives: ClipboardList,
  goals: Target,
  "eliza-classic": Bot,
  // Features — media & content
  vision: Eye,
  rss: Rss,
  "gmail-watch": Mail,
  prose: PenTool,
  form: ClipboardList,
  // Features — scheduling & automation
  cron: Clock,
  scheduling: Calendar,
  todo: ClipboardList,
  commands: Command,
  // Features — storage & logging
  "s3-storage": Server,
  "trajectory-logger": TrendingDown,
  experience: Star,
  // Features — gaming & misc
  minecraft: Pickaxe,
  roblox: BrickWall,
  babylon: Gamepad,
  mysticism: Sparkle,
  personality: Target,
  moltbook: ScrollText,
  tee: LockKeyhole,
  blooio: Circle,
  acp: Construction,
  miladycloud: Cloud,
  twilio: Phone,
};

/** Resolve display icon: explicit plugin.icon, fallback to default map, or null. */
function resolveIcon(p: PluginInfo): LucideIcon | string | null {
  if (p.icon) return p.icon;
  return DEFAULT_ICONS[p.id] ?? null;
}

function iconImageSource(icon: string): string | null {
  const value = icon.trim();
  if (!value) return null;
  if (
    /^(https?:|data:image\/|blob:|file:|capacitor:|capacitor-electron:|app:|\/|\.\/|\.\.\/)/i.test(
      value,
    )
  ) {
    return resolveAppAssetUrl(value);
  }
  return null;
}

function getPluginResourceLinks(
  plugin: Pick<PluginInfo, "setupGuideUrl" | "homepage" | "repository">,
): Array<{ key: string; label: string; url: string }> {
  const seen = new Set<string>();
  const ordered = [
    { key: "guide", label: "Setup guide", url: plugin.setupGuideUrl },
    { key: "official", label: "Official", url: plugin.homepage },
    { key: "source", label: "Source", url: plugin.repository },
  ];
  return ordered.flatMap((item) => {
    const url = item.url?.trim();
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ key: item.key, label: item.label, url }];
  });
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
  "streaming",
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
  streaming: "Streaming Destinations",
  showcase: "Showcase",
};

function subgroupForPlugin(plugin: PluginInfo): string {
  if (plugin.id === "__ui-showcase__") return "showcase";
  if (plugin.category === "ai-provider") return "ai-provider";
  if (plugin.category === "connector") return "connector";
  if (plugin.category === "streaming") return "streaming";
  return FEATURE_SUBGROUP[plugin.id] ?? "feature-other";
}

type StatusFilter = "all" | "enabled";
type PluginsViewMode = "all" | "connectors" | "streaming";

/* ── Shared PluginListView ─────────────────────────────────────────── */

interface PluginListViewProps {
  /** Label used in search placeholder and empty state messages. */
  label: string;
  /** Optional list mode for pre-filtered views like Connectors. */
  mode?: PluginsViewMode;
  /** Whether the view is rendered in a full-screen gamified modal. */
  inModal?: boolean;
}

function PluginListView({ label, mode = "all", inModal }: PluginListViewProps) {
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
    t,
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
          (mode !== "connectors" || p.category === "connector") &&
          (mode !== "streaming" || p.category === "streaming"),
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
  const showSubgroupFilters = mode !== "connectors" && mode !== "streaming";

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

  const handleOpenPluginExternalUrl = useCallback(
    async (url: string) => {
      try {
        await openExternalUrl(url);
      } catch (err) {
        setActionNotice(
          err instanceof Error ? err.message : "Failed to open external link.",
          "error",
          4200,
        );
      }
    },
    [setActionNotice],
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
    const pluginLinks = getPluginResourceLinks(p);

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
            title={t("pluginsview.DragToReorder")}
          >
            {t("pluginsview.X2807")}
          </span>
          <span className="font-bold text-sm flex items-center gap-1.5 min-w-0 truncate flex-1">
            {(() => {
              const icon = resolveIcon(p);
              if (!icon) return null;
              if (typeof icon === "string") {
                const imageSrc = iconImageSource(icon);
                return imageSrc ? (
                  <img
                    src={imageSrc}
                    alt=""
                    className="w-5 h-5 rounded-sm object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                ) : (
                  <span className="text-sm">{icon}</span>
                );
              }
              const IconComponent = icon;
              return <IconComponent className="w-5 h-5" />;
            })()}
            {p.name}
          </span>
          {isShowcase ? (
            <span className="text-[10px] font-bold tracking-wider px-2.5 py-[2px] border border-accent text-accent bg-accent-subtle shrink-0">
              {t("pluginsview.DEMO")}
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
              {t("pluginsview.restarting")}
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

        {pluginLinks.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pb-2">
            {pluginLinks.map((link) => (
              <Button
                key={`${p.id}:${link.key}`}
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10px] font-bold border-border/40 text-muted hover:text-accent hover:border-accent hover:bg-accent/5 backdrop-blur-sm transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleOpenPluginExternalUrl(link.url);
                }}
                title={`${link.label}: ${link.url}`}
              >
                {link.label}
              </Button>
            ))}
          </div>
        )}

        {/* Bottom bar: config status + settings button */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-border/40 mt-auto bg-black/5">
          {hasParams && !isShowcase ? (
            <>
              <span
                className={`inline-block w-2 h-2 rounded-full shadow-[0_0_10px_currentColor] shrink-0 ${
                  allParamsSet
                    ? "bg-ok text-ok"
                    : "bg-destructive text-destructive"
                }`}
              />
              <span className="text-[11px] font-bold tracking-wide text-muted">
                {setCount}/{totalCount} {t("pluginsview.configured")}
              </span>
            </>
          ) : !hasParams && !isShowcase ? (
            <span className="text-[11px] font-bold tracking-wide text-muted/60">
              {t("pluginsview.NoConfigNeeded")}
            </span>
          ) : (
            <span className="text-[11px] font-bold tracking-wide text-muted/60">
              {t("pluginsview.23FieldDemos")}
            </span>
          )}
          <div className="flex-1" />
          {p.enabled &&
            !p.isActive &&
            p.npmName &&
            !isShowcase &&
            !p.loadError && (
              <Button
                variant="default"
                size="sm"
                className="h-7 px-3 text-[10px] font-bold tracking-wide shadow-sm max-w-[140px] truncate"
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
              </Button>
            )}
          {hasParams && (
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 px-2.5 text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                isOpen
                  ? "text-accent bg-accent/10 hover:bg-accent/20"
                  : "text-muted hover:text-txt hover:bg-white/5"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                toggleSettings(p.id);
              }}
              title={t("pluginsview.Settings")}
            >
              <span className="text-[14px] leading-none">&#9881;</span>
              <span
                className={`inline-block text-[10px] transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
              >
                &#9654;
              </span>
            </Button>
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

  // ── Game-modal state ──────────────────────────────────────────────
  const [gameSelectedId, setGameSelectedId] = useState<string | null>(null);
  const [gameMobileDetail, setGameMobileDetail] = useState(false);
  const gameNarrow =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 600px)").matches
      : false;

  // Auto-select first visible plugin in game modal
  const gameVisiblePlugins = visiblePlugins.filter(
    (p: PluginInfo) => p.id !== "__ui-showcase__",
  );
  const effectiveGameSelected = gameVisiblePlugins.find(
    (p: PluginInfo) => p.id === gameSelectedId,
  )
    ? gameSelectedId
    : (gameVisiblePlugins[0]?.id ?? null);
  const selectedPlugin =
    gameVisiblePlugins.find(
      (p: PluginInfo) => p.id === effectiveGameSelected,
    ) ?? null;
  const selectedPluginLinks = selectedPlugin
    ? getPluginResourceLinks(selectedPlugin)
    : [];

  // ── Game-modal render ─────────────────────────────────────────────
  if (inModal) {
    const sectionTitle = mode === "connectors" ? "Channels" : label;
    return (
      <div className="plugins-game-modal">
        <div
          className={`plugins-game-list-panel${
            gameNarrow && gameMobileDetail ? " is-hidden" : ""
          }`}
        >
          <div className="plugins-game-list-head">
            <div className="plugins-game-section-title">{sectionTitle}</div>
          </div>
          <div className="plugins-game-list-scroll">
            {gameVisiblePlugins.length === 0 ? (
              <div className="plugins-game-list-empty">
                No {sectionTitle.toLowerCase()} {t("pluginsview.found")}
              </div>
            ) : (
              gameVisiblePlugins.map((p: PluginInfo) => (
                <button
                  key={p.id}
                  type="button"
                  className={`plugins-game-card${
                    effectiveGameSelected === p.id ? " is-selected" : ""
                  }${!p.enabled ? " is-disabled" : ""}`}
                  onClick={() => {
                    setGameSelectedId(p.id);
                    if (gameNarrow) setGameMobileDetail(true);
                  }}
                >
                  <div className="plugins-game-card-icon-shell">
                    <span className="plugins-game-card-icon">
                      {(() => {
                        const icon = resolveIcon(p);
                        if (!icon) return "🧩";
                        if (typeof icon === "string") {
                          const imageSrc = iconImageSource(icon);
                          return imageSrc ? (
                            <img
                              src={imageSrc}
                              alt=""
                              className="plugins-game-card-icon"
                              style={{ objectFit: "contain" }}
                            />
                          ) : (
                            icon
                          );
                        }
                        const IconComponent = icon;
                        return <IconComponent className="w-5 h-5" />;
                      })()}
                    </span>
                  </div>
                  <div className="plugins-game-card-body">
                    <div className="plugins-game-card-name">{p.name}</div>
                    <div className="plugins-game-card-meta">
                      <span
                        className={`plugins-game-badge ${
                          p.enabled ? "is-on" : "is-off"
                        }`}
                      >
                        {p.enabled ? "ON" : "OFF"}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        <div
          className={`plugins-game-detail-panel${
            gameNarrow && !gameMobileDetail ? " is-hidden" : ""
          }`}
        >
          {selectedPlugin ? (
            <>
              <div className="plugins-game-detail-head">
                {gameNarrow && (
                  <button
                    type="button"
                    className="plugins-game-back-btn"
                    onClick={() => setGameMobileDetail(false)}
                  >
                    {t("pluginsview.Back")}
                  </button>
                )}
                <div className="plugins-game-detail-title-row">
                  <div className="plugins-game-detail-icon-shell">
                    <span className="plugins-game-detail-icon">
                      {(() => {
                        const icon = resolveIcon(selectedPlugin);
                        if (!icon) return "🧩";
                        if (typeof icon === "string") {
                          const imageSrc = iconImageSource(icon);
                          return imageSrc ? (
                            <img
                              src={imageSrc}
                              alt=""
                              className="plugins-game-detail-icon"
                            />
                          ) : (
                            icon
                          );
                        }
                        const IconComponent = icon;
                        return <IconComponent className="w-6 h-6" />;
                      })()}
                    </span>
                  </div>
                  <div className="plugins-game-detail-main">
                    <div className="plugins-game-detail-name">
                      {selectedPlugin.name}
                    </div>
                    {selectedPlugin.version && (
                      <span className="plugins-game-version">
                        v{selectedPlugin.version}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`plugins-game-toggle ${
                      selectedPlugin.enabled ? "is-on" : "is-off"
                    }`}
                    onClick={() =>
                      void handleTogglePlugin(
                        selectedPlugin.id,
                        !selectedPlugin.enabled,
                      )
                    }
                    disabled={togglingPlugins.has(selectedPlugin.id)}
                  >
                    {selectedPlugin.enabled ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
              <div className="plugins-game-detail-description">
                {selectedPlugin.description}
              </div>
              {selectedPluginLinks.length > 0 && (
                <div className="plugins-game-detail-links flex flex-wrap gap-2 px-3 pb-3">
                  {selectedPluginLinks.map((link) => (
                    <button
                      key={`${selectedPlugin.id}:${link.key}`}
                      type="button"
                      className="plugins-game-link-btn border border-border bg-transparent px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
                      onClick={() => {
                        void handleOpenPluginExternalUrl(link.url);
                      }}
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              )}
              {selectedPlugin.parameters &&
                selectedPlugin.parameters.length > 0 && (
                  <div className="plugins-game-detail-config">
                    {selectedPlugin.parameters.map((param: PluginParamDef) => (
                      <div key={param.key} id={`field-${param.key}`}>
                        <label
                          htmlFor={`input-${param.key}`}
                          className="text-[11px] tracking-wider text-muted block mb-1"
                        >
                          {param.key}
                        </label>
                        <input
                          id={`input-${param.key}`}
                          type={param.sensitive ? "password" : "text"}
                          className="w-full px-2 py-1 text-[12px]"
                          placeholder={param.description}
                          value={
                            pluginConfigs[selectedPlugin.id]?.[param.key] ??
                            param.currentValue ??
                            ""
                          }
                          onChange={(e) =>
                            handleParamChange(
                              selectedPlugin.id,
                              param.key,
                              e.target.value,
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              <div className="plugins-game-detail-actions">
                <button
                  type="button"
                  className="plugins-game-action-btn"
                  onClick={() => void handleTestConnection(selectedPlugin.id)}
                >
                  {t("pluginsview.TestConnection")}
                </button>
                <button
                  type="button"
                  className={`plugins-game-action-btn plugins-game-save-btn${
                    pluginSaveSuccess.has(selectedPlugin.id) ? " is-saved" : ""
                  }`}
                  onClick={() => void handleConfigSave(selectedPlugin.id)}
                  disabled={pluginSaving.has(selectedPlugin.id)}
                >
                  {pluginSaving.has(selectedPlugin.id)
                    ? "Saving..."
                    : pluginSaveSuccess.has(selectedPlugin.id)
                      ? "Saved!"
                      : "Save"}
                </button>
              </div>
            </>
          ) : (
            <div className="plugins-game-detail-empty">
              <span className="plugins-game-detail-empty-icon">🧩</span>
              <span className="plugins-game-detail-empty-text">
                {t("pluginsview.SelectA")}{" "}
                {mode === "connectors" ? "channel" : "plugin"}{" "}
                {t("pluginsview.toC")}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar: search + status toggle */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Input
            type="text"
            className="w-full bg-card/60 backdrop-blur-md shadow-inner pr-8 h-9 rounded-xl focus-visible:ring-accent border-border/40"
            placeholder={`Search ${label.toLowerCase()}...`}
            value={pluginSearch}
            onChange={(e) => setState("pluginSearch", e.target.value)}
          />
          {pluginSearch && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 text-muted hover:text-txt rounded-full"
              onClick={() => setState("pluginSearch", "")}
              title={t("pluginsview.ClearSearch")}
            >
              ✕
            </Button>
          )}
        </div>

        {/* Status toggle: All / Enabled */}
        <div className="flex gap-1.5 shrink-0 bg-black/10 p-1 rounded-xl border border-white/5">
          {(["all", "enabled"] as const).map((s) => (
            <Button
              key={s}
              variant={pluginStatusFilter === s ? "default" : "ghost"}
              size="sm"
              className={`h-7 px-3 text-[11px] font-bold tracking-wide rounded-lg transition-all ${
                pluginStatusFilter === s
                  ? "shadow-sm"
                  : "text-muted hover:text-txt hover:bg-white/5"
              }`}
              onClick={() => setState("pluginStatusFilter", s as StatusFilter)}
            >
              {s === "all"
                ? `All (${categoryPlugins.length})`
                : `Enabled (${enabledCount})`}
            </Button>
          ))}
        </div>

        {/* Reset order (only visible when custom order is set) */}
        {pluginOrder.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-[11px] font-bold border-border/40 bg-card/40 backdrop-blur-md shadow-sm rounded-xl shrink-0"
            onClick={handleResetOrder}
            title={t("pluginsview.ResetToDefaultSor")}
          >
            {t("pluginsview.ResetOrder")}
          </Button>
        )}

        {/* Add plugin button */}
        <Button
          variant="secondary"
          size="sm"
          className="h-8 px-4 text-[11px] font-bold tracking-wide border border-accent/30 text-accent bg-accent/10 hover:bg-accent/20 hover:border-accent/50 shadow-sm rounded-xl shrink-0 transition-all"
          onClick={() => setAddDirOpen(true)}
        >
          {t("pluginsview.AddPlugin")}
        </Button>
      </div>

      {hasPluginToggleInFlight && (
        <div className="mb-3 px-3 py-2 border border-accent bg-accent-subtle text-[11px] text-accent">
          {t("pluginsview.ApplyingPluginChan")}
        </div>
      )}

      {/* Tag filters */}
      {showSubgroupFilters && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {subgroupTags.map((tag) => (
            <Button
              key={tag.id}
              variant={subgroupFilter === tag.id ? "default" : "outline"}
              size="sm"
              className={`h-7 px-3 text-[11px] font-bold tracking-wide rounded-lg transition-all ${
                subgroupFilter === tag.id
                  ? "shadow-[0_0_10px_rgba(var(--accent),0.2)] border-accent"
                  : "bg-card/40 backdrop-blur-sm border-border/40 text-muted hover:text-txt shadow-sm hover:border-accent/30"
              }`}
              onClick={() => setSubgroupFilter(tag.id)}
            >
              {tag.label}
              <span
                className={`ml-1.5 px-1.5 py-0.5 rounded border text-[9px] font-mono leading-none ${subgroupFilter === tag.id ? "bg-black/20 border-black/10" : "bg-black/10 border-white/5"}`}
              >
                {tag.count}
              </span>
            </Button>
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
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6 animate-in fade-in duration-200"
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
              <div className="w-full max-w-2xl max-h-[85vh] border border-border/50 bg-card/90 shadow-2xl flex flex-col overflow-hidden rounded-2xl backdrop-blur-xl">
                {/* Dialog header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border/30 bg-black/10 shrink-0">
                  <span className="font-bold text-base flex items-center gap-2 flex-1 min-w-0 tracking-wide text-txt">
                    {(() => {
                      const icon = resolveIcon(p);
                      if (!icon) return null;
                      if (typeof icon === "string") {
                        const imageSrc = iconImageSource(icon);
                        return imageSrc ? (
                          <img
                            src={imageSrc}
                            alt=""
                            className="w-6 h-6 rounded-md object-contain"
                            onError={(e) => {
                              (
                                e.currentTarget as HTMLImageElement
                              ).style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="text-base">{icon}</span>
                        );
                      }
                      const IconComponent = icon;
                      return <IconComponent className="w-6 h-6 text-accent" />;
                    })()}
                    {p.name}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-border/40 bg-black/20 text-muted lowercase tracking-widest font-bold">
                    {categoryLabel}
                  </span>
                  {p.version && (
                    <span className="text-[10px] font-mono text-muted/70">
                      v{p.version}
                    </span>
                  )}
                  {isShowcase && (
                    <span className="text-[10px] font-bold tracking-widest px-2.5 py-[2px] border border-accent/30 text-accent bg-accent/10 rounded-full">
                      {t("pluginsview.DEMO")}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted hover:bg-white/10 hover:text-txt rounded-full transition-all shrink-0 ml-2"
                    onClick={() => toggleSettings(p.id)}
                  >
                    ✕
                  </Button>
                </div>

                {/* Dialog body — scrollable */}
                <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
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
                            {t("pluginsview.dependsOn")}
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
                  <div className="flex justify-end gap-3 px-5 py-4 border-t border-border/30 shrink-0 bg-black/10">
                    {p.enabled && !p.isActive && p.npmName && !p.loadError && (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 px-4 text-[11px] font-bold tracking-wide shadow-sm"
                        disabled={installingPlugins.has(p.id)}
                        onClick={() =>
                          handleInstallPlugin(p.id, p.npmName ?? "")
                        }
                      >
                        {installingPlugins.has(p.id)
                          ? installProgress.get(p.npmName ?? "")?.message ||
                            "Installing..."
                          : "Install Plugin"}
                      </Button>
                    )}
                    {p.loadError && (
                      <span
                        className="px-3 py-1.5 text-[11px] text-danger font-bold tracking-wide"
                        title={p.loadError}
                      >
                        {t("pluginsview.PackageBrokenMis")}
                      </span>
                    )}
                    {p.isActive && (
                      <Button
                        variant={
                          testResults.get(p.id)?.success
                            ? "default"
                            : testResults.get(p.id)?.error
                              ? "destructive"
                              : "outline"
                        }
                        size="sm"
                        className={`h-8 px-4 text-[11px] font-bold tracking-wide transition-all ${
                          testResults.get(p.id)?.loading
                            ? "opacity-70 cursor-wait"
                            : testResults.get(p.id)?.success
                              ? "bg-ok text-ok-fg border-ok hover:bg-ok/90"
                              : testResults.get(p.id)?.error
                                ? "bg-danger text-danger-fg border-danger hover:bg-danger/90"
                                : "border-border/40 bg-card/40 backdrop-blur-md shadow-sm hover:border-accent/40"
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
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-4 text-[12px] font-bold text-muted hover:text-txt transition-all"
                      onClick={() => handleConfigReset(p.id)}
                    >
                      {t("pluginsview.Reset")}
                    </Button>
                    <Button
                      variant={saveSuccess ? "default" : "secondary"}
                      size="sm"
                      className={`h-8 px-5 text-[12px] font-bold tracking-wide transition-all ${
                        saveSuccess
                          ? "bg-ok text-ok-fg hover:bg-ok/90"
                          : "bg-accent text-accent-fg hover:bg-accent/90 shadow-lg shadow-accent/20"
                      }`}
                      onClick={() => handleConfigSave(p.id)}
                      disabled={isSaving}
                    >
                      {isSaving
                        ? "Saving..."
                        : saveSuccess
                          ? "\u2713 Saved"
                          : "Save Settings"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* Add from directory modal */}
      {addDirOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6 duration-200 animate-in fade-in"
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
          <div className="w-full max-w-md border border-border/50 bg-card/90 backdrop-blur-xl p-6 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="font-bold text-base tracking-wide text-txt">
                {t("pluginsview.AddPlugin1")}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted hover:bg-white/10 hover:text-txt rounded-full transition-all shrink-0 ml-2"
                onClick={() => {
                  setAddDirOpen(false);
                  setAddDirPath("");
                }}
              >
                ✕
              </Button>
            </div>

            <p className="text-sm font-medium tracking-wide text-muted mb-4">
              {t("pluginsview.EnterThePathToA")}
            </p>

            <Input
              type="text"
              className="w-full h-10 px-3 border border-border/40 bg-black/20 text-txt text-[13px] font-mono transition-all duration-150 focus-visible:ring-accent rounded-xl shadow-inner placeholder:text-muted/50"
              placeholder={t("pluginsview.PathToPluginOrP")}
              value={addDirPath}
              onChange={(e) => setAddDirPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddFromDirectory();
              }}
            />

            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-4 text-[12px] font-bold text-muted hover:text-txt transition-all"
                onClick={() => {
                  setAddDirOpen(false);
                  setAddDirPath("");
                }}
              >
                {t("pluginsview.Cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-8 px-6 text-[12px] font-bold tracking-wide shadow-sm"
                onClick={handleAddFromDirectory}
                disabled={addDirLoading || !addDirPath.trim()}
              >
                {addDirLoading ? "Adding..." : "Add"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Exported views ────────────────────────────────────────────────── */

/** Unified plugins view — tag-filtered plugin list. */
export function PluginsView({
  mode = "all",
  inModal,
}: {
  mode?: PluginsViewMode;
  inModal?: boolean;
}) {
  return (
    <PluginListView
      label={mode === "connectors" ? "Connectors" : "Plugins"}
      mode={mode}
      inModal={inModal}
    />
  );
}
