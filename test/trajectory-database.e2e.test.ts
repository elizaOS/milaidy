import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    AgentRuntime,
    createCharacter,
    logger,
    type Plugin,
} from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server";

import pluginTrajectoryLogger from "@elizaos/plugin-trajectory-logger";
import { default as pluginSql } from "@elizaos/plugin-sql";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function http$(
    port: number,
    method: string,
    p: string,
    body?: Record<string, unknown>,
    options?: { timeoutMs?: number },
): Promise<{ status: number; data: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
        const b = body ? JSON.stringify(body) : undefined;
        const timeoutMs = options?.timeoutMs ?? 60_000;
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port,
                path: p,
                method,
                headers: {
                    "Content-Type": "application/json",
                    ...(b ? { "Content-Length": Buffer.byteLength(b) } : {}),
                },
            },
            (res) => {
                const ch: Buffer[] = [];
                res.on("data", (c: Buffer) => ch.push(c));
                res.on("end", () => {
                    const raw = Buffer.concat(ch).toString("utf-8");
                    let data: Record<string, unknown> = {};
                    try {
                        data = JSON.parse(raw) as Record<string, unknown>;
                    } catch {
                        data = { _raw: raw };
                    }
                    resolve({ status: res.statusCode ?? 0, data });
                });
            },
        );
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
        });
        req.on("error", reject);
        if (b) req.write(b);
        req.end();
    });
}

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
    let server: { port: number; close: () => Promise<void> } | null = null;
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

        // We manually initialize the Sql Plugin (so DB is ready) which matches how
        // it's done natively in startApiServer. startApiServer actually bootstraps via
        // runtime-bootstrap.ts. We will just use startApiServer.
        server = await startApiServer({ port: 0, runtime });
    }, 180_000);

    afterAll(async () => {
        if (server) {
            try {
                await withTimeout(server.close(), 30_000, "server.close()");
            } catch (err) {
                logger.warn(`[e2e] Server close error: ${err}`);
            }
        }
        if (runtime) {
            try {
                await withTimeout(runtime.stop(), 90_000, "runtime.stop()");
            } catch (err) {
                logger.warn(`[e2e] Runtime stop error: ${err}`);
            }
        }
        try {
            fs.rmSync(pgliteDir, { recursive: true, force: true });
        } catch (err) {
            // ignore
        }
    }, 150_000);

    it("persists LLM calls to the real trajectory database", async () => {
        // Wait for trajectory_logger registration internally mapping and start
        const loggerSvc: any = runtime.getService("trajectory_logger");
        expect(loggerSvc).toBeDefined();

        const stepId = "test-real-db-step-001";

        console.warn("DEBUG test: is logLlmCall patched?", loggerSvc.logLlmCall.toString().includes("enqueueStepWrite"));

        // Call the logger method using the trajectory_logger service.
        // It should transparently enqueue a database write because
        // installDatabaseTrajectoryLogger hooked into it.
        loggerSvc.logLlmCall({
            stepId,
            model: "test-model-42",
            systemPrompt: "sys-prompt-test",
            userPrompt: "hello db",
            response: "hi db!",
            temperature: 0.1,
            maxTokens: 50,
            purpose: "test.db",
            actionType: "test.useModel",
            latencyMs: 120,
            timestamp: Date.now(),
            promptTokens: 15,
            completionTokens: 8,
        });

        loggerSvc.logProviderAccess({
            stepId,
            providerId: "test-db-provider-1",
            providerName: "dummy-api",
            timestamp: Date.now() + 10,
            data: { status: "ok" },
            purpose: "fetching test data",
        });

        // The SQLite db driver has await writes. Give it a moment to finish queueing.
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Confirm using the HTTP endpoint
        const listRes = await http$(server!.port, "GET", "/api/trajectories");
        console.warn("DEBUG listRes.data: ", JSON.stringify(listRes.data, null, 2));
        expect(listRes.status).toBe(200);

        const trajectories = listRes.data.trajectories as any[];
        expect(trajectories).toBeDefined();

        // We should find our stepId
        const traj = trajectories.find((t) => t.id === stepId);
        expect(traj).toBeDefined();
        expect(traj.stepCount).toBe(1);
        expect(traj.llmCallCount).toBe(1);
        expect(traj.totalPromptTokens).toBe(15);
        expect(traj.totalCompletionTokens).toBe(8);

        // Get the details
        const detRes = await http$(server!.port, "GET", `/api/trajectories/${stepId}`);
        expect(detRes.status).toBe(200);
        const details = detRes.data.trajectory as any;
        expect(details).toBeDefined();

        const steps = typeof details.stepsJson === "string" ? JSON.parse(details.stepsJson) : details.stepsJson;
        expect(Array.isArray(steps)).toBe(true);
        expect(steps.length).toEqual(1);

        const llmCalls = steps[0].llmCalls;
        expect(llmCalls.length).toBe(1);
        expect(llmCalls[0].model).toBe("test-model-42");
        expect(llmCalls[0].response).toBe("hi db!");

        const providers = steps[0].providerAccesses;
        expect(providers.length).toBe(1);
        expect(providers[0].providerName).toBe("dummy-api");
    });
});
