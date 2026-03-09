// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  COMMAND_PALETTE_EVENT,
  EMOTE_PICKER_EVENT,
  STOP_EMOTE_EVENT,
  AGENT_READY_EVENT,
  BRIDGE_READY_EVENT,
  SHARE_TARGET_EVENT,
  TRAY_ACTION_EVENT,
  APP_RESUME_EVENT,
  APP_PAUSE_EVENT,
  CONNECT_EVENT,
  VOICE_CONFIG_UPDATED_EVENT,
  SELF_STATUS_SYNC_EVENT,
  dispatchMiladyEvent,
  dispatchWindowEvent,
} from "../../src/events";

describe("event constants", () => {
  it("exports all expected milady:* event names", () => {
    expect(COMMAND_PALETTE_EVENT).toBe("milady:command-palette");
    expect(EMOTE_PICKER_EVENT).toBe("milady:emote-picker");
    expect(STOP_EMOTE_EVENT).toBe("milady:stop-emote");
    expect(AGENT_READY_EVENT).toBe("milady:agent-ready");
    expect(BRIDGE_READY_EVENT).toBe("milady:bridge-ready");
    expect(SHARE_TARGET_EVENT).toBe("milady:share-target");
    expect(TRAY_ACTION_EVENT).toBe("milady:tray-action");
    expect(APP_RESUME_EVENT).toBe("milady:app-resume");
    expect(APP_PAUSE_EVENT).toBe("milady:app-pause");
    expect(CONNECT_EVENT).toBe("milady:connect");
    expect(VOICE_CONFIG_UPDATED_EVENT).toBe("milady:voice-config-updated");
    expect(SELF_STATUS_SYNC_EVENT).toBe("milady:self-status-refresh");
  });
});

describe("dispatchMiladyEvent", () => {
  it("dispatches a CustomEvent on document", () => {
    const handler = vi.fn();
    document.addEventListener(COMMAND_PALETTE_EVENT, handler);
    dispatchMiladyEvent(COMMAND_PALETTE_EVENT);
    expect(handler).toHaveBeenCalledTimes(1);
    document.removeEventListener(COMMAND_PALETTE_EVENT, handler);
  });

  it("includes detail when provided", () => {
    const handler = vi.fn();
    document.addEventListener(AGENT_READY_EVENT, handler);
    dispatchMiladyEvent(AGENT_READY_EVENT, { state: "running" });
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ state: "running" });
    document.removeEventListener(AGENT_READY_EVENT, handler);
  });
});

describe("dispatchWindowEvent", () => {
  it("dispatches a CustomEvent on window", () => {
    const handler = vi.fn();
    window.addEventListener(VOICE_CONFIG_UPDATED_EVENT, handler);
    dispatchWindowEvent(VOICE_CONFIG_UPDATED_EVENT, { provider: "test" });
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ provider: "test" });
    window.removeEventListener(VOICE_CONFIG_UPDATED_EVENT, handler);
  });
});
