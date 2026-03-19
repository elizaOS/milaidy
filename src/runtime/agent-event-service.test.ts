import { AgentEventService } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import {
  AGENT_EVENT_SERVICE_TYPES,
  getAgentEventService,
} from "./agent-event-service";
import { createMiladyPlugin } from "./milady-plugin";

describe("getAgentEventService", () => {
  it("prefers the canonical lowercase service type", () => {
    const lowercaseService = { name: "lowercase" };
    const runtime = {
      getService: vi.fn((serviceType: string) => {
        if (serviceType === "agent_event") return lowercaseService;
        return null;
      }),
    };

    expect(getAgentEventService(runtime)).toBe(lowercaseService);
    expect(runtime.getService).toHaveBeenCalledWith("agent_event");
  });

  it("falls back to the legacy uppercase service type", () => {
    const uppercaseService = { name: "uppercase" };
    const runtime = {
      getService: vi.fn((serviceType: string) => {
        if (serviceType === "AGENT_EVENT") return uppercaseService;
        return null;
      }),
    };

    expect(getAgentEventService(runtime)).toBe(uppercaseService);
    expect(
      runtime.getService.mock.calls.map(([serviceType]) => serviceType),
    ).toEqual([...AGENT_EVENT_SERVICE_TYPES]);
  });

  it("returns null when no agent-event service is registered", () => {
    const runtime = {
      getService: vi.fn(() => null),
    };

    expect(getAgentEventService(runtime)).toBeNull();
  });
});

describe("createMiladyPlugin", () => {
  it("registers the core AgentEventService", () => {
    const plugin = createMiladyPlugin();

    expect(plugin.services).toContain(AgentEventService);
  });

  it("exposes emote IDs via the PLAY_EMOTE action parameter enum, not a provider", () => {
    const plugin = createMiladyPlugin();

    // Emote provider should no longer exist — IDs moved to action param enum
    const emoteProvider = plugin.providers?.find(
      (provider) => provider.name === "emotes",
    );
    expect(emoteProvider).toBeUndefined();

    // PLAY_EMOTE action should have an enum with emote IDs
    const emoteAction = plugin.actions?.find(
      (action) => action.name === "PLAY_EMOTE",
    );
    expect(emoteAction).toBeDefined();

    const emoteParam = emoteAction?.parameters?.find((p) => p.name === "emote");
    expect(emoteParam).toBeDefined();

    const schema = emoteParam?.schema as { type: string; enum?: string[] };
    expect(schema.enum).toBeDefined();
    expect(schema.enum).toContain("wave");
    expect(schema.enum).toContain("dance-happy");
    expect(schema.enum).not.toContain("idle");
    expect(schema.enum).not.toContain("run");
    expect(schema.enum).not.toContain("walk");
  });

  it("honours DISABLE_EMOTES by removing PLAY_EMOTE at init", async () => {
    const plugin = createMiladyPlugin();
    const runtime = {
      character: { settings: { DISABLE_EMOTES: true } },
      getService: vi.fn(() => null),
      getTaskWorker: vi.fn(() => null),
      registerTaskWorker: vi.fn(),
    };

    // Call init to trigger DISABLE_EMOTES check
    await plugin.init?.({}, runtime as never);

    const emoteAction = plugin.actions?.find(
      (action) => action.name === "PLAY_EMOTE",
    );
    expect(emoteAction).toBeUndefined();
  });
});
