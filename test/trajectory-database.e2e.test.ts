import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    AgentRuntime,
    createCharacter,
    logger,
} from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import pluginTrajectoryLogger from "@elizaos/plugin-trajectory-logger";
import { default as pluginSql } from "@elizaos/plugin-sql";
import {
    startTrajectoryStepInDatabase,
    completeTrajectoryStepInDatabase,
    loadPersistedTrajectoryRows,
    deletePersistedTrajectoryRows,
    clearPersistedTrajectoryRows,
} from "../src/runtime/trajectory-persistence";

function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    });
}

describe("Trajectory Database E2E", () => {
    let runtime: AgentRuntime;
    const pgliteDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "milady-e2e-pglite-"),
    );

    beforeAll(async () => {
        process.env.PGLITE_DATA_DIR = pgliteDir;

        const character = createCharacter({
            name: "TrajectoryDBTestAgent",
        });

        runtime = new AgentRuntime({
            character,
            plugins: [pluginTrajectoryLogger],
            logLevel: "warn",
            enableAutonomy: false,
        });

        await runtime.registerPlugin(pluginSql);
        await runtime.initialize();
    }, 180_000);

    afterAll(async () => {
        if (runtime) {
            try {
                await withTimeout(runtime.stop(), 90_000, "runtime.stop()");
            } catch (err) {
                logger.warn(`[e2e] Runtime stop error: ${err}`);
            }
        }
        try {
            fs.rmSync(pgliteDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    }, 150_000);

    it("persists trajectory steps to the real database", async () => {
        const stepId = `test-db-step-${Date.now()}`;

        const started = await startTrajectoryStepInDatabase({
            runtime,
            stepId,
            source: "test-harness",
            metadata: { suite: "e2e" },
        });
        expect(started).toBe(true);

        const rows = await loadPersistedTrajectoryRows(runtime);
        expect(rows).not.toBeNull();
        expect(rows!.length).toBeGreaterThanOrEqual(1);

        const traj = rows!.find((r) => r.id === stepId);
        expect(traj).toBeDefined();
        expect(traj!.status).toBe("active");
        expect(traj!.source).toBe("test-harness");

        // Verify steps_json structure
        const stepsRaw = traj!.steps_json;
        const steps =
            typeof stepsRaw === "string" ? JSON.parse(stepsRaw) : stepsRaw;
        expect(Array.isArray(steps)).toBe(true);
        expect(steps.length).toBeGreaterThanOrEqual(1);
        expect(steps[0].stepId).toBe(stepId);
    });

    it("completes a trajectory step and updates status", async () => {
        const stepId = `test-complete-${Date.now()}`;

        await startTrajectoryStepInDatabase({
            runtime,
            stepId,
            source: "test-harness",
        });

        const completed = await completeTrajectoryStepInDatabase({
            runtime,
            stepId,
            status: "completed",
            metadata: { completedAt: Date.now() },
        });
        expect(completed).toBe(true);

        const rows = await loadPersistedTrajectoryRows(runtime);
        const row = rows!.find((r) => r.id === stepId);
        expect(row).toBeDefined();
        expect(row!.status).toBe("completed");
        expect(row!.end_time).not.toBeNull();
    });

    it("deletes trajectory rows by ID", async () => {
        const stepId = `test-delete-${Date.now()}`;

        await startTrajectoryStepInDatabase({
            runtime,
            stepId,
            source: "test-harness",
        });

        let rows = await loadPersistedTrajectoryRows(runtime);
        expect(rows!.some((r) => r.id === stepId)).toBe(true);

        const deleted = await deletePersistedTrajectoryRows(runtime, [stepId]);
        expect(deleted).toBeGreaterThanOrEqual(1);

        rows = await loadPersistedTrajectoryRows(runtime);
        expect(rows!.some((r) => r.id === stepId)).toBe(false);
    });

    it("clears all trajectory rows", async () => {
        await startTrajectoryStepInDatabase({
            runtime,
            stepId: `test-clear-a-${Date.now()}`,
            source: "test-harness",
        });
        await startTrajectoryStepInDatabase({
            runtime,
            stepId: `test-clear-b-${Date.now()}`,
            source: "test-harness",
        });

        let rows = await loadPersistedTrajectoryRows(runtime);
        expect(rows!.length).toBeGreaterThanOrEqual(2);

        const cleared = await clearPersistedTrajectoryRows(runtime);
        expect(cleared).toBeGreaterThanOrEqual(2);

        rows = await loadPersistedTrajectoryRows(runtime);
        expect(rows!.length).toBe(0);
    });
});
