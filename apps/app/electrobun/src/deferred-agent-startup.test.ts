import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural tests to verify the deferred agent startup pattern.
 * The agent must NOT start automatically on desktop boot — it should
 * only start after onboarding completes via the agentStart RPC handler.
 */

const INDEX_PATH = path.resolve(__dirname, "index.ts");

describe("deferred agent startup (desktop)", () => {
  const source = fs.readFileSync(INDEX_PATH, "utf8");

  it("does NOT call startAgent unconditionally on boot", () => {
    // The old pattern was: void startAgent(currentWindow);
    // This should no longer appear as an unconditional call in main()
    const lines = source.split("\n");
    const mainFnStart = lines.findIndex((l) =>
      l.includes("async function main()"),
    );
    const mainFnBody = lines.slice(mainFnStart).join("\n");

    // Should NOT have void startAgent(currentWindow) in main()
    expect(mainFnBody).not.toMatch(
      /void\s+startAgent\s*\(\s*currentWindow\s*\)/,
    );
  });

  it("has a comment explaining deferred startup", () => {
    expect(source).toContain(
      "Agent startup is now deferred until after onboarding completes",
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
