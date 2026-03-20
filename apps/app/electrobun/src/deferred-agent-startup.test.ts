import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural tests to verify the desktop startup flow.
 * The main process now starts the embedded agent in local mode because
 * the renderer skips the deferred RPC path once an API base is injected.
 */

const INDEX_PATH = path.resolve(__dirname, "index.ts");

describe("deferred agent startup (desktop)", () => {
  const source = fs.readFileSync(INDEX_PATH, "utf8");

  it("starts the embedded agent automatically in local mode", () => {
    expect(source).toContain('else if (rt.mode === "local")');
    expect(source).toContain(
      'console.log("[Main] Starting embedded agent (local mode).");',
    );
    expect(source).toContain("_startAgent(currentWindow).catch((err) => {");
    expect(source).toContain(
      'console.error("[Main] Agent auto-start failed:", err);',
    );
  });

  it("still injects external API base immediately when configured", () => {
    expect(source).toContain('rt.mode === "external"');
    expect(source).toContain("pushApiBaseToRenderer");
  });

  it("preserves the agentStart RPC handler for renderer-triggered startup", () => {
    const handlersPath = path.resolve(__dirname, "rpc-handlers.ts");
    const handlers = fs.readFileSync(handlersPath, "utf8");
    expect(handlers).toContain("agentStart:");
    expect(handlers).toContain("agent.start()");
  });

  it("preserves onStatusChange callback for dynamic API base injection", () => {
    expect(source).toContain("onStatusChange");
    expect(source).toContain("injectApiBase");
  });
});
