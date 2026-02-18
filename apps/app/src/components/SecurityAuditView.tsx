import { useCallback, useEffect, useMemo, useState } from "react";
import {
  client,
  type SecurityAuditEntry,
  type SecurityAuditEventType,
  type SecurityAuditFilter,
  type SecurityAuditSeverity,
} from "../api-client";
import { formatDateTime } from "./shared/format";

const EVENT_TYPES: SecurityAuditEventType[] = [
  "sandbox_mode_transition",
  "secret_token_replacement_outbound",
  "secret_sanitization_inbound",
  "privileged_capability_invocation",
  "policy_decision",
  "signing_request_submitted",
  "signing_request_rejected",
  "signing_request_approved",
  "plugin_fallback_attempt",
  "security_kill_switch",
  "sandbox_lifecycle",
  "fetch_proxy_error",
];

const SEVERITIES: SecurityAuditSeverity[] = ["info", "warn", "error", "critical"];

const DEFAULT_LIMIT = 200;
const MIN_LIMIT = 1;
const MAX_LIMIT = 1000;

function clampLimit(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  if (parsed < MIN_LIMIT) return MIN_LIMIT;
  if (parsed > MAX_LIMIT) return MAX_LIMIT;
  return parsed;
}

function severityBadgeClass(severity: SecurityAuditSeverity): string {
  switch (severity) {
    case "critical":
      return "bg-danger/15 text-danger border border-danger/40";
    case "error":
      return "bg-danger/10 text-danger border border-danger/30";
    case "warn":
      return "bg-warn/10 text-warn border border-warn/30";
    case "info":
    default:
      return "bg-accent-subtle text-accent border border-accent/30";
  }
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Request failed";
}

export function SecurityAuditView() {
  const [entries, setEntries] = useState<SecurityAuditEntry[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [sinceFilter, setSinceFilter] = useState("");
  const [limitFilter, setLimitFilter] = useState(String(DEFAULT_LIMIT));
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentLimit = useMemo(() => clampLimit(limitFilter), [limitFilter]);

  const buildFilter = useCallback((): SecurityAuditFilter => {
    const nextFilter: SecurityAuditFilter = {
      limit: currentLimit,
    };

    const type = typeFilter.trim();
    if (type) {
      nextFilter.type = type as SecurityAuditEventType;
    }

    const severity = severityFilter.trim();
    if (severity) {
      nextFilter.severity = severity as SecurityAuditSeverity;
    }

    const since = sinceFilter.trim();
    if (since) {
      const numeric = Number(since);
      nextFilter.since = Number.isFinite(numeric) ? numeric : since;
    }

    return nextFilter;
  }, [currentLimit, typeFilter, severityFilter, sinceFilter]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getSecurityAudit(buildFilter());
      setEntries(data.entries);
      setError(null);
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [buildFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!live) return;

    const controller = new AbortController();
    const filter = buildFilter();

    void client
      .streamSecurityAudit(
        (event) => {
          if (event.type === "snapshot") {
            setEntries(event.entries);
            return;
          }

          setEntries((prev) => [...prev, event.entry].slice(-currentLimit));
        },
        filter,
        controller.signal,
      )
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(`Live stream failed: ${formatErrorMessage(err)}`);
        setLive(false);
      });

    return () => {
      controller.abort();
    };
  }, [live, buildFilter, currentLimit]);

  const hasFilters =
    typeFilter.trim() !== "" ||
    severityFilter.trim() !== "" ||
    sinceFilter.trim() !== "" ||
    currentLimit !== DEFAULT_LIMIT;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          className="text-xs px-3 py-1.5 border border-border bg-card text-txt cursor-pointer"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          aria-label="Filter by event type"
        >
          <option value="">All types</option>
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <select
          className="text-xs px-3 py-1.5 border border-border bg-card text-txt cursor-pointer"
          value={severityFilter}
          onChange={(event) => setSeverityFilter(event.target.value)}
          aria-label="Filter by severity"
        >
          <option value="">All severities</option>
          {SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>

        <input
          type="text"
          className="text-xs px-3 py-1.5 border border-border bg-card text-txt min-w-56"
          placeholder="Since (epoch ms or ISO)"
          value={sinceFilter}
          onChange={(event) => setSinceFilter(event.target.value)}
          aria-label="Since timestamp"
        />

        <input
          type="number"
          min={MIN_LIMIT}
          max={MAX_LIMIT}
          className="text-xs px-3 py-1.5 border border-border bg-card text-txt w-24"
          value={limitFilter}
          onChange={(event) => setLimitFilter(event.target.value)}
          aria-label="Limit"
        />

        {hasFilters && (
          <button
            type="button"
            className="text-xs px-3 py-1.5 border border-border bg-card text-txt cursor-pointer hover:border-accent hover:text-accent"
            onClick={() => {
              setTypeFilter("");
              setSeverityFilter("");
              setSinceFilter("");
              setLimitFilter(String(DEFAULT_LIMIT));
            }}
          >
            Clear filters
          </button>
        )}

        <button
          type="button"
          className="text-xs px-3 py-1.5 border border-border bg-card text-txt cursor-pointer hover:border-accent hover:text-accent"
          onClick={() => void refresh()}
        >
          Refresh
        </button>

        <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={live}
            onChange={(event) => setLive(event.target.checked)}
          />
          Live
        </label>
      </div>

      {error && (
        <div className="text-xs text-danger border border-danger/30 bg-danger/10 px-3 py-2 mb-3">
          {error}
        </div>
      )}

      <div className="font-mono text-xs flex-1 min-h-0 overflow-y-auto border border-border p-2 bg-card">
        {loading && !live ? (
          <div className="text-center py-8 text-muted">Loading audit entries...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-muted">No audit entries found.</div>
        ) : (
          entries.map((entry, index) => (
            <article
              key={`${entry.timestamp}-${entry.type}-${entry.summary}-${index}`}
              className="border border-border bg-bg/40 p-3 mb-2"
            >
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-muted">{formatDateTime(entry.timestamp)}</span>
                <span
                  className={`inline-flex px-2 py-[2px] text-[10px] uppercase tracking-wide ${severityBadgeClass(entry.severity)}`}
                >
                  {entry.severity}
                </span>
                <span className="text-muted">{entry.type}</span>
              </div>

              <p className="text-[12px] text-txt break-words">{entry.summary}</p>

              {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-muted hover:text-txt">
                    Metadata
                  </summary>
                  <pre className="mt-2 p-2 bg-bg border border-border overflow-x-auto text-[11px] leading-relaxed">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                </details>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
