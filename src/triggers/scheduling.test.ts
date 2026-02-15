import type { UUID } from "@elizaos/core";
import { describe, expect, test } from "vitest";
import {
  buildTriggerConfig,
  buildTriggerDedupeKey,
  buildTriggerMetadata,
  computeNextCronRunAtMs,
  MAX_TRIGGER_INTERVAL_MS,
  MIN_TRIGGER_INTERVAL_MS,
  normalizeTriggerDraft,
  normalizeTriggerIntervalMs,
  parseCronExpression,
  resolveTriggerTiming,
} from "./scheduling.js";

describe("trigger scheduling helpers", () => {
  test("normalizes interval bounds", () => {
    expect(normalizeTriggerIntervalMs(1)).toBe(MIN_TRIGGER_INTERVAL_MS);
    expect(normalizeTriggerIntervalMs(MAX_TRIGGER_INTERVAL_MS + 1)).toBe(
      MAX_TRIGGER_INTERVAL_MS,
    );
    expect(normalizeTriggerIntervalMs(120_000)).toBe(120_000);
  });

  test("validates cron expressions", () => {
    expect(parseCronExpression("*/15 * * * *")).not.toBeNull();
    expect(parseCronExpression("* * *")).toBeNull();
    expect(parseCronExpression("99 * * * *")).toBeNull();
  });

  test("computes next cron runtime", () => {
    const from = Date.UTC(2026, 0, 1, 12, 7, 13);
    const next = computeNextCronRunAtMs("*/15 * * * *", from);
    expect(next).toBe(Date.UTC(2026, 0, 1, 12, 15, 0));
  });

  test("normalizes interval draft", () => {
    const result = normalizeTriggerDraft({
      input: {
        displayName: "Check",
        instructions: "Check status",
        triggerType: "interval",
        intervalMs: 120_000,
      },
      fallback: {
        displayName: "Fallback",
        instructions: "Fallback",
        triggerType: "interval",
        wakeMode: "inject_now",
        enabled: true,
        createdBy: "api",
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.draft?.intervalMs).toBe(120_000);
  });

  test("builds trigger config and metadata", () => {
    const draft = normalizeTriggerDraft({
      input: {
        displayName: "Run",
        instructions: "Run this",
        triggerType: "interval",
        intervalMs: 300_000,
      },
      fallback: {
        displayName: "Fallback",
        instructions: "Fallback",
        triggerType: "interval",
        wakeMode: "inject_now",
        enabled: true,
        createdBy: "api",
      },
    }).draft;
    expect(draft).toBeDefined();

    const trigger = buildTriggerConfig({
      draft: draft as NonNullable<typeof draft>,
      triggerId: "00000000-0000-0000-0000-000000000100" as UUID,
    });
    const metadata = buildTriggerMetadata({
      trigger,
      nowMs: Date.UTC(2026, 0, 1, 0, 0, 0),
    });

    expect(metadata?.trigger?.triggerId).toBe(trigger.triggerId);
    expect(metadata?.updateInterval).toBe(300_000);
  });

  test("resolves trigger timing for once trigger", () => {
    const trigger = buildTriggerConfig({
      draft: {
        displayName: "One shot",
        instructions: "Run once",
        triggerType: "once",
        wakeMode: "inject_now",
        enabled: true,
        createdBy: "api",
        scheduledAtIso: "2026-01-01T05:00:00.000Z",
      },
      triggerId: "00000000-0000-0000-0000-000000000101" as UUID,
    });
    const timing = resolveTriggerTiming(trigger, Date.UTC(2026, 0, 1, 0, 0, 0));
    expect(timing).not.toBeNull();
    expect(timing?.nextRunAtMs).toBe(Date.UTC(2026, 0, 1, 5, 0, 0));
  });

  test("dedupe key is stable", () => {
    const a = buildTriggerDedupeKey({
      triggerType: "interval",
      instructions: "Summarize PRs",
      intervalMs: 60000,
      wakeMode: "inject_now",
    });
    const b = buildTriggerDedupeKey({
      triggerType: "interval",
      instructions: "  Summarize   PRs ",
      intervalMs: 60000,
      wakeMode: "inject_now",
    });
    expect(a).toBe(b);
  });
});
