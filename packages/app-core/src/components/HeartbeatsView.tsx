import { Button, Input } from "@milady/ui";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

const accentFg: CSSProperties = { color: "var(--accent-foreground)" };

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
  return { ...buildCreateRequest(form) };
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
  const [expandedInstructions, setExpandedInstructions] = useState<Set<string>>(
    new Set(),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  const toggleInstructions = (id: string) => {
    setExpandedInstructions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scrollToTop = () => {
    const scrollContainer = rootRef.current?.closest<HTMLElement>(
      "[data-shell-scroll-region='true']",
    );
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      ref={rootRef}
      className="grid w-full gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] md:items-start"
    >
      <section className="min-w-0 rounded-xl border border-border bg-card p-4 px-5 md:order-2">
        <h2 className="mb-3 text-sm font-bold">
          {editingId ? "Edit Heartbeat" : "New Heartbeat"}
        </h2>
        <div className="grid gap-3">
          <div>
            <span className="mb-1 block text-[11px] text-muted">
              {t("triggersview.Name")}
            </span>
            <Input
              className="h-9 w-full border-border bg-bg px-3 py-1.5 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
              value={form.displayName}
              onChange={(event) => setField("displayName", event.target.value)}
              placeholder={t("triggersview.eGDailyDigestH")}
            />
          </div>

          <div>
            <span className="mb-1 block text-[11px] text-muted">
              {t("triggersview.Instructions")}
            </span>
            <textarea
              className="min-h-[80px] w-full resize-y border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
              value={form.instructions}
              onChange={(event) => setField("instructions", event.target.value)}
              placeholder={t("triggersview.WhatShouldTheAgen")}
            />
          </div>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <div>
              <span className="mb-1 block text-[11px] text-muted">
                {t("triggersview.ScheduleType")}
              </span>
              <select
                className="w-full border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
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
              <span className="mb-1 block text-[11px] text-muted">
                {t("triggersview.WakeMode")}
              </span>
              <select
                className="w-full border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
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

            <div>
              <span className="mb-1 block text-[11px] text-muted">
                {t("triggersview.MaxRunsOptional")}
              </span>
              <Input
                className="h-9 w-full border-border bg-bg px-3 py-1.5 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
                value={form.maxRuns}
                onChange={(event) => setField("maxRuns", event.target.value)}
                placeholder="∞"
              />
            </div>
          </div>

          {form.triggerType === "interval" && (
            <div>
              <span className="mb-1 block text-[11px] text-muted">
                {t("triggersview.IntervalMs")}{" "}
                {formatDurationMs(parsePositiveInteger(form.intervalMs))}
              </span>
              <Input
                className="h-9 w-full border-border bg-bg px-3 py-1.5 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
                value={form.intervalMs}
                onChange={(event) => setField("intervalMs", event.target.value)}
                placeholder="3600000"
              />
            </div>
          )}

          {form.triggerType === "once" && (
            <div>
              <span className="mb-1 block text-[11px] text-muted">
                {t("triggersview.ScheduledTimeISO")}
              </span>
              <Input
                className="h-9 w-full border-border bg-bg px-3 py-1.5 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
                value={form.scheduledAtIso}
                onChange={(event) =>
                  setField("scheduledAtIso", event.target.value)
                }
                placeholder={t("triggersview.20260215T100000")}
              />
            </div>
          )}

          {form.triggerType === "cron" && (
            <div>
              <span className="mb-1 block text-[11px] text-muted">
                {t("triggersview.CronExpression5F")}
              </span>
              <Input
                className="h-9 w-full border-border bg-bg px-3 py-1.5 font-mono text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
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

          <span className="inline-flex cursor-pointer select-none items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setField("enabled", event.target.checked)}
            />
            {t("triggersview.StartEnabled")}
          </span>

          {(formError || triggerError) && (
            <div className="border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {formError ?? triggerError}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="default"
              size="sm"
              className="h-9 px-4 py-1.5 text-sm shadow-sm"
              style={accentFg}
              disabled={triggersSaving}
              onClick={onSubmit}
            >
              {triggersSaving
                ? "Saving…"
                : editingId
                  ? "Save Changes"
                  : "Create Heartbeat"}
            </Button>
            {editingId && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-4 py-1.5 text-sm shadow-sm hover:border-accent"
                onClick={clearForm}
              >
                {t("onboarding.cancel")}
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="min-w-0 rounded-xl border border-border bg-card p-4 md:order-1">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">{t("nav.heartbeats")}</h2>
          <span className="text-[11px] text-muted">
            {triggersLoading ? "Loading…" : `${triggers.length} configured`}
          </span>
        </div>

        {triggers.length === 0 && !triggersLoading ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-2xl">⏰</div>
            <div className="text-sm text-muted">
              {t("triggersview.NoTriggersConfigur")}
            </div>
            <div className="mt-1 text-xs text-muted">
              {t("triggersview.CreateOneAboveTo")}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {triggers.map((trigger) => {
              const isExpanded = expandedInstructions.has(trigger.id);
              const instructionPreview =
                trigger.instructions.length > 120 && !isExpanded
                  ? `${trigger.instructions.slice(0, 120)}…`
                  : trigger.instructions;

              return (
                <div
                  key={trigger.id}
                  className="space-y-2 rounded-xl border border-border bg-bg p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold">
                          {trigger.displayName}
                        </span>
                        <StatusBadge
                          label={trigger.enabled ? "active" : "paused"}
                          tone={trigger.enabled ? "success" : "muted"}
                        />
                      </div>
                      <div className="mt-1 text-xs text-muted">
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

                    <div className="flex flex-shrink-0 flex-wrap justify-end gap-1">
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 px-2 py-1 text-[11px] shadow-sm"
                        style={accentFg}
                        onClick={() => {
                          setEditingId(trigger.id);
                          setForm(formFromTrigger(trigger));
                          setFormError(null);
                          scrollToTop();
                        }}
                      >
                        {t("triggersview.Edit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 py-1 text-[11px] shadow-sm hover:border-accent"
                        onClick={() =>
                          updateTrigger(trigger.id, {
                            enabled: !trigger.enabled,
                          })
                        }
                      >
                        {trigger.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 py-1 text-[11px] shadow-sm hover:border-accent"
                        onClick={() => runTriggerNow(trigger.id)}
                      >
                        {t("triggersview.RunNow")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 py-1 text-[11px] shadow-sm hover:border-accent"
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
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 py-1 text-[11px] text-danger shadow-sm hover:border-danger"
                        onClick={async () => {
                          const confirmed = await confirmDesktopAction({
                            title: "Delete Heartbeat",
                            message: `Delete "${trigger.displayName}"?`,
                            confirmLabel: "Delete",
                            cancelLabel: "Cancel",
                            type: "warning",
                          });
                          if (confirmed) {
                            await deleteTrigger(trigger.id);
                          }
                        }}
                      >
                        {t("triggersview.Delete")}
                      </Button>
                    </div>
                  </div>

                  <div className="whitespace-pre-wrap text-xs text-muted">
                    {instructionPreview}
                    {trigger.instructions.length > 120 && (
                      <button
                        type="button"
                        className="ml-1 cursor-pointer border-0 bg-transparent p-0 text-xs text-txt hover:underline"
                        onClick={() => toggleInstructions(trigger.id)}
                      >
                        {isExpanded ? "show less" : "show more"}
                      </button>
                    )}
                  </div>

                  {trigger.lastStatus && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <StatusDot status={trigger.lastStatus} />
                      <span className="text-muted">
                        {t("triggersview.LastRun")} {trigger.lastStatus}{" "}
                        {trigger.lastRunAtIso &&
                          `at ${formatDateTime(trigger.lastRunAtIso, { fallback: "—" })}`}
                      </span>
                      {trigger.lastError && (
                        <span className="text-danger">
                          {" "}
                          - {trigger.lastError}
                        </span>
                      )}
                    </div>
                  )}

                  {selectedRunsId === trigger.id && (
                    <div className="mt-1 rounded-xl border border-border bg-card p-3">
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                        {t("triggersview.RunHistory")}
                      </div>
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
                                className="flex items-start gap-2 border border-border px-3 py-1.5 text-xs"
                              >
                                <StatusDot status={run.status} />
                                <div className="min-w-0 flex-1">
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
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
