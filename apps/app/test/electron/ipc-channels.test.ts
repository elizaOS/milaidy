import { describe, expect, it } from "vitest";
import {
  isKnownIpcChannel,
  isRuntimeBridgeIpcChannel,
  isValidIpcChannel,
} from "../../electron/src/native/ipc-channels";

describe("ipc channel validation", () => {
  it("accepts known static channels", () => {
    expect(isKnownIpcChannel("agent:start")).toBe(true);
    expect(isValidIpcChannel("agent:start")).toBe(true);
  });

  it("accepts runtime bridge channels", () => {
    expect(isRuntimeBridgeIpcChannel("room-agent")).toBe(true);
    expect(isRuntimeBridgeIpcChannel("event-room-agent")).toBe(true);
    expect(isRuntimeBridgeIpcChannel("event-add-room")).toBe(true);
    expect(isRuntimeBridgeIpcChannel("event-remove-room-agent")).toBe(true);
    expect(isValidIpcChannel("room-agent")).toBe(true);
  });

  it("rejects invalid channels", () => {
    expect(isKnownIpcChannel("agent/invalid")).toBe(false);
    expect(isRuntimeBridgeIpcChannel("plainchannel")).toBe(false);
    expect(isValidIpcChannel("plainchannel")).toBe(false);
  });
});
