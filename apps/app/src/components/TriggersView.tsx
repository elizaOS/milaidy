import { useMemo, useState } from "react";
import { useApp } from "../AppContext";
import type {
  CreateTriggerRequest,
  TriggerSummary,
  UpdateTriggerRequest,
} from "../api-client";

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

function formatTimestamp(value?: number): string {
  if (!value || !Number.isFinite(value)) return "—";
  return new Date(value).toLocaleString();
}

function parsePositiveNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
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
  const intervalMs = parsePositiveNumber(form.intervalMs);
  const maxRuns = parsePositiveNumber(form.maxRuns);
  return {
    displayName: form.displayName.trim(),
    instructions: form.instructions.trim(),
    triggerType: form.triggerType,
    wakeMode: form.wakeMode,
    enabled: form.enabled,
    intervalMs: form.triggerType === "interval" ? intervalMs : undefined,
    scheduledAtIso: form.triggerType === "once" ? form.scheduledAtIso.trim() : undefined,
    cronExpression: form.triggerType === "cron" ? form.cronExpression.trim() : undefined,
    maxRuns,
  };
}

function buildUpdateRequest(form: TriggerFormState): UpdateTriggerRequest {
  const create = buildCreateRequest(form);
  return {
    displayName: create.displayName,
    instructions: create.instructions,
    triggerType: create.triggerType,
    wakeMode: create.wakeMode,
    enabled: create.enabled,
    intervalMs: create.intervalMs,
    scheduledAtIso: create.scheduledAtIso,
    cronExpression: create.cronExpression,
    maxRuns: create.maxRuns,
  };
}

function validateForm(form: TriggerFormState): string | null {
  if (!form.displayName.trim()) return "Display name is required.";
  if (!form.instructions.trim()) return "Instructions are required.";
  if (form.triggerType === "interval") {
    if (!parsePositiveNumber(form.intervalMs)) {
      return "Interval must be a positive integer in milliseconds.";
    }
  }
  if (form.triggerType === "once") {
    const raw = form.scheduledAtIso.trim();
    if (!raw) return "Scheduled time is required for once triggers.";
    if (!Number.isFinite(Date.parse(raw))) return "Scheduled time must be valid ISO date-time.";
  }
  if (form.triggerType === "cron") {
    const cronTrimmed = form.cronExpression.trim();
    if (!cronTrimmed) {
      return "Cron expression is required for cron triggers.";
    }
    const cronParts = cronTrimmed.split(/\s+/);
    if (cronParts.length !== 5) {
      return "Cron expression must have exactly 5 fields (minute hour day month weekday).";
    }
    // Basic field range validation
    const cronRanges = [
      { name: "minute", min: 0, max: 59 },
      { name: "hour", min: 0, max: 23 },
      { name: "day", min: 1, max: 31 },
      { name: "month", min: 1, max: 12 },
      { name: "weekday", min: 0, max: 6 },
    ];
    for (let i = 0; i < 5; i++) {
      const part = cronParts[i];
      if (!/^[\d,\-\*\/]+$/.test(part)) {
        return `Invalid cron ${cronRanges[i].name} field: "${part}". Use digits, commas, dashes, *, or /.`;
      }
    }
  }
  if (form.maxRuns.trim() && !parsePositiveNumber(form.maxRuns)) {
    return "Max runs must be a positive integer.";
  }
  return null;
}

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

  const selectedRuns = useMemo(() => {
    if (!selectedRunsId) return [];
    return triggerRunsById[selectedRunsId] ?? [];
  }, [selectedRunsId, triggerRunsById]);

  const clearForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
  };

  const onSubmit = async () => {
    const validationError = validateForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    if (editingId) {
      const updated = await updateTrigger(editingId, buildUpdateRequest(form));
      if (updated) {
        setForm(formFromTrigger(updated));
      }
      return;
    }
    const created = await createTrigger(buildCreateRequest(form));
    if (created) {
      clearForm();
    }
  };

  const startEdit = (trigger: TriggerSummary) => {
    setEditingId(trigger.id);
    setForm(formFromTrigger(trigger));
    setFormError(null);
  };

  const toggleEnabled = async (trigger: TriggerSummary) => {
    await updateTrigger(trigger.id, { enabled: !trigger.enabled });
  };

  const openRuns = async (triggerId: string) => {
    setSelectedRunsId(triggerId);
    await loadTriggerRuns(triggerId);
  };

  return (
    <div className="space-y-4">
      <section className="border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-bold">Trigger Health</h2>
          <button
            className="px-2 py-1 text-xs border border-border hover:border-accent"
            onClick={() => {
              void loadTriggerHealth();
              void loadTriggers();
            }}
          >
            Refresh
          </button>
        </div>
        {triggerHealth ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div>Enabled: {triggerHealth.triggersEnabled ? "yes" : "no"}</div>
            <div>Active: {triggerHealth.activeTriggers}</div>
            <div>Failures: {triggerHealth.totalFailures}</div>
            <div>Last exec: {formatTimestamp(triggerHealth.lastExecutionAt)}</div>
          </div>
        ) : (
          <div className="text-xs text-muted">No health data available.</div>
        )}
      </section>

      <section className="border border-border bg-card p-4">
        <h2 className="text-sm font-bold mb-3">
          {editingId ? "Edit Trigger" : "Create Trigger"}
        </h2>
        <div className="grid gap-2">
          <input
            className="px-2 py-1 border border-border bg-bg text-sm"
            value={form.displayName}
            onChange={(event) =>
              setForm((prev: TriggerFormState) => ({
                ...prev,
                displayName: event.target.value,
              }))
            }
            placeholder="Display name"
          />
          <textarea
            className="px-2 py-1 border border-border bg-bg text-sm min-h-24"
            value={form.instructions}
            onChange={(event) =>
              setForm((prev: TriggerFormState) => ({
                ...prev,
                instructions: event.target.value,
              }))
            }
            placeholder="Instructions to inject into autonomy"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              className="px-2 py-1 border border-border bg-bg text-sm"
              value={form.triggerType}
              onChange={(event) =>
                setForm((prev: TriggerFormState) => ({
                  ...prev,
                  triggerType: event.target.value as TriggerType,
                }))
              }
            >
              <option value="interval">Interval</option>
              <option value="once">Once</option>
              <option value="cron">Cron</option>
            </select>
            <select
              className="px-2 py-1 border border-border bg-bg text-sm"
              value={form.wakeMode}
              onChange={(event) =>
                setForm((prev: TriggerFormState) => ({
                  ...prev,
                  wakeMode: event.target.value as TriggerWakeMode,
                }))
              }
            >
              <option value="inject_now">Inject now</option>
              <option value="next_autonomy_cycle">Next autonomy cycle</option>
            </select>
            <input
              className="px-2 py-1 border border-border bg-bg text-sm"
              value={form.maxRuns}
              onChange={(event) =>
                setForm((prev: TriggerFormState) => ({
                  ...prev,
                  maxRuns: event.target.value,
                }))
              }
              placeholder="Max runs (optional)"
            />
          </div>

          {form.triggerType === "interval" && (
            <input
              className="px-2 py-1 border border-border bg-bg text-sm"
              value={form.intervalMs}
              onChange={(event) =>
                setForm((prev: TriggerFormState) => ({
                  ...prev,
                  intervalMs: event.target.value,
                }))
              }
              placeholder="Interval in ms"
            />
          )}
          {form.triggerType === "once" && (
            <input
              className="px-2 py-1 border border-border bg-bg text-sm"
              value={form.scheduledAtIso}
              onChange={(event) =>
                setForm((prev: TriggerFormState) => ({
                  ...prev,
                  scheduledAtIso: event.target.value,
                }))
              }
              placeholder="ISO datetime, e.g. 2026-02-15T10:00:00.000Z"
            />
          )}
          {form.triggerType === "cron" && (
            <input
              className="px-2 py-1 border border-border bg-bg text-sm"
              value={form.cronExpression}
              onChange={(event) =>
                setForm((prev: TriggerFormState) => ({
                  ...prev,
                  cronExpression: event.target.value,
                }))
              }
              placeholder="Cron expression"
            />
          )}

          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) =>
                setForm((prev: TriggerFormState) => ({
                  ...prev,
                  enabled: event.target.checked,
                }))
              }
            />
            Enabled
          </label>

          {(formError || triggerError) && (
            <div className="text-xs text-danger">{formError ?? triggerError}</div>
          )}

          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 text-sm border border-accent bg-accent text-[var(--accent-foreground)] hover:bg-accent-hover disabled:opacity-50"
              disabled={triggersSaving}
              onClick={() => {
                void onSubmit();
              }}
            >
              {editingId ? "Save Trigger" : "Create Trigger"}
            </button>
            {editingId && (
              <button
                className="px-3 py-1.5 text-sm border border-border hover:border-accent"
                onClick={clearForm}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold">Triggers</h2>
          <span className="text-xs text-muted">
            {triggersLoading ? "Loading..." : `${triggers.length} total`}
          </span>
        </div>
        <div className="space-y-2">
          {triggers.map((trigger: TriggerSummary) => (
            <div
              key={trigger.id}
              className="border border-border bg-bg px-3 py-2 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {trigger.displayName}
                  </div>
                  <div className="text-xs text-muted">
                    {trigger.triggerType} •{" "}
                    {trigger.enabled ? "enabled" : "disabled"} • next run{" "}
                    {formatTimestamp(trigger.nextRunAtMs)}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    className="px-2 py-1 text-xs border border-border hover:border-accent"
                    onClick={() => startEdit(trigger)}
                  >
                    Edit
                  </button>
                  <button
                    className="px-2 py-1 text-xs border border-border hover:border-accent"
                    onClick={() => {
                      void toggleEnabled(trigger);
                    }}
                  >
                    {trigger.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="px-2 py-1 text-xs border border-border hover:border-accent"
                    onClick={() => {
                      void runTriggerNow(trigger.id);
                    }}
                  >
                    Run now
                  </button>
                  <button
                    className="px-2 py-1 text-xs border border-border hover:border-accent"
                    onClick={() => {
                      void openRuns(trigger.id);
                    }}
                  >
                    Runs
                  </button>
                  <button
                    className="px-2 py-1 text-xs border border-border hover:border-danger text-danger"
                    onClick={() => {
                      void deleteTrigger(trigger.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="text-xs whitespace-pre-wrap">{trigger.instructions}</div>
              {selectedRunsId === trigger.id && (
                <div className="border border-border bg-card p-2 mt-1">
                  <div className="text-xs font-semibold mb-1">Recent runs</div>
                  {selectedRuns.length === 0 ? (
                    <div className="text-xs text-muted">No runs yet.</div>
                  ) : (
                    <div className="space-y-1">
                      {selectedRuns
                        .slice()
                        .reverse()
                        .map((run) => (
                          <div
                            key={run.triggerRunId}
                            className="text-xs border border-border px-2 py-1"
                          >
                            <div>
                              {run.status} • {formatTimestamp(run.finishedAt)} •{" "}
                              {run.latencyMs}ms
                            </div>
                            {run.error && (
                              <div className="text-danger">{run.error}</div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {triggers.length === 0 && !triggersLoading && (
            <div className="text-xs text-muted">No triggers configured yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
