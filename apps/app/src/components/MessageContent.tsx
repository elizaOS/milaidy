/**
 * MessageContent — Renders a chat message's content.
 *
 * Follows the json-render pattern: specs are rendered client-side from JSON
 * in the agent's text response. No server-side block extraction needed.
 *
 * Client-side detection:
 *   1. [CONFIG:pluginId] markers → inline plugin config form (ConfigRenderer)
 *   2. Fenced UiSpec JSON → interactive UI (UiRenderer)
 *   3. Everything else → plain text
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { ConversationMessage, PluginInfo } from "../api-client";
import { client } from "../api-client";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import { paramsToSchema } from "./PluginsView";
import type { ConfigUiHint } from "../types";
import type { JsonSchemaObject } from "./config-catalog";

import { useApp } from "../AppContext";
import { UiRenderer } from "./ui-renderer";
import type { UiSpec } from "./ui-spec";

/** Reject prototype-pollution plugin IDs that could slip through the regex. */
const BLOCKED_IDS = new Set(["__proto__", "constructor", "prototype"]);

export interface MessageContentProps {
  message: ConversationMessage;
}

// ── Segment types ───────────────────────────────────────────────────

type Segment =
  | { kind: "text"; text: string }
  | { kind: "config"; pluginId: string }
  | { kind: "ui-spec"; spec: UiSpec; raw: string };

// ── Detection ───────────────────────────────────────────────────────

const CONFIG_RE = /\[CONFIG:(\w[\w-]*)\]/g;
const FENCED_JSON_RE = /```(?:json)?\s*\n([\s\S]*?)```/g;

function tryParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

function isUiSpec(obj: unknown): obj is UiSpec {
  if (!obj || typeof obj !== "object") return false;
  const c = obj as Record<string, unknown>;
  return typeof c.root === "string" && typeof c.elements === "object" && c.elements !== null;
}

/**
 * Parse message text for [CONFIG:id] markers and fenced UiSpec JSON.
 * Returns an array of segments for rendering.
 */
function parseSegments(text: string): Segment[] {
  // Build a unified list of match regions sorted by position
  const regions: Array<{ start: number; end: number; segment: Segment }> = [];

  // 1. Find [CONFIG:pluginId] markers
  CONFIG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CONFIG_RE.exec(text)) !== null) {
    regions.push({
      start: m.index,
      end: m.index + m[0].length,
      segment: { kind: "config", pluginId: m[1] },
    });
  }

  // 2. Find fenced JSON that is a UiSpec
  FENCED_JSON_RE.lastIndex = 0;
  while ((m = FENCED_JSON_RE.exec(text)) !== null) {
    const json = m[1].trim();
    const parsed = tryParse(json);
    if (parsed && isUiSpec(parsed)) {
      regions.push({
        start: m.index,
        end: m.index + m[0].length,
        segment: { kind: "ui-spec", spec: parsed, raw: json },
      });
    }
  }

  // No special content found — return plain text
  if (regions.length === 0) {
    return [{ kind: "text", text }];
  }

  // Sort by start position, then interleave with text segments
  regions.sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = 0;

  for (const r of regions) {
    // Skip overlapping regions
    if (r.start < cursor) continue;

    // Push preceding text
    if (r.start > cursor) {
      const t = text.slice(cursor, r.start);
      if (t.trim()) segments.push({ kind: "text", text: t });
    }
    segments.push(r.segment);
    cursor = r.end;
  }

  // Trailing text
  if (cursor < text.length) {
    const t = text.slice(cursor);
    if (t.trim()) segments.push({ kind: "text", text: t });
  }

  return segments;
}

// ── InlinePluginConfig ──────────────────────────────────────────────

function InlinePluginConfig({ pluginId }: { pluginId: string }) {
  const [plugin, setPlugin] = useState<PluginInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const mountedRef = useRef(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setActionNotice, loadPlugins } = useApp();

  // Track mount state — reset to true on each mount (needed for StrictMode
  // which unmounts/remounts and would leave the ref false otherwise).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // Self-contained: fetch plugin data directly from API
  const fetchPlugin = useCallback(async () => {
    try {
      const { plugins } = await client.getPlugins();
      if (!mountedRef.current) return;
      const found = plugins.find((p) => p.id === pluginId);
      setPlugin(found ?? null);
    } catch {
      if (mountedRef.current) setError("Failed to load plugin info.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [pluginId]);

  useEffect(() => { void fetchPlugin(); }, [fetchPlugin]);

  // Build schema + hints — keyed on plugin.id to avoid recomputing on
  // every fetch (the PluginInfo object is a new reference each time).
  const pluginParams = plugin?.parameters;
  const pluginHints = plugin?.configUiHints;
  const pluginIdResolved = plugin?.id;
  const { schema, hints } = useMemo(() => {
    if (!pluginParams || pluginParams.length === 0 || !pluginIdResolved) {
      return { schema: null, hints: {} as Record<string, ConfigUiHint> };
    }
    const auto = paramsToSchema(pluginParams, pluginIdResolved);
    if (pluginHints) {
      for (const [key, serverHint] of Object.entries(pluginHints)) {
        auto.hints[key] = { ...auto.hints[key], ...serverHint };
      }
    }
    return auto;
  }, [pluginParams, pluginHints, pluginIdResolved]);

  // Initialize values from current server values
  const initialValues = useMemo(() => {
    if (!pluginParams) return {};
    const v: Record<string, unknown> = {};
    for (const p of pluginParams) {
      if (p.isSet && !p.sensitive && p.currentValue != null) {
        v[p.key] = p.currentValue;
      }
    }
    return v;
  }, [pluginParams]);

  const mergedValues = useMemo(() => ({ ...initialValues, ...values }), [initialValues, values]);

  const setKeys = useMemo(() => {
    const s = new Set<string>();
    if (pluginParams) {
      for (const p of pluginParams) {
        if (p.isSet) s.add(p.key);
      }
    }
    for (const [k, v] of Object.entries(values)) {
      if (v != null && v !== "") s.add(k);
    }
    return s;
  }, [pluginParams, values]);

  const handleChange = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v != null && v !== "") patch[k] = String(v);
      }
      await client.updatePlugin(pluginId, { config: patch });
      if (mountedRef.current) setSaved(true);
      await fetchPlugin();
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [pluginId, values, fetchPlugin]);

  const handleToggle = useCallback(async (enable: boolean) => {
    setEnabling(true);
    setError(null);
    try {
      // Save pending config first, then toggle — same as the Plugins page
      if (enable) {
        const patch: Record<string, string> = {};
        for (const [k, v] of Object.entries(values)) {
          if (v != null && v !== "") patch[k] = String(v);
        }
        if (Object.keys(patch).length > 0) {
          await client.updatePlugin(pluginId, { config: patch });
        }
      }
      // Exact same call as the ON button in PluginsView
      await client.updatePlugin(pluginId, { enabled: enable });
      // Refresh shared plugin state so Plugins page shows updated status
      await loadPlugins();
      if (enable && mountedRef.current) {
        const tabLabel =
          plugin?.category === "feature" ? "Plugins > Features"
          : plugin?.category === "connector" ? "Plugins > Connectors"
          : "Plugins > System";
        setActionNotice(`${plugin?.name ?? pluginId} enabled! Find it in ${tabLabel}.`, "success", 4000);
        setDismissed(true);
      }
      // Wait for agent restart then refresh (with cleanup on unmount)
      refreshTimerRef.current = setTimeout(() => void fetchPlugin(), 3000);
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : `Failed to ${enable ? "enable" : "disable"} plugin.`);
      }
    } finally {
      if (mountedRef.current) setEnabling(false);
    }
  }, [pluginId, plugin, values, fetchPlugin, loadPlugins, setActionNotice]);

  if (dismissed) {
    return (
      <div className="my-2 px-3 py-2 border border-ok/30 bg-ok/5 text-xs text-ok">
        {plugin?.name ?? pluginId} — enabled
      </div>
    );
  }

  if (loading) {
    return (
      <div className="my-2 px-3 py-2 border border-border bg-card text-xs text-muted italic">
        Loading {pluginId} configuration...
      </div>
    );
  }

  if (!plugin) {
    return (
      <div className="my-2 px-3 py-2 border border-border bg-card text-xs text-muted italic">
        Plugin "{pluginId}" not found.
      </div>
    );
  }

  const isEnabled = plugin.enabled;

  return (
    <div className="my-2 border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-bg-hover border-b border-border">
        <div className="flex items-center gap-2 text-xs font-bold text-txt">
          {plugin.icon ? (
            <span className="text-[13px]">{plugin.icon}</span>
          ) : (
            <span className="text-[13px] opacity-60">{"\u2699\uFE0F"}</span>
          )}
          <span>{plugin.name} Configuration</span>
        </div>
        <div className="flex items-center gap-2">
          {plugin.configured && (
            <span className="text-[10px] text-ok font-medium">Configured</span>
          )}
          <span className={`text-[10px] font-medium ${isEnabled ? "text-ok" : "text-muted"}`}>
            {isEnabled ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* Form — always shown so user can configure before enabling */}
      {schema && plugin.parameters.length > 0 ? (
        <div className="p-3">
          <ConfigRenderer
            schema={schema as JsonSchemaObject}
            hints={hints}
            values={mergedValues}
            setKeys={setKeys}
            registry={defaultRegistry}
            pluginId={plugin.id}
            onChange={handleChange}
          />
        </div>
      ) : (
        <div className="px-3 py-2 text-xs text-muted italic">
          No configurable parameters.
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border flex-wrap">
        {schema && plugin.parameters.length > 0 && (
          <button
            className="px-4 py-1.5 text-xs border border-accent bg-accent text-accent-fg cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={saving || enabling || Object.keys(values).length === 0}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}

        {!isEnabled ? (
          <button
            className="px-4 py-1.5 text-xs border border-ok bg-ok/10 text-ok cursor-pointer hover:bg-ok/20 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => void handleToggle(true)}
            disabled={enabling || saving}
          >
            {enabling ? "Enabling..." : "Enable Plugin"}
          </button>
        ) : (
          <button
            className="px-4 py-1.5 text-xs border border-border text-muted cursor-pointer hover:border-danger hover:text-danger disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => void handleToggle(false)}
            disabled={enabling || saving}
          >
            {enabling ? "Disabling..." : "Disable"}
          </button>
        )}

        {saved && <span className="text-xs text-ok">Saved</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}

// ── UiSpec block ────────────────────────────────────────────────────

function UiSpecBlock({ spec, raw }: { spec: UiSpec; raw: string }) {
  const [showRaw, setShowRaw] = useState(false);

  // Actions from UiSpec elements — currently a no-op.
  // TODO(#35): Wire to chat API for server-round-trip actions.
  const handleAction = useCallback(
    (_action: string, _params?: Record<string, unknown>) => {},
    [],
  );

  return (
    <div className="my-2 border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-hover border-b border-border">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
          Interactive UI
        </span>
        <button
          type="button"
          className="text-[10px] text-accent cursor-pointer hover:underline"
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? "Hide JSON" : "View JSON"}
        </button>
      </div>
      {showRaw && (
        <div className="px-3 py-2 bg-card border-b border-border overflow-x-auto">
          <pre className="text-[10px] text-muted font-mono whitespace-pre-wrap break-words m-0">
            {raw}
          </pre>
        </div>
      )}
      <div className="p-3">
        <UiRenderer spec={spec} onAction={handleAction} />
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export function MessageContent({ message }: MessageContentProps) {
  // Parse segments — memoize to avoid re-parsing on every render
  const segments = useMemo(() => {
    try {
      return parseSegments(message.text);
    } catch {
      // If parsing fails, just show plain text
      return [{ kind: "text" as const, text: message.text }];
    }
  }, [message.text]);

  // Fast path: single plain-text segment (most messages)
  if (segments.length === 1 && segments[0].kind === "text") {
    return <div className="text-txt whitespace-pre-wrap">{message.text}</div>;
  }

  return (
    <div>
      {segments.map((seg, i) => {
        switch (seg.kind) {
          case "text":
            return (
              <div key={i} className="text-txt whitespace-pre-wrap">
                {seg.text}
              </div>
            );
          case "config":
            if (BLOCKED_IDS.has(seg.pluginId)) return null;
            return <InlinePluginConfig key={i} pluginId={seg.pluginId} />;
          case "ui-spec":
            return <UiSpecBlock key={i} spec={seg.spec} raw={seg.raw} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
