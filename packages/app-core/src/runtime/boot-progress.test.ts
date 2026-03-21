import { describe, expect, it, vi } from "vitest";
import {
  BOOT_PHASES,
  type BootProgressEvent,
  BootProgressReporter,
} from "./boot-progress.js";

describe("BootProgressReporter", () => {
  it("emits progress event when phase is called", () => {
    const reporter = new BootProgressReporter();
    const handler = vi.fn();
    reporter.on("progress", handler);

    reporter.phase("config");

    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0][0] as BootProgressEvent;
    expect(event.phase).toBe("config");
    expect(event.label).toBe("Loading configuration");
    expect(event.progress).toBe(0); // first phase, nothing completed before it
  });

  it("calculates progress as sum of prior phase weights", () => {
    const reporter = new BootProgressReporter();
    const events: BootProgressEvent[] = [];
    reporter.on("progress", (e: BootProgressEvent) => events.push(e));

    reporter.phase("plugins"); // config (0.05) is before plugins

    expect(events[0].progress).toBeCloseTo(0.05, 5);
  });

  it("accumulates weights correctly for later phases", () => {
    const reporter = new BootProgressReporter();
    const events: BootProgressEvent[] = [];
    reporter.on("progress", (e: BootProgressEvent) => events.push(e));

    reporter.phase("embeddings");

    // config(0.05) + plugins(0.15) + database(0.15) = 0.35
    expect(events[0].progress).toBeCloseTo(0.35, 5);
  });

  it("includes detail when provided", () => {
    const reporter = new BootProgressReporter();
    const handler = vi.fn();
    reporter.on("progress", handler);

    reporter.phase("embeddings", "downloading gguf model…");

    const event = handler.mock.calls[0][0] as BootProgressEvent;
    expect(event.detail).toBe("downloading gguf model…");
  });

  it("complete() emits progress = 1 with ready phase", () => {
    const reporter = new BootProgressReporter();
    const handler = vi.fn();
    reporter.on("progress", handler);

    reporter.complete();

    const event = handler.mock.calls[0][0] as BootProgressEvent;
    expect(event.phase).toBe("ready");
    expect(event.label).toBe("Ready!");
    expect(event.progress).toBe(1);
  });

  it("ignores unknown phase ids", () => {
    const reporter = new BootProgressReporter();
    const handler = vi.fn();
    reporter.on("progress", handler);

    reporter.phase("nonexistent" as never);

    expect(handler).not.toHaveBeenCalled();
  });

  it("emits all phases in order with increasing progress", () => {
    const reporter = new BootProgressReporter();
    const events: BootProgressEvent[] = [];
    reporter.on("progress", (e: BootProgressEvent) => events.push(e));

    for (const phase of BOOT_PHASES) {
      reporter.phase(phase.id as BootProgressEvent["phase"]);
    }

    // Progress should be monotonically increasing
    for (let i = 1; i < events.length; i++) {
      expect(events[i].progress).toBeGreaterThanOrEqual(events[i - 1].progress);
    }

    // The "ready" phase should report progress = sum of all prior weights
    // (i.e. everything except ready's own weight)
    const lastEvent = events[events.length - 1];
    expect(lastEvent.phase).toBe("ready");
    const priorWeight = BOOT_PHASES.slice(0, -1).reduce(
      (sum, p) => sum + p.weight,
      0,
    );
    expect(lastEvent.progress).toBeCloseTo(priorWeight, 5);
  });
});

describe("BOOT_PHASES", () => {
  it("has weights that sum to 1", () => {
    const total = BOOT_PHASES.reduce((sum, p) => sum + p.weight, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("has unique phase ids", () => {
    const ids = BOOT_PHASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has non-empty labels", () => {
    for (const phase of BOOT_PHASES) {
      expect(phase.label.length).toBeGreaterThan(0);
    }
  });
});
