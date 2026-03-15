import { Button, Input } from "@milady/ui";
import { Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  CreateTriggerRequest,
  TriggerSummary,
  UpdateTriggerRequest,
} from "../api/client";
import { useApp } from "../state";
import { confirmDesktopAction } from "../utils";
import { formatDateTime, formatDurationMs } from "./format";
import { StatusBadge, StatusDot } from "./ui-badges";

type TriggerType = "interval" | "once" | "cron";
type TriggerWakeMode = "inject_now" | "next_autonomy_cycle";

const DURATION_UNITS = [
  { label: "seconds", ms: 1000 },
  { label: "minutes", ms: 60_000 },
  { label: "hours", ms: 3_600_000 },
  { label: "days", ms: 86_400_000 },
] as const;

type DurationUnit = (typeof DURATION_UNITS)[number]["label"];

function bestFitUnit(ms: number): { value: number; unit: DurationUnit } {
  for (let i = DURATION_UNITS.length - 1; i >= 0; i--) {
    const u = DURATION_UNITS[i];
    if (ms >= u.ms && ms % u.ms === 0) {
      return { value: ms / u.ms, unit: u.label };
    }
  }
  return { value: ms / 1000, unit: "seconds" };
}

function durationToMs(value: number, unit: DurationUnit): number {
  const found = DURATION_UNITS.find((u) => u.label === unit);
  return value * (found?.ms ?? 1000);
}

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
  durationValue: string;
  durationUnit: DurationUnit;
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
  durationValue: "1",
  durationUnit: "hours",
};

function parsePositiveInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function scheduleLabel(trigger: TriggerSummary): string {
  if (trigger.triggerType === "interval") {
    return `Every ${formatDurationMs(trigger.intervalMs)}`;
  }
  if (trigger.triggerType === "once") {
    return trigger.scheduledAtIso
      ? `Once at ${formatDateTime(trigger.scheduledAtIso)}`
      : "Once";
  }
  if (trigger.triggerType === "cron") {
    return `Cron: ${trigger.cronExpression ?? "—"}`;
  }
  return trigger.triggerType;
}

function formFromTrigger(trigger: TriggerSummary): TriggerFormState {
  const intervalMs = trigger.intervalMs ?? 3600000;
  const { value, unit } = bestFitUnit(intervalMs);
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
    durationValue: String(value),
    durationUnit: unit,
  };
}

function buildCreateRequest(form: TriggerFormState): CreateTriggerRequest {
  const maxRuns = parsePositiveInteger(form.maxRuns);
  return {
    displayName: form.displayName.trim(),
    instructions: form.instructions.trim(),
    triggerType: form.triggerType,
    wakeMode: form.wakeMode,
    enabled: form.enabled,
    intervalMs:
      form.triggerType === "interval"
        ? durationToMs(Number(form.durationValue) || 1, form.durationUnit)
        : undefined,
    scheduledAtIso:
      form.triggerType === "once" ? form.scheduledAtIso.trim() : undefined,
    cronExpression:
      form.triggerType === "cron" ? form.cronExpression.trim() : undefined,
    maxRuns,
  };
}

function buildUpdateRequest(form: TriggerFormState): UpdateTriggerRequest {
  return { ...buildCreateRequest(form) };
}

function validateForm(form: TriggerFormState): string | null {
  if (!form.displayName.trim()) return "Display name is required.";
  if (!form.instructions.trim()) return "Instructions are required.";
  if (form.triggerType === "interval") {
    const val = Number(form.durationValue);
    if (!Number.isFinite(val) || val <= 0) {
      return "Interval must be a positive number.";
    }
  }
  if (form.triggerType === "once") {
    const raw = form.scheduledAtIso.trim();
    if (!raw) return "Scheduled time is required for one-time heartbeats.";
    if (!Number.isFinite(Date.parse(raw))) {
      return "Scheduled time must be a valid ISO date-time.";
    }
  }
  if (form.triggerType === "cron") {
    const cronTrimmed = form.cronExpression.trim();
    if (!cronTrimmed) return "Cron expression is required.";
    const cronParts = cronTrimmed.split(/\s+/);
    if (cronParts.length !== 5) {
      return "Cron expression must have exactly 5 fields (minute hour day month weekday).";
    }
    const ranges = [
      { name: "minute" },
      { name: "hour" },
      { name: "day" },
      { name: "month" },
      { name: "weekday" },
    ];
    for (let index = 0; index < 5; index += 1) {
      if (!/^[\d,\-*/]+$/.test(cronParts[index])) {
        return `Invalid cron ${ranges[index].name} field: "${cronParts[index]}"`;
      }
    }
  }
  if (form.maxRuns.trim() && !parsePositiveInteger(form.maxRuns)) {
    return "Max runs must be a positive integer.";
  }
  return null;
}

export function HeartbeatsView() {
  const {
    triggers = [],
    triggersLoading = false,
    triggersSaving = false,
    triggerRunsById = {},
    triggerError = null,
    loadTriggers = async () => {},
    createTrigger = async () => null,
    updateTrigger = async () => null,
    deleteTrigger = async () => true,
    runTriggerNow = async () => true,
    loadTriggerRuns = async () => {},
    loadTriggerHealth = async () => {},
    t,
  } = useApp();

  const [form, setForm] = useState<TriggerFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedRunsId, setSelectedRunsId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [runsExpanded, setRunsExpanded] = useState(false);

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
    setSelectedRunsId(null);
    setRunsExpanded(false);
  };

  const selectTrigger = (trigger: TriggerSummary) => {
    setEditingId(trigger.id);
    setForm(formFromTrigger(trigger));
    setFormError(null);
    setSelectedRunsId(trigger.id);
    void loadTriggerRuns(trigger.id);
    setRunsExpanded(false);
  };

  const onSubmit = async () => {
    const error = validateForm(form);
    if (error) {
      setFormError(error);
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

  return (
    <div className="grid w-full gap-4 lg:grid-cols-3 lg:items-start">
      {/* ── Left column: form ── */}
      <div className="rounded-xl border border-border bg-card p-[18px] shadow-sm lg:col-span-1 lg:sticky lg:top-0 lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-base font-bold">
            {editingId
              ? `Edit: ${form.displayName || "Heartbeat"}`
              : "New Heartbeat"}
          </h2>
          {editingId && (
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => runTriggerNow(editingId)}
              >
                {t("triggersview.RunNow")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => {
                  updateTrigger(editingId, {
                    enabled: !form.enabled,
                  });
                  setField("enabled", !form.enabled);
                }}
              >
                {form.enabled ? "Disable" : "Enable"}
              </Button>
            </div>
          )}
        </div>

        {/* Error banner */}
        {triggerError && (
          <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {triggerError}
          </div>
        )}

        {/* Form */}
        <div className="grid gap-3">
          {/* Name */}
          <div>
            <span className="mb-1 block text-xs text-muted">
              {t("triggersview.Name")}
            </span>
            <Input
              className="h-9 w-full rounded-lg border-border bg-bg px-3 py-1.5 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
              value={form.displayName}
              onChange={(event) => setField("displayName", event.target.value)}
              placeholder={t("triggersview.eGDailyDigestH")}
            />
          </div>

          {/* Instructions */}
          <div>
            <span className="mb-1 block text-xs text-muted">
              {t("triggersview.Instructions")}
            </span>
            <textarea
              className="min-h-[80px] w-full resize-y rounded-lg border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
              value={form.instructions}
              onChange={(event) => setField("instructions", event.target.value)}
              placeholder={t("triggersview.WhatShouldTheAgen")}
            />
          </div>

          {/* Schedule Type + Wake Mode (2-col grid) */}
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <div>
              <span className="mb-1 block text-xs text-muted">
                {t("triggersview.ScheduleType")}
              </span>
              <select
                className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                value={form.triggerType}
                onChange={(event) =>
                  setField("triggerType", event.target.value as TriggerType)
                }
              >
                <option value="interval">
                  {t("triggersview.RepeatingInterval")}
                </option>
                <option value="once">{t("triggersview.OneTime")}</option>
                <option value="cron">{t("triggersview.CronSchedule")}</option>
              </select>
            </div>

            <div>
              <span className="mb-1 block text-xs text-muted">
                {t("triggersview.WakeMode")}
              </span>
              <select
                className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                value={form.wakeMode}
                onChange={(event) =>
                  setField("wakeMode", event.target.value as TriggerWakeMode)
                }
              >
                <option value="inject_now">
                  {t("triggersview.InjectAmpWakeIm")}
                </option>
                <option value="next_autonomy_cycle">
                  {t("triggersview.QueueForNextCycle")}
                </option>
              </select>
            </div>
          </div>

          {/* Duration picker for interval */}
          {form.triggerType === "interval" && (
            <div>
              <span className="mb-1 block text-xs text-muted">
                Interval
              </span>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="1"
                  className="h-9 w-24 rounded-lg border-border bg-bg px-3 py-1.5 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
                  value={form.durationValue}
                  onChange={(event) =>
                    setField("durationValue", event.target.value)
                  }
                  placeholder="1"
                />
                <select
                  className="h-9 flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                  value={form.durationUnit}
                  onChange={(event) =>
                    setField("durationUnit", event.target.value as DurationUnit)
                  }
                >
                  {DURATION_UNITS.map((u) => (
                    <option key={u.label} value={u.label}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Datetime for once */}
          {form.triggerType === "once" && (
            <div>
              <span className="mb-1 block text-xs text-muted">
                {t("triggersview.ScheduledTimeISO")}
              </span>
              <Input
                type="datetime-local"
                className="h-9 w-full rounded-lg border-border bg-bg px-3 py-1.5 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
                value={form.scheduledAtIso}
                onChange={(event) =>
                  setField("scheduledAtIso", event.target.value)
                }
              />
            </div>
          )}

          {/* Cron input */}
          {form.triggerType === "cron" && (
            <div>
              <span className="mb-1 block text-xs text-muted">
                {t("triggersview.CronExpression5F")}
              </span>
              <Input
                className="h-9 w-full rounded-lg border-border bg-bg px-3 py-1.5 font-mono text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
                value={form.cronExpression}
                onChange={(event) =>
                  setField("cronExpression", event.target.value)
                }
                placeholder="*/15 * * * *"
              />
              <div className="mt-1 text-[10px] text-muted">
                {t("triggersview.minuteHourDayMont")}
              </div>
            </div>
          )}

          {/* Max Runs */}
          <div>
            <span className="mb-1 block text-xs text-muted">
              {t("triggersview.MaxRunsOptional")}
            </span>
            <Input
              className="h-9 w-full rounded-lg border-border bg-bg px-3 py-1.5 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
              value={form.maxRuns}
              onChange={(event) => setField("maxRuns", event.target.value)}
              placeholder="∞"
            />
          </div>

          {/* Start Enabled */}
          <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setField("enabled", event.target.checked)}
            />
            {t("triggersview.StartEnabled")}
          </label>

          {/* Form error */}
          {formError && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {formError}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="default"
              size="sm"
              className="h-9 px-4 py-1.5 text-sm shadow-sm"
              disabled={triggersSaving}
              onClick={onSubmit}
            >
              {triggersSaving
                ? "Saving..."
                : editingId
                  ? "Save Changes"
                  : "Create Heartbeat"}
            </Button>
            {editingId && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 py-1.5 text-sm shadow-sm hover:border-accent"
                  onClick={clearForm}
                >
                  {t("onboarding.cancel")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 py-1.5 text-sm text-danger shadow-sm hover:border-danger"
                  onClick={async () => {
                    const confirmed = await confirmDesktopAction({
                      title: "Delete Heartbeat",
                      message: `Delete "${form.displayName}"?`,
                      confirmLabel: "Delete",
                      cancelLabel: "Cancel",
                      type: "warning",
                    });
                    if (confirmed) {
                      await deleteTrigger(editingId);
                      clearForm();
                    }
                  }}
                >
                  {t("triggersview.Delete")}
                </Button>
              </>
            )}
          </div>
        </div>
        {/* Run history collapsible */}
        {editingId && selectedRunsId && (
          <div className="mt-6">
            <button
              type="button"
              className="mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted hover:text-txt"
              onClick={() => setRunsExpanded((prev) => !prev)}
            >
              <span className={`inline-block transition-transform ${runsExpanded ? "rotate-90" : ""}`}>
                &#9654;
              </span>
              {t("triggersview.RunHistory")}
            </button>
            {runsExpanded && (
              <div className="rounded-lg border border-border bg-bg p-3">
                {selectedRuns.length === 0 ? (
                  <div className="py-2 text-xs text-muted">
                    {t("triggersview.NoRunsRecordedYet")}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {selectedRuns
                      .slice()
                      .reverse()
                      .map((run) => (
                        <div
                          key={run.triggerRunId}
                          className="flex items-start gap-2 rounded border border-border px-3 py-1.5 text-xs"
                        >
                          <StatusDot status={run.status} />
                          <div className="min-w-0 flex-1">
                            <span className="font-medium">{run.status}</span>
                            <span className="text-muted">
                              {" "}
                              &middot;{" "}
                              {formatDateTime(run.finishedAt, {
                                fallback: "---",
                              })}{" "}
                              &middot; {formatDurationMs(run.latencyMs)} &middot;{" "}
                              {run.source}
                            </span>
                            {run.error && (
                              <div className="mt-0.5 text-danger">
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
        )}
      </div>

      {/* ── Right column: trigger list ── */}
      <div className="rounded-xl border border-border bg-card p-[14px] shadow-sm lg:col-span-2 lg:h-[calc(100vh-80px)] lg:overflow-y-auto">
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-sm font-bold">{t("nav.heartbeats")}</h2>
          <span className="text-xs text-muted">
            {triggersLoading ? "Loading..." : `${triggers.length}`}
          </span>
        </div>

        {triggers.length === 0 && !triggersLoading ? (
          <div className="py-10 text-center">
            <Clock3 className="mx-auto mb-2 h-8 w-8 text-muted opacity-40" />
            <div className="text-xs text-muted">
              {t("triggersview.NoTriggersConfigur")}
            </div>
            <div className="mt-1 text-[10px] text-muted">
              {t("triggersview.CreateOneAboveTo")}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {triggers.map((trigger) => (
              <button
                key={trigger.id}
                type="button"
                onClick={() => selectTrigger(trigger)}
                className={`two-panel-item flex w-full flex-col text-left ${editingId === trigger.id ? "is-selected" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <StatusDot status={trigger.enabled ? "active" : "paused"} />
                  <span className="truncate text-xs font-medium">
                    {trigger.displayName}
                  </span>
                </div>
                <div className="mt-0.5 pl-5 text-[10px] text-muted">
                  {scheduleLabel(trigger)}
                  {trigger.runCount > 0 && (
                    <> &middot; {trigger.runCount} run{trigger.runCount !== 1 ? "s" : ""}</>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
