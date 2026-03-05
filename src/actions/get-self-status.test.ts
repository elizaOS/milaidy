/**
 * Unit tests for the GET_SELF_STATUS action.
 *
 * Verifies on-demand detail retrieval from the AwarenessRegistry,
 * parameter defaults, error handling, and action metadata.
 */

import type { HandlerOptions } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AwarenessRegistry,
  setGlobalAwarenessRegistry,
} from "../awareness/registry";
import { getSelfStatusAction } from "./get-self-status";

function mockRuntime(registry: AwarenessRegistry) {
  return {
    getService: vi.fn((name: string) => {
      if (name === "AWARENESS_REGISTRY") return registry;
      return null;
    }),
  } as unknown as Parameters<typeof getSelfStatusAction.handler>[0];
}

describe("GET_SELF_STATUS action", () => {
  beforeEach(() => {
    setGlobalAwarenessRegistry(null as never);
  });

  it("has correct name", () => {
    expect(getSelfStatusAction.name).toBe("GET_SELF_STATUS");
  });

  it("validates successfully", async () => {
    const result = await getSelfStatusAction.validate(
      {} as never,
      {} as never,
      {} as never,
    );
    expect(result).toBe(true);
  });

  it("returns detail for a specific module", async () => {
    const registry = new AwarenessRegistry();
    registry.register({
      id: "wallet",
      position: 30,
      trusted: true,
      summary: async () => "Wallet: test",
      detail: async (_rt, level) =>
        level === "brief" ? "Wallet brief info" : "Wallet full info",
    });
    const rt = mockRuntime(registry);
    const result = await getSelfStatusAction.handler(
      rt,
      {} as never,
      {} as never,
      {
        parameters: { module: "wallet", detailLevel: "brief" },
      } as HandlerOptions,
    );
    expect(result?.text).toBe("Wallet brief info");
    expect(result?.success).toBe(true);
  });

  it("defaults to module=all, detailLevel=brief", async () => {
    const registry = new AwarenessRegistry();
    registry.register({
      id: "test",
      position: 10,
      trusted: true,
      summary: async () => "test",
      detail: async () => "test detail",
    });
    const rt = mockRuntime(registry);
    const result = await getSelfStatusAction.handler(
      rt,
      {} as never,
      {} as never,
      { parameters: {} } as HandlerOptions,
    );
    expect(result?.text).toContain("test detail");
  });

  it("returns error when registry not available", async () => {
    const rt = { getService: vi.fn(() => null) } as unknown as Parameters<
      typeof getSelfStatusAction.handler
    >[0];
    const result = await getSelfStatusAction.handler(
      rt,
      {} as never,
      {} as never,
      { parameters: {} } as HandlerOptions,
    );
    expect(result?.success).toBe(false);
  });

  it("has similes for natural language matching", () => {
    expect(getSelfStatusAction.similes).toBeDefined();
    expect(getSelfStatusAction.similes?.length).toBeGreaterThan(0);
  });

  it("has parameter definitions", () => {
    expect(getSelfStatusAction.parameters).toBeDefined();
    expect(getSelfStatusAction.parameters?.length).toBe(2);
  });
});
