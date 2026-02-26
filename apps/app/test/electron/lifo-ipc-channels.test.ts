import { describe, expect, it } from "vitest";
import {
  isKnownIpcChannel,
  KNOWN_IPC_CHANNELS,
} from "../../electron/src/native/ipc-channels";

describe("lifo ipc channels", () => {
  it("registers lifo pip channels as known ipc channels", () => {
    expect(KNOWN_IPC_CHANNELS).toContain("lifo:setPip");
    expect(KNOWN_IPC_CHANNELS).toContain("lifo:getPipState");
    expect(isKnownIpcChannel("lifo:setPip")).toBe(true);
    expect(isKnownIpcChannel("lifo:getPipState")).toBe(true);
  });
});
