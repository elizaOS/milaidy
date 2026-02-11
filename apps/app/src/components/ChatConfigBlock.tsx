/**
 * ChatConfigBlock — Inline config form rendered inside chat messages.
 *
 * Part of the A2UI (Agent-to-UI) system. When the agent responds with a
 * config-form content block, this component renders an interactive
 * ConfigRenderer inline in the chat bubble.
 *
 * The user can fill in fields and save, which calls the config API.
 */

import { useState, useCallback } from "react";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import type { ConfigFormBlock } from "../api-client";
import { client } from "../api-client";
import type { ConfigUiHint } from "../types";
import type { JsonSchemaObject } from "./config-catalog";

export interface ChatConfigBlockProps {
  block: ConfigFormBlock;
}

export function ChatConfigBlock({ block }: ChatConfigBlockProps) {
  const [values, setValues] = useState<Record<string, unknown>>(
    () => block.values ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const schema = block.schema as unknown as JsonSchemaObject | null;
  const hints = (block.hints ?? {}) as Record<string, ConfigUiHint>;

  const setKeys = new Set(
    Object.entries(values)
      .filter(([, v]) => v != null && v !== "")
      .map(([k]) => k),
  );

  const handleChange = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      // Build a flat config patch keyed by plugin param names
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v != null && v !== "") {
          patch[k] = v;
        }
      }
      await client.updateConfig(patch);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save configuration.");
    } finally {
      setSaving(false);
    }
  }, [values]);

  if (dismissed) {
    return (
      <div className="text-xs text-muted italic py-1">
        Configuration dismissed.
      </div>
    );
  }

  return (
    <div className="mt-2 border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-bg-hover border-b border-border">
        <div className="flex items-center gap-2 text-xs font-bold text-txt">
          <span className="text-[13px] opacity-60">{"\u2699\uFE0F"}</span>
          <span>{block.pluginName ?? block.pluginId} Configuration</span>
        </div>
        <button
          className="text-[10px] text-muted hover:text-txt cursor-pointer"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </button>
      </div>

      {/* Config form */}
      <div className="p-3">
        {schema ? (
          <ConfigRenderer
            schema={schema}
            hints={hints}
            values={values}
            setKeys={setKeys}
            registry={defaultRegistry}
            pluginId={block.pluginId}
            onChange={handleChange}
          />
        ) : (
          <div className="text-xs text-muted italic">
            No configuration schema available.
          </div>
        )}
      </div>

      {/* Footer: Save + status */}
      {schema && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
          <button
            className="px-4 py-1.5 text-xs border border-accent bg-accent text-accent-fg cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={saving || setKeys.size === 0}
          >
            {saving ? "Saving..." : "Save Configuration"}
          </button>
          {saved && (
            <span className="text-xs text-ok">Saved</span>
          )}
          {error && (
            <span className="text-xs text-danger">{error}</span>
          )}
        </div>
      )}
    </div>
  );
}
