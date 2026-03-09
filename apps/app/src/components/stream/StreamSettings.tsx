/**
 * StreamSettings — in-stream settings panel.
 *
 * Panels:
 *   1. Channel / destination picker
 *   2. Overlay widget manager (enable/disable + per-widget config)
 *   3. Stream source selector (stream-tab, game, custom-url)
 */

import { useState } from "react";
import type { StreamSourceType } from "./helpers";
import { isSupportedStreamUrl, STREAM_SOURCE_LABELS } from "./helpers";
import { getAllWidgets } from "./overlays/registry";
import type { WidgetConfigField, WidgetInstance } from "./overlays/types";
import type { UseOverlayLayout } from "./overlays/useOverlayLayout";

type Section = "channel" | "overlays" | "source";

interface StreamSettingsProps {
  destinations: Array<{ id: string; name: string }>;
  activeDestination: { id: string; name: string } | null;
  onDestinationChange: (id: string) => void;
  streamLive: boolean;
  streamSource: { type: StreamSourceType; url?: string };
  activeGameViewerUrl: string;
  onSourceChange: (sourceType: StreamSourceType, customUrl?: string) => void;
  overlayLayout: UseOverlayLayout;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Config field renderer
// ---------------------------------------------------------------------------

function ConfigField({
  fieldKey,
  field,
  value,
  onChange,
}: {
  fieldKey: string;
  field: WidgetConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  switch (field.type) {
    case "boolean":
      return (
        <label
          key={fieldKey}
          className="flex items-center gap-2 text-[12px] text-txt"
        >
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(fieldKey, e.target.checked)}
            className="accent-[var(--accent)]"
          />
          {field.label}
        </label>
      );
    case "number":
      return (
        <label key={fieldKey} className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted">{field.label}</span>
          <input
            type="number"
            min={field.min}
            max={field.max}
            value={
              typeof value === "number" ? value : (field.default as number)
            }
            onChange={(e) => onChange(fieldKey, Number(e.target.value))}
            className="bg-bg-muted border border-border text-txt text-[12px] rounded px-2 py-1 outline-none focus:border-accent w-full"
          />
        </label>
      );
    case "select":
      return (
        <label key={fieldKey} className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted">{field.label}</span>
          <select
            value={typeof value === "string" ? value : String(field.default)}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            className="bg-bg-muted border border-border text-txt text-[12px] rounded px-2 py-1 cursor-pointer"
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "color":
      return (
        <label key={fieldKey} className="flex items-center gap-2">
          <span className="text-[11px] text-muted">{field.label}</span>
          <input
            type="color"
            value={typeof value === "string" ? value : String(field.default)}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            className="w-8 h-6 rounded border border-border cursor-pointer bg-transparent"
          />
        </label>
      );
    default:
      return (
        <label key={fieldKey} className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted">{field.label}</span>
          <input
            type="text"
            value={
              typeof value === "string" ? value : String(field.default ?? "")
            }
            onChange={(e) => onChange(fieldKey, e.target.value)}
            className="bg-bg-muted border border-border text-txt text-[12px] rounded px-2 py-1 outline-none focus:border-accent w-full"
          />
        </label>
      );
  }
}

// ---------------------------------------------------------------------------
// Widget row
// ---------------------------------------------------------------------------

function WidgetRow({
  instance,
  onToggle,
  onUpdate,
}: {
  instance: WidgetInstance;
  onToggle: () => void;
  onUpdate: (patch: Partial<Pick<WidgetInstance, "config">>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const def = getAllWidgets().find((d) => d.type === instance.type);
  const hasConfig = def && Object.keys(def.configSchema).length > 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-[rgba(255,255,255,0.03)]">
        {/* Toggle */}
        <button
          type="button"
          onClick={onToggle}
          className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
            instance.enabled
              ? "bg-[var(--accent)]"
              : "bg-[rgba(255,255,255,0.12)]"
          }`}
          title={instance.enabled ? "Disable widget" : "Enable widget"}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
              instance.enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>

        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-txt truncate">
            {def?.name ?? instance.type}
          </div>
          {def?.description && (
            <div className="text-[10px] text-muted truncate">
              {def.description}
            </div>
          )}
        </div>

        {hasConfig && (
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            className="text-muted hover:text-txt text-[10px] px-1.5 py-0.5 rounded bg-bg-muted cursor-pointer"
          >
            {expanded ? "▲ config" : "▼ config"}
          </button>
        )}
      </div>

      {expanded && hasConfig && def && (
        <div className="px-3 py-2 border-t border-border flex flex-col gap-2">
          {Object.entries(def.configSchema).map(([key, field]) => (
            <ConfigField
              key={key}
              fieldKey={key}
              field={field}
              value={instance.config[key] ?? field.default}
              onChange={(k, v) =>
                onUpdate({ config: { ...instance.config, [k]: v } })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function StreamSettings({
  destinations,
  activeDestination,
  onDestinationChange,
  streamLive,
  streamSource,
  activeGameViewerUrl,
  onSourceChange,
  overlayLayout,
  onClose,
}: StreamSettingsProps) {
  const [section, setSection] = useState<Section>("channel");
  const [customUrlInput, setCustomUrlInput] = useState(
    streamSource.type === "custom-url" ? (streamSource.url ?? "") : "",
  );
  const trimmedCustomUrl = customUrlInput.trim();
  const customUrlValid = isSupportedStreamUrl(trimmedCustomUrl);

  const { layout, toggleWidget, updateWidget, resetLayout } = overlayLayout;

  const navBtn = (id: Section, label: string) => (
    <button
      type="button"
      onClick={() => setSection(id)}
      className={`px-3 py-1.5 text-[12px] font-medium rounded transition-colors cursor-pointer ${
        section === id
          ? "bg-[var(--accent)]/20 text-[var(--accent)]"
          : "text-muted hover:text-txt hover:bg-bg-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-xl rounded-t-2xl border border-border overflow-hidden flex flex-col"
        style={{ background: "rgba(14,18,28,0.97)", maxHeight: "80vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <span className="text-[13px] font-semibold text-txt">
            Stream Settings
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-txt transition-colors cursor-pointer text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Nav */}
        <div className="flex gap-1 px-4 py-2 border-b border-border flex-shrink-0">
          {navBtn("channel", "Channel")}
          {navBtn("overlays", "Overlays")}
          {navBtn("source", "Source")}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-4 py-4">
          {/* ── Channel / destination ─────────────────────────────── */}
          {section === "channel" && (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-muted">
                Select where to broadcast. To switch channels, stop the stream
                first.
              </p>

              {destinations.length === 0 ? (
                <div className="text-[12px] text-muted border border-border rounded-lg p-4 text-center">
                  No streaming destinations configured.
                  <br />
                  Install a streaming plugin (Twitch, YouTube, Retake.tv, Custom
                  RTMP) via the Plugins tab.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {destinations.map((d) => {
                    const active = d.id === activeDestination?.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        disabled={streamLive}
                        title={
                          streamLive
                            ? "Stop stream to change channel"
                            : undefined
                        }
                        onClick={() => onDestinationChange(d.id)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left ${
                          active
                            ? "border-[var(--accent)]/60 bg-[var(--accent)]/10"
                            : "border-border bg-[rgba(255,255,255,0.03)] hover:border-[var(--accent)]/30 hover:bg-[rgba(255,255,255,0.05)]"
                        }`}
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            active
                              ? "bg-[var(--accent)] shadow-[0_0_6px_var(--accent)]"
                              : "bg-muted/30"
                          }`}
                        />
                        <span
                          className={`text-[13px] font-medium ${active ? "text-[var(--accent)]" : "text-txt"}`}
                        >
                          {d.name}
                        </span>
                        {active && (
                          <span className="ml-auto text-[10px] text-[var(--accent)] font-semibold uppercase tracking-wide">
                            Active
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {streamLive && (
                <p className="text-[11px] text-[#f59e0b] border border-[#f59e0b]/30 rounded px-3 py-1.5 bg-[#f59e0b]/5">
                  ⚠ Stream is live. Stop the stream to switch channels.
                </p>
              )}
            </div>
          )}

          {/* ── Overlay widgets ────────────────────────────────────── */}
          {section === "overlays" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-muted">
                  Toggle and configure widgets shown on top of your stream.
                </p>
                <button
                  type="button"
                  onClick={resetLayout}
                  className="text-[11px] text-muted hover:text-danger transition-colors cursor-pointer"
                >
                  Reset defaults
                </button>
              </div>

              {layout.widgets.length === 0 ? (
                <div className="text-[12px] text-muted border border-border rounded-lg p-4 text-center">
                  No widgets available. Reload the stream tab.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {layout.widgets.map((instance) => (
                    <WidgetRow
                      key={instance.id}
                      instance={instance}
                      onToggle={() => toggleWidget(instance.id)}
                      onUpdate={(patch) => updateWidget(instance.id, patch)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Stream source ──────────────────────────────────────── */}
          {section === "source" && (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-muted">
                Choose what content is captured and broadcast.
              </p>

              {(["stream-tab", "game", "custom-url"] as StreamSourceType[]).map(
                (st) => {
                  const isGame = st === "game";
                  const disabled = isGame && !activeGameViewerUrl.trim();
                  const active = streamSource.type === st;

                  return (
                    <div key={st}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (st !== "custom-url") {
                            onSourceChange(
                              st,
                              isGame ? activeGameViewerUrl : undefined,
                            );
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-left ${
                          active && st !== "custom-url"
                            ? "border-[var(--accent)]/60 bg-[var(--accent)]/10"
                            : "border-border bg-[rgba(255,255,255,0.03)] hover:border-[var(--accent)]/30 hover:bg-[rgba(255,255,255,0.05)]"
                        }`}
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            active && st !== "custom-url"
                              ? "bg-[var(--accent)]"
                              : "bg-muted/30"
                          }`}
                        />
                        <div>
                          <div
                            className={`text-[13px] font-medium ${active && st !== "custom-url" ? "text-[var(--accent)]" : "text-txt"}`}
                          >
                            {STREAM_SOURCE_LABELS[st]}
                          </div>
                          <div className="text-[10px] text-muted">
                            {st === "stream-tab" &&
                              "Capture the stream browser tab (default)"}
                            {st === "game" &&
                              (activeGameViewerUrl.trim()
                                ? `Active game: ${activeGameViewerUrl}`
                                : "No game active")}
                            {st === "custom-url" &&
                              "Broadcast from a custom HTTP(S) URL"}
                          </div>
                        </div>
                      </button>

                      {st === "custom-url" && (
                        <div
                          className={`mt-1 flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                            active
                              ? "border-[var(--accent)]/60 bg-[var(--accent)]/10"
                              : "border-border bg-[rgba(255,255,255,0.03)]"
                          }`}
                        >
                          <input
                            type="text"
                            placeholder="https://your-url.com"
                            value={customUrlInput}
                            onChange={(e) => setCustomUrlInput(e.target.value)}
                            className="flex-1 bg-transparent text-txt text-[12px] outline-none placeholder:text-muted/40"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && customUrlValid) {
                                onSourceChange("custom-url", trimmedCustomUrl);
                              }
                            }}
                          />
                          <button
                            type="button"
                            disabled={!customUrlValid}
                            onClick={() => {
                              if (customUrlValid) {
                                onSourceChange("custom-url", trimmedCustomUrl);
                              }
                            }}
                            className="px-2 py-1 rounded bg-[var(--accent)]/20 text-[var(--accent)] text-[11px] font-semibold hover:bg-[var(--accent)]/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Use
                          </button>
                        </div>
                      )}
                      {st === "custom-url" &&
                        trimmedCustomUrl &&
                        !customUrlValid && (
                          <p className="mt-1 px-1 text-[10px] text-danger">
                            Custom URLs must start with `http://` or `https://`.
                          </p>
                        )}
                    </div>
                  );
                },
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
