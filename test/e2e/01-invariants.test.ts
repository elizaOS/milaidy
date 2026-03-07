import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import net from "node:net";

// --- SYSTEM INVARIANTS: THE "IT BOOTS" LAYER ---

const TEST_TIMEOUT = 600000; // 10 minutes max for first embeddings

describe("Tier 1: System Invariants", () => {
    let testDir: string;
    let miladyProcess: ReturnType<typeof spawn>;
    let combinedOutput = "";
    let stderrOutput = "";
    let portBound = false;

    beforeAll(async () => {
        // Invariant: State Isolation. Every test gets a clean pseudo-home directory.
        testDir = join(tmpdir(), `milady-test-${randomUUID()}`);
        await mkdir(testDir, { recursive: true });

        // Invariant: No Mocks. We run the actual compiled binary.
        miladyProcess = spawn("node", ["./scripts/run-node.mjs", "start"], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                HOME: testDir,
                USERPROFILE: testDir, // Windows home dir
                MILADY_DIR: join(testDir, ".milady"),
                NODE_LLAMA_CPP_GPU: "false", // Force CPU to avoid CUDA environment variability in tests
                LOG_LEVEL: "info",
            },
        });

        miladyProcess.stdout?.on("data", (data) => {
            combinedOutput += data.toString();
            if (!portBound && combinedOutput.includes("API server listening on")) {
                portBound = true;
            }
        });

        miladyProcess.stderr?.on("data", (data) => {
            const chunk = data.toString();
            combinedOutput += chunk;
            stderrOutput += chunk;
        });

        // Wait for the binding success log or process death
        await new Promise<void>((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (portBound) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 500);

            miladyProcess.on("close", (code) => {
                clearInterval(checkInterval);
                if (!portBound) {
                    reject(new Error(`Process exited early with code ${code}. Output: ${stderrOutput}`));
                }
            });

            setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error(`Timeout waiting for port binding. Output: ${combinedOutput}`));
            }, TEST_TIMEOUT - 5000);
        });
    }, TEST_TIMEOUT);

    afterAll(async () => {
        if (miladyProcess) {
            miladyProcess.kill("SIGINT");
        }
        // Cleanup pseudo-home
        await rm(testDir, { recursive: true, force: true }).catch(() => { });
    });

    test("INV-ENV-01: System process boots without FATAL crashes", () => {
        // Invariant: Crash is Failure.
        const fatalErrors = stderrOutput.toLowerCase().includes("fatal error");
        expect(fatalErrors).toBeFalse();
    });

    test("INV-NET-01: API server successfully claims port 2138", async () => {
        expect(portBound).toBeTrue();

        // Double check with actual TCP socket
        const connectToPort = new Promise<boolean>((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(2000);
            socket.connect(2138, "127.0.0.1", () => {
                socket.destroy();
                resolve(true);
            });
            socket.on("error", () => resolve(false));
            socket.on("timeout", () => {
                socket.destroy();
                resolve(false);
            });
        });

        const isConnected = await connectToPort;
        expect(isConnected).toBeTrue();
    });

    test("INV-NATIVE-01: Common native dependency crashes do not appear in logs", () => {
        const outputLower = combinedOutput.toLowerCase();
        expect(outputLower.includes("cuda error")).toBeFalse();
        expect(outputLower.includes("cannot find module '@elizaos/plugin-pi-ai'")).toBeFalse();
        expect(outputLower.includes("cannot find module '@milaidy")).toBeFalse();
        expect(outputLower.includes("sigsegv")).toBeFalse();
    });
});
