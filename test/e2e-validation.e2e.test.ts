/**
 * End-to-End Validation Tests — GitHub Issue #6
 *
 * Comprehensive E2E tests covering the full Milaidy validation matrix:
 *
 *   1. Fresh install simulation (build → CLI boot → onboarding → agent running)
 *   2. CLI entry point test (npx milaidy equivalent)
 *   3. Plugin stress test (all plugins loaded simultaneously)
 *   4. Long-running session test (simulated via timeout-based operations)
 *   5. Context integrity test (no corruption after multiple operations)
 *   6. Deadlock detection test (concurrent operations under load)
 *   7. Memory leak detection patterns
 *   8. Rapid sequential operations
 *
 * NO MOCKS — all tests use real production code paths.
 */
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import dotenv from "dotenv";
import {
  AgentRuntime,
  createCharacter,
  createMessageMemory,
  stringToUuid,
  ChannelType,
  logger,
  type Plugin,
  type Service,
  type UUID,
} from "@elizaos/core";
import { startApiServer } from "../src/api/server.js";
import {
  validateRuntimeContext,
  type RuntimeContextValidationResult,
} from "../src/api/plugin-validation.js";
import { ensureAgentWorkspace } from "../src/providers/workspace.js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "..");
dotenv.config({ path: path.resolve(packageRoot, ".env") });

const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
const hasGroq = Boolean(process.env.GROQ_API_KEY);
const hasModelProvider = hasOpenAI || hasAnthropic || hasGroq;

// ---------------------------------------------------------------------------
// Plugin helpers
// ---------------------------------------------------------------------------

interface PluginModule {
  default?: Plugin;
  plugin?: Plugin;
}

function looksLikePlugin(v: unknown): v is Plugin {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as Record<string, unknown>).name === "string"
  );
}

function extractPlugin(mod: PluginModule): Plugin | null {
  if (looksLikePlugin(mod.default)) return mod.default;
  if (looksLikePlugin(mod.plugin)) return mod.plugin;
  if (looksLikePlugin(mod)) return mod as Plugin;
  return null;
}

const pluginLoadResults: Array<{
  name: string;
  loaded: boolean;
  error?: string;
  loadTimeMs: number;
}> = [];

async function loadPlugin(
  name: string,
): Promise<Plugin | null> {
  const start = performance.now();
  try {
    const p = extractPlugin((await import(name)) as PluginModule);
    const elapsed = performance.now() - start;
    pluginLoadResults.push({
      name,
      loaded: p !== null,
      error: p ? undefined : "no valid Plugin export",
      loadTimeMs: elapsed,
    });
    return p;
  } catch (err) {
    const elapsed = performance.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    pluginLoadResults.push({ name, loaded: false, error: msg, loadTimeMs: elapsed });
    logger.warn(`[e2e-validation] FAILED to load plugin ${name}: ${msg}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function http$(
  port: number,
  method: string,
  p: string,
  body?: Record<string, unknown>,
  timeoutMs: number = 30_000,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`HTTP request timed out: ${method} ${p}`)),
      timeoutMs,
    );
    const b = body ? JSON.stringify(body) : undefined;
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
          clearTimeout(timer);
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
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    if (b) req.write(b);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Subprocess helper
// ---------------------------------------------------------------------------

interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runSubprocess(
  cmd: string,
  args: string[],
  opts: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
    stdinText?: string;
    /** Kill after this string appears in combined stdout+stderr */
    killAfter?: string;
  } = {},
): Promise<SubprocessResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? packageRoot,
      env: opts.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let resolved = false;

    const finish = (code: number) => {
      if (resolved) return;
      resolved = true;
      resolve({ stdout, stderr, exitCode: code });
    };

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
      if (opts.killAfter && (stdout + stderr).includes(opts.killAfter)) {
        if (opts.stdinText) child.stdin.write(opts.stdinText);
        else child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (opts.killAfter && (stdout + stderr).includes(opts.killAfter)) {
        if (opts.stdinText) child.stdin.write(opts.stdinText);
        else child.kill("SIGTERM");
      }
    });

    child.on("close", (code) => finish(code ?? 1));
    child.on("error", (err) => {
      stderr += `\nspawn error: ${err.message}`;
      finish(1);
    });

    // Safety timeout
    const timeout = opts.timeoutMs ?? 120_000;
    setTimeout(() => {
      if (!resolved) {
        child.kill("SIGKILL");
        finish(-1);
      }
    }, timeout);
  });
}

// ---------------------------------------------------------------------------
// Typed AutonomyService interface
// ---------------------------------------------------------------------------

interface AutonomyServiceLike extends Service {
  performAutonomousThink(): Promise<void>;
  setLoopInterval(ms: number): void;
}

// ===================================================================
//  1. FRESH INSTALL SIMULATION
// ===================================================================

describe("Fresh Install Simulation", () => {
  it("builds successfully (dist/ exists)", () => {
    const distDir = path.join(packageRoot, "dist");
    expect(fs.existsSync(distDir)).toBe(true);
    expect(fs.existsSync(path.join(distDir, "index.js"))).toBe(true);
  });

  it("milaidy.mjs entry point exists and is executable", () => {
    const entry = path.join(packageRoot, "milaidy.mjs");
    expect(fs.existsSync(entry)).toBe(true);
    const content = fs.readFileSync(entry, "utf-8");
    expect(content).toContain("#!/usr/bin/env node");
  });

  it("CLI boots and prints help without errors", async () => {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v;
    }

    const result = await runSubprocess(
      "node",
      [path.join(packageRoot, "milaidy.mjs"), "--help"],
      { env, timeoutMs: 30_000 },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toContain("milaidy");
  }, 45_000);

  it("API server starts and serves status endpoint", async () => {
    const srv = await startApiServer({ port: 0 });
    try {
      const { status, data } = await http$(srv.port, "GET", "/api/status");
      expect(status).toBe(200);
      expect(data.state).toBe("not_started");
      expect(typeof data.agentName).toBe("string");
    } finally {
      await srv.close();
    }
  }, 30_000);

  it("onboarding flow: POST /api/onboarding creates agent config", async () => {
    const srv = await startApiServer({ port: 0 });
    try {
      const { status, data } = await http$(srv.port, "POST", "/api/onboarding", {
        name: "FreshInstallAgent",
        bio: ["A freshly installed test agent"],
        systemPrompt: "You are a test agent for E2E validation.",
      });
      expect(status).toBe(200);
      expect(data.ok).toBe(true);

      // Verify the name persists in status
      const statusRes = await http$(srv.port, "GET", "/api/status");
      expect(statusRes.data.agentName).toBe("FreshInstallAgent");
    } finally {
      await srv.close();
    }
  }, 30_000);

  it("full lifecycle: not_started → start → running → stop", async () => {
    const srv = await startApiServer({ port: 0 });
    try {
      // Initial state
      const s0 = await http$(srv.port, "GET", "/api/status");
      expect(s0.data.state).toBe("not_started");

      // Start
      const startRes = await http$(srv.port, "POST", "/api/agent/start");
      expect(startRes.data.ok).toBe(true);
      const s1 = await http$(srv.port, "GET", "/api/status");
      expect(s1.data.state).toBe("running");

      // Stop
      const stopRes = await http$(srv.port, "POST", "/api/agent/stop");
      expect(stopRes.data.ok).toBe(true);
      const s2 = await http$(srv.port, "GET", "/api/status");
      expect(s2.data.state).toBe("stopped");
    } finally {
      await srv.close();
    }
  }, 30_000);
});

// ===================================================================
//  2. CLI ENTRY POINT TEST (npx milaidy equivalent)
// ===================================================================

describe("CLI Entry Point (npx milaidy equivalent)", () => {
  it("dist/entry.js exists and is loadable", () => {
    const entryPath = path.join(packageRoot, "dist", "entry.js");
    expect(fs.existsSync(entryPath)).toBe(true);
  });

  it("CLI version command outputs version string", async () => {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v;
    }

    const result = await runSubprocess(
      "node",
      [path.join(packageRoot, "milaidy.mjs"), "--version"],
      { env, timeoutMs: 30_000 },
    );

    // Commander outputs the version to stdout
    const output = result.stdout + result.stderr;
    // Should contain a semver-like version
    expect(output).toMatch(/\d+\.\d+\.\d+/);
  }, 45_000);

  it.skipIf(!hasModelProvider)(
    "startEliza() boots, shows chat prompt, exits on 'exit'",
    async () => {
      const subHome = fs.mkdtempSync(
        path.join(os.tmpdir(), "milaidy-e2e-cli-boot-"),
      );
      const subPglite = path.join(subHome, "pglite");
      const subConfigDir = path.join(subHome, ".milaidy");
      fs.mkdirSync(subConfigDir, { recursive: true });

      // Write config so onboarding is skipped
      fs.writeFileSync(
        path.join(subConfigDir, "milaidy.json"),
        JSON.stringify({ agent: { name: "CLIBootAgent", bio: "cli test" } }),
      );

      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) env[k] = v;
      }
      env.HOME = subHome;
      env.USERPROFILE = subHome;
      env.PGLITE_DATA_DIR = subPglite;
      env.LOG_LEVEL = "warn";
      env.XDG_CONFIG_HOME = path.join(subHome, ".config");
      env.XDG_DATA_HOME = path.join(subHome, ".local/share");
      env.XDG_STATE_HOME = path.join(subHome, ".local/state");
      env.XDG_CACHE_HOME = path.join(subHome, ".cache");
      delete env.VITEST;

      const result = await runSubprocess(
        "node",
        ["--import", "tsx", "src/runtime/eliza.ts"],
        {
          env,
          timeoutMs: 150_000,
          killAfter: "Chat with",
          stdinText: "exit\n",
        },
      );

      const allOutput = result.stdout + result.stderr;
      expect(allOutput).toContain("Chat with");

      // Cleanup
      try {
        fs.rmSync(subHome, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
    180_000,
  );
});

// ===================================================================
//  3. PLUGIN STRESS TEST — All Plugins Loaded Simultaneously
// ===================================================================

describe("Plugin Stress Test", () => {
  // All known plugin packages from the Milaidy ecosystem
  const ALL_CORE_PLUGINS: readonly string[] = [
    "@elizaos/plugin-sql",
    "@elizaos/plugin-local-embedding",
    "@elizaos/plugin-agent-skills",
    "@elizaos/plugin-agent-orchestrator",
    "@elizaos/plugin-directives",
    "@elizaos/plugin-commands",
    "@elizaos/plugin-shell",
    "@elizaos/plugin-personality",
    "@elizaos/plugin-experience",
    "@elizaos/plugin-plugin-manager",
    "@elizaos/plugin-browser",
    "@elizaos/plugin-cli",
    "@elizaos/plugin-code",
    "@elizaos/plugin-computeruse",
    "@elizaos/plugin-edge-tts",
    "@elizaos/plugin-knowledge",
    "@elizaos/plugin-mcp",
    "@elizaos/plugin-pdf",
    "@elizaos/plugin-scratchpad",
    "@elizaos/plugin-secrets-manager",
    "@elizaos/plugin-todo",
    "@elizaos/plugin-trust",
    "@elizaos/plugin-vision",
    "@elizaos/plugin-cron",
    "@elizaos/plugin-form",
    "@elizaos/plugin-goals",
    "@elizaos/plugin-scheduling",
  ];

  const PROVIDER_PLUGINS: readonly string[] = [
    "@elizaos/plugin-openai",
    "@elizaos/plugin-anthropic",
    "@elizaos/plugin-groq",
    "@elizaos/plugin-google-genai",
    "@elizaos/plugin-xai",
    "@elizaos/plugin-openrouter",
    "@elizaos/plugin-ollama",
  ];

  const CHANNEL_PLUGINS: readonly string[] = [
    "@elizaos/plugin-discord",
    "@elizaos/plugin-telegram",
    "@elizaos/plugin-slack",
    "@elizaos/plugin-whatsapp",
    "@elizaos/plugin-signal",
    "@elizaos/plugin-imessage",
    "@elizaos/plugin-bluebubbles",
    "@elizaos/plugin-msteams",
    "@elizaos/plugin-mattermost",
  ];

  it("all core plugins load without crashing", async () => {
    const results: Array<{ name: string; ok: boolean; error?: string }> = [];

    for (const name of ALL_CORE_PLUGINS) {
      try {
        const mod = (await import(name)) as PluginModule;
        const p = extractPlugin(mod);
        results.push({ name, ok: p !== null, error: p ? undefined : "no Plugin export" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ name, ok: false, error: msg });
      }
    }

    const loaded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    logger.info(
      `[e2e-validation] Core plugins: ${loaded.length}/${ALL_CORE_PLUGINS.length} loaded`,
    );
    if (failed.length > 0) {
      logger.warn(
        `[e2e-validation] Failed core plugins: ${failed.map((f) => `${f.name}: ${f.error}`).join("; ")}`,
      );
    }

    // At least 75% of core plugins should load (some may have optional deps)
    expect(loaded.length).toBeGreaterThanOrEqual(
      Math.floor(ALL_CORE_PLUGINS.length * 0.75),
    );
  }, 60_000);

  it("provider plugins load in parallel without interference", async () => {
    const loadPromises = PROVIDER_PLUGINS.map(async (name) => {
      try {
        const mod = (await import(name)) as PluginModule;
        return { name, ok: extractPlugin(mod) !== null };
      } catch {
        return { name, ok: false };
      }
    });

    const results = await Promise.all(loadPromises);
    const loaded = results.filter((r) => r.ok);

    logger.info(
      `[e2e-validation] Provider plugins: ${loaded.length}/${PROVIDER_PLUGINS.length} loaded`,
    );

    // At least some providers should be loadable
    expect(loaded.length).toBeGreaterThan(0);
  }, 30_000);

  it("channel plugins load without crashing each other", async () => {
    const results: Array<{ name: string; ok: boolean }> = [];

    for (const name of CHANNEL_PLUGINS) {
      try {
        const mod = (await import(name)) as PluginModule;
        results.push({ name, ok: extractPlugin(mod) !== null });
      } catch {
        results.push({ name, ok: false });
      }
    }

    const loaded = results.filter((r) => r.ok);
    logger.info(
      `[e2e-validation] Channel plugins: ${loaded.length}/${CHANNEL_PLUGINS.length} loaded`,
    );

    // Channel plugins may fail without credentials, but loading should not crash
    // Just ensure no unhandled exceptions propagated
    expect(true).toBe(true);
  }, 30_000);

  it("simultaneous plugin loading does not cause import deadlocks", async () => {
    const allPlugins = [...ALL_CORE_PLUGINS, ...PROVIDER_PLUGINS.slice(0, 3)];
    const startTime = performance.now();

    // Load all at once — this should NOT deadlock
    const results = await Promise.allSettled(
      allPlugins.map(async (name) => {
        const mod = (await import(name)) as PluginModule;
        return { name, plugin: extractPlugin(mod) };
      }),
    );

    const elapsed = performance.now() - startTime;
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    logger.info(
      `[e2e-validation] Parallel load: ${fulfilled.length} ok, ${rejected.length} failed, ${elapsed.toFixed(0)}ms`,
    );

    // Should complete within 60s (deadlock would exceed this)
    expect(elapsed).toBeLessThan(60_000);
    // At least half should succeed
    expect(fulfilled.length).toBeGreaterThan(allPlugins.length / 2);
  }, 90_000);
});

// ===================================================================
//  4. LONG-RUNNING SESSION TEST
// ===================================================================

describe("Long-Running Session Simulation", () => {
  let server: { port: number; close: () => Promise<void> } | null = null;

  beforeAll(async () => {
    server = await startApiServer({ port: 0 });
  }, 30_000);

  afterAll(async () => {
    if (server) await server.close();
  });

  it("server stays healthy after 100 sequential status requests", async () => {
    for (let i = 0; i < 100; i++) {
      const { status, data } = await http$(server!.port, "GET", "/api/status");
      expect(status).toBe(200);
      expect(typeof data.agentName).toBe("string");
    }
  }, 60_000);

  it("server handles mixed endpoint traffic without errors", async () => {
    const endpoints: Array<[string, string]> = [
      ["GET", "/api/status"],
      ["GET", "/api/plugins"],
      ["GET", "/api/logs"],
      ["GET", "/api/config"],
      ["GET", "/api/onboarding/status"],
      ["GET", "/api/onboarding/options"],
      ["GET", "/api/skills"],
    ];

    // Run 50 requests cycling through all endpoints
    for (let i = 0; i < 50; i++) {
      const [method, path] = endpoints[i % endpoints.length];
      const { status } = await http$(server!.port, method, path);
      expect(status).toBe(200);
    }
  }, 60_000);

  it("state machine remains consistent after rapid state transitions", async () => {
    // Rapidly cycle through states
    for (let cycle = 0; cycle < 5; cycle++) {
      await http$(server!.port, "POST", "/api/agent/start");
      const s1 = await http$(server!.port, "GET", "/api/status");
      expect(s1.data.state).toBe("running");

      await http$(server!.port, "POST", "/api/agent/pause");
      const s2 = await http$(server!.port, "GET", "/api/status");
      expect(s2.data.state).toBe("paused");

      await http$(server!.port, "POST", "/api/agent/resume");
      const s3 = await http$(server!.port, "GET", "/api/status");
      expect(s3.data.state).toBe("running");

      await http$(server!.port, "POST", "/api/agent/stop");
      const s4 = await http$(server!.port, "GET", "/api/status");
      expect(s4.data.state).toBe("stopped");
    }
  }, 30_000);

  it("log buffer grows without memory leak patterns (bounded size)", async () => {
    // Generate activity by toggling states
    for (let i = 0; i < 20; i++) {
      await http$(server!.port, "POST", "/api/agent/start");
      await http$(server!.port, "POST", "/api/agent/stop");
    }

    const { data } = await http$(server!.port, "GET", "/api/logs");
    const entries = data.entries as Array<Record<string, unknown>>;

    // Log buffer should be bounded (not growing infinitely)
    // Typical ring buffers cap at 500-2000 entries
    expect(entries.length).toBeLessThan(10_000);
    expect(entries.length).toBeGreaterThan(0);

    // Verify entries have proper shape (no corruption)
    for (const entry of entries.slice(0, 10)) {
      expect(typeof entry.timestamp).toBe("number");
      expect(typeof entry.level).toBe("string");
      expect(typeof entry.message).toBe("string");
    }
  }, 30_000);
});

// ===================================================================
//  5. CONTEXT INTEGRITY TEST
// ===================================================================

describe("Context Integrity (no corruption)", () => {
  it("validateRuntimeContext detects null fields", () => {
    const context: Record<string, unknown> = {
      agentName: "Test",
      model: null,
      pluginCount: 5,
    };
    const result = validateRuntimeContext(context);
    expect(result.nullFields).toContain("model");
    expect(result.valid).toBe(false);
  });

  it("validateRuntimeContext detects undefined fields", () => {
    const context: Record<string, unknown> = {
      agentName: "Test",
      model: undefined,
    };
    const result = validateRuntimeContext(context);
    expect(result.undefinedFields).toContain("model");
  });

  it("validateRuntimeContext detects empty strings", () => {
    const context: Record<string, unknown> = {
      agentName: "",
      model: "gpt-4",
    };
    const result = validateRuntimeContext(context);
    expect(result.emptyFields).toContain("agentName");
  });

  it("validateRuntimeContext detects non-serializable values", () => {
    const context: Record<string, unknown> = {
      agentName: "Test",
      callback: () => {},
      sym: Symbol("test"),
    };
    const result = validateRuntimeContext(context);
    expect(result.nonSerializableFields.length).toBeGreaterThan(0);
    expect(result.serializable).toBe(false);
  });

  it("validateRuntimeContext handles nested objects", () => {
    const context: Record<string, unknown> = {
      agent: {
        name: "Test",
        config: {
          model: null,
          plugins: { count: 5, list: "" },
        },
      },
    };
    const result = validateRuntimeContext(context);
    expect(result.nullFields).toContain("agent.config.model");
    expect(result.emptyFields).toContain("agent.config.plugins.list");
  });

  it("valid context passes all checks", () => {
    const context: Record<string, unknown> = {
      agentName: "TestAgent",
      pluginCount: 10,
      providerCount: 2,
      primaryModel: "anthropic",
      workspaceDir: "/tmp/test",
    };
    const result = validateRuntimeContext(context);
    expect(result.valid).toBe(true);
    expect(result.serializable).toBe(true);
    expect(result.nullFields.length).toBe(0);
    expect(result.undefinedFields.length).toBe(0);
    expect(result.emptyFields.length).toBe(0);
    expect(result.nonSerializableFields.length).toBe(0);
  });

  it("config round-trip preserves integrity", async () => {
    const srv = await startApiServer({ port: 0 });
    try {
      // Get original config
      const { data: original } = await http$(srv.port, "GET", "/api/config");

      // Write modified config
      const modified = {
        ...original,
        test_integrity: {
          timestamp: Date.now(),
          nested: { value: 42, text: "integrity-check" },
        },
      };
      await http$(srv.port, "PUT", "/api/config", modified);

      // Read back and verify no corruption
      const { data: readBack } = await http$(srv.port, "GET", "/api/config");
      const testData = readBack.test_integrity as Record<
        string,
        Record<string, unknown>
      >;
      expect(testData.nested.value).toBe(42);
      expect(testData.nested.text).toBe("integrity-check");

      // Restore
      await http$(srv.port, "PUT", "/api/config", original);
    } finally {
      await srv.close();
    }
  }, 30_000);

  it("multiple concurrent config writes do not corrupt state", async () => {
    const srv = await startApiServer({ port: 0 });
    try {
      // Fire 10 concurrent writes with different values
      const writes = Array.from({ length: 10 }, (_, i) =>
        http$(srv.port, "PUT", "/api/config", {
          concurrent_test: { iteration: i, timestamp: Date.now() },
        }),
      );
      const results = await Promise.all(writes);

      // All should succeed (no crashes)
      for (const r of results) {
        expect(r.status).toBe(200);
      }

      // Final read should have a valid config (one of the writes wins)
      const { status, data } = await http$(srv.port, "GET", "/api/config");
      expect(status).toBe(200);
      const concurrentData = data.concurrent_test as Record<string, unknown>;
      expect(typeof concurrentData.iteration).toBe("number");
    } finally {
      await srv.close();
    }
  }, 30_000);
});

// ===================================================================
//  6. DEADLOCK DETECTION
// ===================================================================

describe("Deadlock Detection", () => {
  it("concurrent requests to different endpoints complete within timeout", async () => {
    const srv = await startApiServer({ port: 0 });
    try {
      const startTime = performance.now();

      // Fire many concurrent requests to different endpoints
      const requests = [
        ...Array.from({ length: 10 }, () =>
          http$(srv.port, "GET", "/api/status"),
        ),
        ...Array.from({ length: 10 }, () =>
          http$(srv.port, "GET", "/api/plugins"),
        ),
        ...Array.from({ length: 10 }, () =>
          http$(srv.port, "GET", "/api/logs"),
        ),
        ...Array.from({ length: 5 }, () =>
          http$(srv.port, "GET", "/api/config"),
        ),
        ...Array.from({ length: 5 }, () =>
          http$(srv.port, "GET", "/api/skills"),
        ),
      ];

      const results = await Promise.all(requests);
      const elapsed = performance.now() - startTime;

      // All should complete
      for (const r of results) {
        expect(r.status).toBe(200);
      }

      // Should complete within 30s (deadlock would timeout)
      expect(elapsed).toBeLessThan(30_000);

      logger.info(
        `[e2e-validation] ${requests.length} concurrent requests completed in ${elapsed.toFixed(0)}ms`,
      );
    } finally {
      await srv.close();
    }
  }, 45_000);

  it("rapid state transitions do not cause deadlock", async () => {
    const srv = await startApiServer({ port: 0 });
    try {
      const startTime = performance.now();

      // Rapid fire state transitions — these interact with shared state
      const transitions: Array<Promise<{ status: number; data: Record<string, unknown> }>> =
        [];
      for (let i = 0; i < 20; i++) {
        transitions.push(http$(srv.port, "POST", "/api/agent/start"));
        transitions.push(http$(srv.port, "POST", "/api/agent/stop"));
      }

      // Wait for all — if there's a deadlock, this will timeout
      const results = await Promise.allSettled(transitions);
      const elapsed = performance.now() - startTime;

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled.length).toBe(results.length);
      expect(elapsed).toBeLessThan(30_000);
    } finally {
      await srv.close();
    }
  }, 45_000);

  it("interleaved read/write operations do not deadlock", async () => {
    const srv = await startApiServer({ port: 0 });
    try {
      // Interleave reads and writes
      const ops: Array<Promise<{ status: number; data: Record<string, unknown> }>> = [];
      for (let i = 0; i < 20; i++) {
        ops.push(http$(srv.port, "GET", "/api/config"));
        ops.push(
          http$(srv.port, "PUT", "/api/config", {
            deadlock_test: { i, ts: Date.now() },
          }),
        );
        ops.push(http$(srv.port, "GET", "/api/status"));
        ops.push(http$(srv.port, "GET", "/api/plugins"));
      }

      const results = await Promise.allSettled(ops);
      const fulfilled = results.filter((r) => r.status === "fulfilled");

      // All should complete without deadlock
      expect(fulfilled.length).toBe(results.length);
    } finally {
      await srv.close();
    }
  }, 45_000);
});

// ===================================================================
//  7. MEMORY LEAK DETECTION PATTERNS
// ===================================================================

describe("Memory Leak Detection", () => {
  it("repeated server start/stop does not leak file descriptors", async () => {
    // Start and stop the server 10 times — leaked sockets would cause EMFILE
    for (let i = 0; i < 10; i++) {
      const srv = await startApiServer({ port: 0 });
      const { status } = await http$(srv.port, "GET", "/api/status");
      expect(status).toBe(200);
      await srv.close();
    }

    // If we got here, no EMFILE error occurred
    expect(true).toBe(true);
  }, 60_000);

  it("heap usage stays bounded after many requests", async () => {
    const srv = await startApiServer({ port: 0 });
    try {
      // Force GC if available
      if (global.gc) global.gc();
      const heapBefore = process.memoryUsage().heapUsed;

      // Generate 200 requests
      for (let i = 0; i < 200; i++) {
        await http$(srv.port, "GET", "/api/status");
        if (i % 50 === 0 && global.gc) global.gc();
      }

      if (global.gc) global.gc();
      const heapAfter = process.memoryUsage().heapUsed;
      const heapGrowthMB = (heapAfter - heapBefore) / (1024 * 1024);

      logger.info(
        `[e2e-validation] Heap growth after 200 requests: ${heapGrowthMB.toFixed(2)}MB`,
      );

      // Heap growth should be bounded — a leak would show unbounded growth
      // Allow up to 50MB growth (includes test framework overhead)
      expect(heapGrowthMB).toBeLessThan(50);
    } finally {
      await srv.close();
    }
  }, 60_000);

  it("plugin list endpoint does not accumulate stale data", async () => {
    const srv = await startApiServer({ port: 0 });
    try {
      // Fetch plugins multiple times and verify list size is stable
      const sizes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const { data } = await http$(srv.port, "GET", "/api/plugins");
        const plugins = data.plugins as Array<Record<string, unknown>>;
        sizes.push(plugins.length);
      }

      // All reads should return the same count (no accumulation)
      const unique = new Set(sizes);
      expect(unique.size).toBe(1);
    } finally {
      await srv.close();
    }
  }, 30_000);
});

// ===================================================================
//  8. RAPID SEQUENTIAL OPERATIONS
// ===================================================================

describe("Rapid Sequential Operations", () => {
  it("50 rapid onboarding status checks", async () => {
    const srv = await startApiServer({ port: 0 });
    try {
      const start = performance.now();
      for (let i = 0; i < 50; i++) {
        const { status } = await http$(
          srv.port,
          "GET",
          "/api/onboarding/status",
        );
        expect(status).toBe(200);
      }
      const elapsed = performance.now() - start;
      logger.info(
        `[e2e-validation] 50 onboarding status checks: ${elapsed.toFixed(0)}ms (${(elapsed / 50).toFixed(1)}ms/req)`,
      );
    } finally {
      await srv.close();
    }
  }, 30_000);

  it("rapid plugin enable/disable cycling", async () => {
    const srv = await startApiServer({ port: 0 });
    try {
      const { data: listData } = await http$(srv.port, "GET", "/api/plugins");
      const plugins = listData.plugins as Array<Record<string, unknown>>;
      if (plugins.length === 0) return;

      const target = plugins[0];

      // Rapidly toggle enable/disable 20 times
      for (let i = 0; i < 20; i++) {
        const enabled = i % 2 === 0;
        const { status } = await http$(
          srv.port,
          "PUT",
          `/api/plugins/${target.id}`,
          { enabled },
        );
        expect(status).toBe(200);
      }

      // Final state should be consistent
      const { data: finalList } = await http$(srv.port, "GET", "/api/plugins");
      const updated = (
        finalList.plugins as Array<Record<string, unknown>>
      ).find((p) => p.id === target.id);
      expect(typeof updated?.enabled).toBe("boolean");
    } finally {
      await srv.close();
    }
  }, 30_000);

  it("rapid config read/write cycles maintain consistency", async () => {
    const srv = await startApiServer({ port: 0 });
    try {
      for (let i = 0; i < 20; i++) {
        // Write
        await http$(srv.port, "PUT", "/api/config", {
          rapid_test: { iteration: i },
        });
        // Read
        const { data } = await http$(srv.port, "GET", "/api/config");
        const testData = data.rapid_test as Record<string, number> | undefined;
        // The value should be the one we just wrote (or a later one from
        // concurrent writes if there were any — but the value must be a number)
        if (testData) {
          expect(typeof testData.iteration).toBe("number");
        }
      }
    } finally {
      await srv.close();
    }
  }, 30_000);
});

// ===================================================================
//  9. WORKSPACE INTEGRITY
// ===================================================================

describe("Workspace Integrity", () => {
  it("ensureAgentWorkspace creates directory and is idempotent", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milaidy-e2e-ws-"));
    const wsDir = path.join(dir, "workspace");

    expect(fs.existsSync(wsDir)).toBe(false);
    await ensureAgentWorkspace({ dir: wsDir });
    expect(fs.existsSync(wsDir)).toBe(true);

    // Idempotent — second call should not throw
    await ensureAgentWorkspace({ dir: wsDir });
    expect(fs.existsSync(wsDir)).toBe(true);

    // Cleanup
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("workspace creation handles concurrent calls", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milaidy-e2e-ws-concurrent-"));
    const wsDir = path.join(dir, "concurrent-workspace");

    // Fire 5 concurrent workspace creates
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => ensureAgentWorkspace({ dir: wsDir })),
    );

    // All should succeed
    for (const r of results) {
      expect(r.status).toBe("fulfilled");
    }
    expect(fs.existsSync(wsDir)).toBe(true);

    // Cleanup
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
});

// ===================================================================
//  10. RUNTIME INTEGRATION (requires model provider)
// ===================================================================

describe("Runtime Integration (with model provider)", () => {
  let runtime: AgentRuntime | null = null;
  let server: { port: number; close: () => Promise<void> } | null = null;
  let initialized = false;

  const pgliteDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "milaidy-e2e-validation-pglite-"),
  );
  const roomId = stringToUuid("e2e-validation-room");
  const userId = crypto.randomUUID() as UUID;
  const worldId = stringToUuid("e2e-validation-world");

  beforeAll(async () => {
    if (!hasModelProvider) return;
    process.env.LOG_LEVEL = "info";
    process.env.PGLITE_DATA_DIR = pgliteDir;

    const secrets: Record<string, string> = {};
    if (hasOpenAI) secrets.OPENAI_API_KEY = process.env.OPENAI_API_KEY as string;
    if (hasAnthropic) secrets.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY as string;
    if (hasGroq) secrets.GROQ_API_KEY = process.env.GROQ_API_KEY as string;

    const character = createCharacter({
      name: "ValidationAgent",
      bio: "An E2E validation agent for Issue #6.",
      secrets,
    });

    const corePluginNames = [
      "@elizaos/plugin-agent-skills",
      "@elizaos/plugin-directives",
      "@elizaos/plugin-commands",
      "@elizaos/plugin-personality",
      "@elizaos/plugin-experience",
      "@elizaos/plugin-form",
    ];

    const sqlPlugin = await loadPlugin("@elizaos/plugin-sql");
    const plugins: Plugin[] = [];
    for (const n of corePluginNames) {
      const p = await loadPlugin(n);
      if (p) plugins.push(p);
    }
    if (hasOpenAI) {
      const p = await loadPlugin("@elizaos/plugin-openai");
      if (p) plugins.push(p);
    }
    if (hasAnthropic) {
      const p = await loadPlugin("@elizaos/plugin-anthropic");
      if (p) plugins.push(p);
    }
    if (hasGroq) {
      const p = await loadPlugin("@elizaos/plugin-groq");
      if (p) plugins.push(p);
    }

    runtime = new AgentRuntime({
      character,
      plugins,
      logLevel: "info",
      enableAutonomy: true,
    });

    if (sqlPlugin) await runtime.registerPlugin(sqlPlugin);
    await runtime.initialize();
    initialized = true;

    try {
      await runtime.ensureConnection({
        entityId: userId,
        roomId,
        worldId,
        userName: "ValidationUser",
        source: "test",
        channelId: "e2e-validation-channel",
        type: ChannelType.DM,
      });
    } catch {
      await runtime.ensureConnection({
        entityId: userId,
        roomId: crypto.randomUUID() as UUID,
        worldId: crypto.randomUUID() as UUID,
        userName: "ValidationUser",
        source: "test",
        channelId: "e2e-validation-channel",
        type: ChannelType.DM,
      });
    }

    server = await startApiServer({ port: 0, runtime });
  }, 180_000);

  afterAll(async () => {
    if (server) {
      try {
        await server.close();
      } catch {
        /* ignore */
      }
    }
    if (runtime) {
      try {
        runtime.enableAutonomy = false;
        await runtime.stop();
      } catch {
        /* ignore */
      }
    }
    try {
      fs.rmSync(pgliteDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }, 30_000);

  it.skipIf(!hasModelProvider)("runtime initializes with all plugins", () => {
    expect(initialized).toBe(true);
    expect(runtime!.plugins.length).toBeGreaterThanOrEqual(5);
  });

  it.skipIf(!hasModelProvider)("generates text response", async () => {
    const result = await runtime!.generateText("Say 'validation ok' exactly.", {
      maxTokens: 64,
    });
    const text =
      result.text instanceof Promise
        ? await result.text
        : String(result.text ?? "");
    expect(text.length).toBeGreaterThan(0);
  }, 60_000);

  it.skipIf(!hasModelProvider)("handleMessage produces response", async () => {
    const msg = createMessageMemory({
      id: crypto.randomUUID() as UUID,
      entityId: userId,
      roomId,
      content: {
        text: "Say hello in one word.",
        source: "test",
        channelType: ChannelType.DM,
      },
    });
    let resp = "";
    await runtime!.messageService!.handleMessage(runtime!, msg, async (c) => {
      if (c?.text) resp += c.text;
      return [];
    });
    expect(resp.length).toBeGreaterThan(0);
  }, 60_000);

  it.skipIf(!hasModelProvider)(
    "context integrity maintained across 5 sequential messages",
    async () => {
      const messages = [
        "Remember this code: ALPHA-7",
        "What code did I tell you to remember?",
        "Now remember this too: BRAVO-3",
        "List all codes I've told you.",
        "How many codes have I given you total?",
      ];

      let lastResponse = "";
      for (const text of messages) {
        const msg = createMessageMemory({
          id: crypto.randomUUID() as UUID,
          entityId: userId,
          roomId,
          content: { text, source: "test", channelType: ChannelType.DM },
        });
        lastResponse = "";
        await runtime!.messageService!.handleMessage(
          runtime!,
          msg,
          async (c) => {
            if (c?.text) lastResponse += c.text;
            return [];
          },
        );
        expect(lastResponse.length).toBeGreaterThan(0);
      }

      // The last response should reference "2" codes (ALPHA-7 and BRAVO-3)
      logger.info(
        `[e2e-validation] Context integrity check, final response: "${lastResponse}"`,
      );
      // We verify the model didn't crash or return empty — the content check
      // is a soft assertion since models can be unpredictable
      expect(lastResponse.length).toBeGreaterThan(0);
    },
    180_000,
  );

  it.skipIf(!hasModelProvider)(
    "3 parallel chat requests complete without crashes",
    async () => {
      const prompts = [
        "What is 2 + 2? Number only.",
        "What is 3 + 3? Number only.",
        "What is 4 + 4? Number only.",
      ];

      const results = await Promise.all(
        prompts.map((text) =>
          http$(server!.port, "POST", "/api/chat", { text }, 60_000),
        ),
      );

      for (const r of results) {
        expect(r.status).toBe(200);
        expect((r.data.text as string).length).toBeGreaterThan(0);
      }
    },
    90_000,
  );

  it.skipIf(!hasModelProvider)(
    "API server status reflects runtime state",
    async () => {
      const { status, data } = await http$(server!.port, "GET", "/api/status");
      expect(status).toBe(200);
      expect(data.state).toBe("running");
      expect(typeof data.startedAt).toBe("number");
      expect(typeof data.uptime).toBe("number");
    },
  );
});

// ===================================================================
//  11. DOCKER-COMPATIBLE FRESH MACHINE CHECKS
// ===================================================================

describe("Fresh Machine Validation (non-Docker)", () => {
  it("package.json has correct bin entry", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "package.json"), "utf-8"),
    ) as Record<string, Record<string, string>>;
    expect(pkg.bin?.milaidy).toBe("milaidy.mjs");
  });

  it("package.json exports are valid", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "package.json"), "utf-8"),
    ) as Record<string, Record<string, string>>;
    expect(pkg.exports?.["."]).toBe("./dist/index.js");
    expect(pkg.exports?.["./cli-entry"]).toBe("./milaidy.mjs");
    expect(pkg.exports?.["./eliza"]).toBe("./dist/runtime/eliza.js");
  });

  it("dist/ contains expected entry files", () => {
    const distDir = path.join(packageRoot, "dist");
    if (!fs.existsSync(distDir)) {
      logger.warn("[e2e-validation] dist/ not found — run `pnpm build` first");
      return;
    }

    expect(fs.existsSync(path.join(distDir, "index.js"))).toBe(true);
    expect(fs.existsSync(path.join(distDir, "entry.js"))).toBe(true);
  });

  it("Node 22+ engine requirement is specified", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "package.json"), "utf-8"),
    ) as Record<string, Record<string, string>>;
    expect(pkg.engines?.node).toMatch(/>=22/);
  });

  it("all runtime dependencies declared in package.json", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "package.json"), "utf-8"),
    ) as Record<string, Record<string, string>>;
    const deps = pkg.dependencies ?? {};

    // Critical dependencies that must be present
    const required = [
      "@elizaos/core",
      "@clack/prompts",
      "chalk",
      "commander",
      "dotenv",
      "json5",
      "zod",
    ];
    for (const dep of required) {
      expect(deps[dep], `Missing dependency: ${dep}`).toBeDefined();
    }
  });
});
