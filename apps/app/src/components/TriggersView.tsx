import { useEffect, useMemo, useState } from "react";
import { parsePositiveInteger } from "../../../../src/utils/number-parsing";
import { useApp } from "../AppContext";
import type {
  CreateTriggerRequest,
  TriggerSummary,
  UpdateTriggerRequest,
} from "../api-client";
import { formatDateTime, formatDurationMs } from "./shared/format";
import { StatCard, StatusBadge, StatusDot } from "./shared/ui-badges";

type TriggerType = "interval" | "once" | "cron";
type TriggerWakeMode = "inject_now" | "next_autonomy_cycle";

interface TriggerFormState {
  displayName: string;
  instructions: string;
  triggerType: TriggerType;
  wakeMode: TriggerWakeMode;
  intervalMs: string;
  scheduledAtIso: string;
  cronExpression: string;
  maxRuns: string;
  enabled: boolean;
}

const emptyForm: TriggerFormState = {
  displayName: "",
  instructions: "",
  triggerType: "interval",
  wakeMode: "inject_now",
  intervalMs: "3600000",
  scheduledAtIso: "",
  cronExpression: "0 * * * *",
  maxRuns: "",
  enabled: true,
};

const accentFg: React.CSSProperties = { color: "var(--accent-foreground)" };

function scheduleLabel(t: TriggerSummary): string {
  if (t.triggerType === "interval")
    return `Every ${formatDurationMs(t.intervalMs)}`;
  if (t.triggerType === "once") {
    return t.scheduledAtIso
      ? `Once at ${formatDateTime(t.scheduledAtIso)}`
      : "Once";
  }
  if (t.triggerType === "cron") return `Cron: ${t.cronExpression ?? "—"}`;
  return t.triggerType;
}

function formFromTrigger(trigger: TriggerSummary): TriggerFormState {
  return {
    displayName: trigger.displayName,
    instructions: trigger.instructions,
    triggerType: trigger.triggerType,
    wakeMode: trigger.wakeMode,
    intervalMs: trigger.intervalMs ? String(trigger.intervalMs) : "3600000",
    scheduledAtIso: trigger.scheduledAtIso ?? "",
    cronExpression: trigger.cronExpression ?? "0 * * * *",
    maxRuns: trigger.maxRuns ? String(trigger.maxRuns) : "",
    enabled: trigger.enabled,
  };
}

function buildCreateRequest(form: TriggerFormState): CreateTriggerRequest {
  const intervalMs = parsePositiveInteger(form.intervalMs);
  const maxRuns = parsePositiveInteger(form.maxRuns);
  return {
    displayName: form.displayName.trim(),
    instructions: form.instructions.trim(),
    triggerType: form.triggerType,
    wakeMode: form.wakeMode,
    enabled: form.enabled,
    intervalMs: form.triggerType === "interval" ? intervalMs : undefined,
    scheduledAtIso:
      form.triggerType === "once" ? form.scheduledAtIso.trim() : undefined,
    cronExpression:
      form.triggerType === "cron" ? form.cronExpression.trim() : undefined,
    maxRuns,
  };
}

function buildUpdateRequest(form: TriggerFormState): UpdateTriggerRequest {
  const req = buildCreateRequest(form);
  return { ...req };
}

function validateForm(form: TriggerFormState): string | null {
  if (!form.displayName.trim()) return "Display name is required.";
  if (!form.instructions.trim()) return "Instructions are required.";
  if (
    form.triggerType === "interval" &&
    !parsePositiveInteger(form.intervalMs)
  ) {
    return "Interval must be a positive number in milliseconds.";
  }
  if (form.triggerType === "once") {
    const raw = form.scheduledAtIso.trim();
    if (!raw) return "Scheduled time is required for once triggers.";
    if (!Number.isFinite(Date.parse(raw)))
      return "Scheduled time must be a valid ISO date-time.";
  }
  if (form.triggerType === "cron") {
    const cronTrimmed = form.cronExpression.trim();
    if (!cronTrimmed) return "Cron expression is required.";
    const cronParts = cronTrimmed.split(/\s+/);
    if (cronParts.length !== 5)
      return "Cron expression must have exactly 5 fields (minute hour day month weekday).";
    const ranges = [
      { n: "minute" },
      { n: "hour" },
      { n: "day" },
      { n: "month" },
      { n: "weekday" },
    ];
    for (let i = 0; i < 5; i++) {
      if (!/^[\d,\-*/]+$/.test(cronParts[i]))
        return `Invalid cron ${ranges[i].n} field: "${cronParts[i]}"`;
    }
  }
  if (form.maxRuns.trim() && !parsePositiveInteger(form.maxRuns))
    return "Max runs must be a positive integer.";
  return null;
}

/* ── Main view ──────────────────────────────────────────────────── */

export function TriggersView() {
  const {
    triggers,
    triggersLoading,
    triggersSaving,
    triggerRunsById,
    triggerHealth,
    triggerError,
    loadTriggers,
    createTrigger,
    updateTrigger,
    deleteTrigger,
    runTriggerNow,
    loadTriggerRuns,
    loadTriggerHealth,
  } = useApp();

  const [form, setForm] = useState<TriggerFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedRunsId, setSelectedRunsId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedInstructions, setExpandedInstructions] = useState<Set<string>>(
    new Set(),
  );

  const selectedRuns = useMemo(() => {
    if (!selectedRunsId) return [];
    return triggerRunsById[selectedRunsId] ?? [];
  }, [selectedRunsId, triggerRunsById]);

  useEffect(() => {
    void loadTriggerHealth();
    void loadTriggers();
  }, [loadTriggerHealth, loadTriggers]);

  const clearForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
  };

  const onSubmit = async () => {
    const err = validateForm(form);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    if (editingId) {
      const updated = await updateTrigger(editingId, buildUpdateRequest(form));
      if (updated) setForm(formFromTrigger(updated));
      return;
    }
    const created = await createTrigger(buildCreateRequest(form));
    if (created) clearForm();
  };

  const setField = <K extends keyof TriggerFormState>(
    key: K,
    value: TriggerFormState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleInstructions = (id: string) => {
    setExpandedInstructions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <section className="border border-border bg-card p-4">
        <p className="text-xs text-muted">
          Triggers schedule autonomous instructions for the agent. Each trigger
          can run on an interval, a one-time timestamp, or a cron schedule; when
          it fires, the instruction is injected into autonomy and the run
          outcome is logged below.
        </p>
      </section>

      {/* ── Health stats ──────────────────────────────────────────── */}
      <section className="border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-bold">Trigger Health</h2>
          <button
            type="button"
            className="px-2.5 py-1 text-[11px] border border-accent bg-accent hover:bg-accent-hover cursor-pointer"
            style={accentFg}
            onClick={() => {
              void loadTriggerHealth();
              void loadTriggers();
            }}
          >
            Refresh
          </button>
        </div>
        {triggerHealth ? (
          <div className="flex gap-2 flex-wrap">
            <StatCard
              label="Active"
              value={triggerHealth.activeTriggers}
              accent
            />
            <StatCard label="Disabled" value={triggerHealth.disabledTriggers} />
            <StatCard
              label="Executions"
              value={triggerHealth.totalExecutions}
            />
            <StatCard label="Failures" value={triggerHealth.totalFailures} />
            <StatCard
              label="Last Exec"
              value={formatDateTime(triggerHealth.lastExecutionAt, {
                fallback: "—",
              })}
            />
          </div>
        ) : (
          <div className="text-xs text-muted py-2">
            No health data yet — triggers will report here after first
            execution.
          </div>
        )}
      </section>

      {/* ── Create / Edit form ────────────────────────────────────── */}
      <section className="border border-border bg-card p-4 px-5">
        <h2 className="text-sm font-bold mb-3">
          {editingId ? "Edit Trigger" : "New Trigger"}
        </h2>
        <div className="grid gap-3">
          <div>
            <span className="block text-[11px] text-muted mb-1">Name</span>
            <input
              className="w-full px-3 py-1.5 border border-border bg-bg text-sm focus:border-accent outline-none"
              value={form.displayName}
              onChange={(e) => setField("displayName", e.target.value)}
              placeholder="e.g. Daily Digest, Heartbeat Check"
            />
          </div>
          <div>
            <span className="block text-[11px] text-muted mb-1">
              Instructions
            </span>
            <textarea
              className="w-full px-3 py-1.5 border border-border bg-bg text-sm min-h-[80px] focus:border-accent outline-none resize-y"
              value={form.instructions}
              onChange={(e) => setField("instructions", e.target.value)}
              placeholder="What should the agent do when this trigger fires?"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <span className="block text-[11px] text-muted mb-1">
                Schedule Type
              </span>
              <select
                className="w-full px-3 py-1.5 border border-border bg-bg text-sm focus:border-accent outline-none"
                value={form.triggerType}
                onChange={(e) =>
                  setField("triggerType", e.target.value as TriggerType)
                }
              >
                <option value="interval">Repeating Interval</option>
                <option value="once">One-time</option>
                <option value="cron">Cron Schedule</option>
              </select>
            </div>
            <div>
              <span className="block text-[11px] text-muted mb-1">
                Wake Mode
              </span>
              <select
                className="w-full px-3 py-1.5 border border-border bg-bg text-sm focus:border-accent outline-none"
                value={form.wakeMode}
                onChange={(e) =>
                  setField("wakeMode", e.target.value as TriggerWakeMode)
                }
              >
                <option value="inject_now">
                  Inject &amp; wake immediately
                </option>
                <option value="next_autonomy_cycle">
                  Queue for next cycle
                </option>
              </select>
            </div>
            <div>
              <span className="block text-[11px] text-muted mb-1">
                Max Runs (optional)
              </span>
              <input
                className="w-full px-3 py-1.5 border border-border bg-bg text-sm focus:border-accent outline-none"
                value={form.maxRuns}
                onChange={(e) => setField("maxRuns", e.target.value)}
                placeholder="∞"
              />
            </div>
          </div>

          {form.triggerType === "interval" && (
            <div>
              <span className="block text-[11px] text-muted mb-1">
                Interval (ms) —{" "}
                {formatDurationMs(parsePositiveInteger(form.intervalMs))}
              </span>
              <input
                className="w-full px-3 py-1.5 border border-border bg-bg text-sm focus:border-accent outline-none"
                value={form.intervalMs}
                onChange={(e) => setField("intervalMs", e.target.value)}
                placeholder="3600000"
              />
            </div>
          )}
          {form.triggerType === "once" && (
            <div>
              <span className="block text-[11px] text-muted mb-1">
                Scheduled Time (ISO)
              </span>
              <input
                className="w-full px-3 py-1.5 border border-border bg-bg text-sm focus:border-accent outline-none"
                value={form.scheduledAtIso}
                onChange={(e) => setField("scheduledAtIso", e.target.value)}
                placeholder="2026-02-15T10:00:00.000Z"
              />
            </div>
          )}
          {form.triggerType === "cron" && (
            <div>
              <span className="block text-[11px] text-muted mb-1">
                Cron Expression (5-field)
              </span>
              <input
                className="w-full px-3 py-1.5 border border-border bg-bg text-sm font-mono focus:border-accent outline-none"
                value={form.cronExpression}
                onChange={(e) => setField("cronExpression", e.target.value)}
                placeholder="*/15 * * * *"
              />
              <div className="text-[10px] text-muted mt-1">
                minute hour day month weekday — e.g. "0 9 * * 1-5" = weekdays at
                9am
              </div>
            </div>
          )}

          <span className="inline-flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setField("enabled", e.target.checked)}
            />
            Start enabled
          </span>

          {(formError || triggerError) && (
            <div className="text-xs px-3 py-2 border border-danger/30 bg-danger/10 text-danger">
              {formError ?? triggerError}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="px-4 py-1.5 text-sm border border-accent bg-accent hover:bg-accent-hover disabled:opacity-40 cursor-pointer"
              style={accentFg}
              disabled={triggersSaving}
              onClick={() => {
                void onSubmit();
              }}
            >
              {triggersSaving
                ? "Saving…"
                : editingId
                  ? "Save Changes"
                  : "Create Trigger"}
            </button>
            {editingId && (
              <button
                type="button"
                className="px-4 py-1.5 text-sm border border-border hover:border-accent cursor-pointer"
                onClick={clearForm}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Trigger list ──────────────────────────────────────────── */}
      <section className="border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold">Triggers</h2>
          <span className="text-[11px] text-muted">
            {triggersLoading ? "Loading…" : `${triggers.length} configured`}
          </span>
        </div>

        {triggers.length === 0 && !triggersLoading ? (
          <div className="py-8 text-center">
            <div className="text-2xl mb-2">⏰</div>
            <div className="text-sm text-muted">No triggers configured yet</div>
            <div className="text-xs text-muted mt-1">
              Create one above to schedule autonomous agent tasks
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {triggers.map((trigger: TriggerSummary) => {
              const isExpanded = expandedInstructions.has(trigger.id);
              const instructionPreview =
                trigger.instructions.length > 120 && !isExpanded
                  ? `${trigger.instructions.slice(0, 120)}…`
                  : trigger.instructions;

              return (
                <div
                  key={trigger.id}
                  className="border border-border bg-bg p-4 space-y-2"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold truncate">
                          {trigger.displayName}
                        </span>
                        <StatusBadge
                          label={trigger.enabled ? "active" : "paused"}
                          tone={trigger.enabled ? "success" : "muted"}
                        />
                      </div>
                      <div className="text-xs text-muted mt-1">
                        {scheduleLabel(trigger)}
                        {trigger.runCount > 0 && (
                          <>
                            {" "}
                            · {trigger.runCount} run
                            {trigger.runCount !== 1 ? "s" : ""}
                          </>
                        )}
                        {trigger.nextRunAtMs && trigger.enabled && (
                          <>
                            {" "}
                            · next{" "}
                            {formatDateTime(trigger.nextRunAtMs, {
                              fallback: "—",
                            })}
                          </>
                        )}
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end">
                      <button
                        type="button"
                        className="px-2 py-1 text-[11px] border border-accent bg-accent hover:bg-accent-hover cursor-pointer"
                        style={accentFg}
                        onClick={() => {
                          setEditingId(trigger.id);
                          setForm(formFromTrigger(trigger));
                          setFormError(null);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-[11px] border border-border hover:border-accent cursor-pointer"
                        onClick={() => {
                          void updateTrigger(trigger.id, {
                            enabled: !trigger.enabled,
                          });
                        }}
                      >
                        {trigger.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-[11px] border border-border hover:border-accent cursor-pointer"
                        onClick={() => {
                          void runTriggerNow(trigger.id);
                        }}
                      >
                        Run now
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-[11px] border border-border hover:border-accent cursor-pointer"
                        onClick={() => {
                          if (selectedRunsId === trigger.id) {
                            setSelectedRunsId(null);
                          } else {
                            setSelectedRunsId(trigger.id);
                            void loadTriggerRuns(trigger.id);
                          }
                        }}
                      >
                        {selectedRunsId === trigger.id ? "Hide runs" : "Runs"}
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-[11px] border border-border hover:border-danger text-danger cursor-pointer"
                        onClick={() => {
                          if (confirm(`Delete "${trigger.displayName}"?`))
                            void deleteTrigger(trigger.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="text-xs text-muted whitespace-pre-wrap">
                    {instructionPreview}
                    {trigger.instructions.length > 120 && (
                      <button
                        type="button"
                        className="ml-1 text-accent hover:underline cursor-pointer bg-transparent border-0 p-0 text-xs"
                        onClick={() => toggleInstructions(trigger.id)}
                      >
                        {isExpanded ? "show less" : "show more"}
                      </button>
                    )}
                  </div>

                  {/* Last run status */}
                  {trigger.lastStatus && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <StatusDot status={trigger.lastStatus} />
                      <span className="text-muted">
                        Last run {trigger.lastStatus}{" "}
                        {trigger.lastRunAtIso &&
                          `at ${formatDateTime(trigger.lastRunAtIso, { fallback: "—" })}`}
                      </span>
                      {trigger.lastError && (
                        <span className="text-danger">
                          — {trigger.lastError}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Run history */}
                  {selectedRunsId === trigger.id && (
                    <div className="border border-border bg-card p-3 mt-1">
                      <div className="text-[11px] font-bold mb-2 uppercase tracking-wide text-muted">
                        Run History
                      </div>
                      {selectedRuns.length === 0 ? (
                        <div className="text-xs text-muted py-2">
                          No runs recorded yet.
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {selectedRuns
                            .slice()
                            .reverse()
                            .map((run) => (
                              <div
                                key={run.triggerRunId}
                                className="flex items-start gap-2 text-xs border border-border px-3 py-1.5"
                              >
                                <StatusDot status={run.status} />
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium">
                                    {run.status}
                                  </span>
                                  <span className="text-muted">
                                    {" "}
                                    ·{" "}
                                    {formatDateTime(run.finishedAt, {
                                      fallback: "—",
                                    })}{" "}
                                    · {formatDurationMs(run.latencyMs)} ·{" "}
                                    {run.source}
                                  </span>
                                  {run.error && (
                                    <div className="text-danger mt-0.5">
                                      {run.error}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
