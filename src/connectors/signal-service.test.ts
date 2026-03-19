import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import signalPlugin, {
  signalPlugin as namedSignalPlugin,
} from "@elizaos/plugin-signal";
import { SignalNativeService } from "@elizaos/plugin-signal/service";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createRuntime(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "00000000-0000-0000-0000-000000000001",
    getSetting: vi.fn().mockReturnValue(undefined),
    getService: vi.fn().mockReturnValue(null),
    registerSendHandler: vi.fn(),
    ensureConnection: vi.fn().mockResolvedValue(undefined),
    createMemory: vi.fn().mockResolvedValue(undefined),
    emitEvent: vi.fn().mockResolvedValue(undefined),
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    ...overrides,
  };
}

describe("signalPlugin", () => {
  it("exports the expected plugin shape", () => {
    expect(signalPlugin).toBe(namedSignalPlugin);
    expect(signalPlugin.name).toBe("signal");
    expect(signalPlugin.description).toContain("Signal");
    expect(signalPlugin.actions?.map((action) => action.name)).toEqual([
      "SEND_SIGNAL_MESSAGE",
    ]);
    expect(signalPlugin.services).toHaveLength(1);
    expect(signalPlugin.services?.[0]).toBe(SignalNativeService);
    expect(typeof signalPlugin.init).toBe("function");
  });
});

describe("SignalNativeService", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "signal-native-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("registers the signal send handler", () => {
    const runtime = createRuntime();
    const service = new SignalNativeService(runtime as never);

    SignalNativeService.registerSendHandlers(runtime as never, service);

    expect(runtime.registerSendHandler).toHaveBeenCalledTimes(1);
    expect(runtime.registerSendHandler.mock.calls[0][0]).toBe("signal");
    expect(typeof runtime.registerSendHandler.mock.calls[0][1]).toBe(
      "function",
    );
    expect(runtime.logger.info).toHaveBeenCalledWith(
      "[signal] Registered send handler",
    );
  });

  it("stops the registered runtime service", async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const runtime = createRuntime({
      getService: vi.fn().mockReturnValue({ stop }),
    });

    await SignalNativeService.stopRuntime(runtime as never);

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("warns when no auth directory exists", async () => {
    const authDir = path.join(tmpDir, "missing-auth");
    const runtime = createRuntime({
      getSetting: vi.fn().mockReturnValue(authDir),
    });
    const service = new SignalNativeService(runtime as never);

    await service.initialize();

    expect(runtime.logger.warn).toHaveBeenCalledWith(
      `[signal] No auth data at ${authDir}. Pair via QR code first.`,
    );
    expect(service.connected).toBe(false);
  });

  it("throws when sending while disconnected", async () => {
    const runtime = createRuntime();
    const service = new SignalNativeService(runtime as never);

    await expect(
      service.handleSendMessage(
        runtime as never,
        { channelId: "+14155551234" },
        { text: "hello" },
      ),
    ).rejects.toThrow(
      "Signal is not connected. Link as secondary device via QR code first.",
    );
  });

  it("sends text through the native client when connected", async () => {
    const runtime = createRuntime();
    const service = new SignalNativeService(runtime as never);
    const native = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };

    (service as { native: typeof native }).native = native;
    (service as { connected: boolean }).connected = true;
    (service as { authDir: string }).authDir = path.join(tmpDir, "signal-auth");

    await service.handleSendMessage(
      runtime as never,
      { entityId: "uuid-123" },
      { text: "hello" },
    );

    expect(native.sendMessage).toHaveBeenCalledWith(
      path.join(tmpDir, "signal-auth"),
      "uuid-123",
      "hello",
    );
    expect(runtime.logger.debug).toHaveBeenCalledWith(
      "[signal] Sent message to uuid-123",
    );
  });

  it("routes inbound messages through the elizaOS messaging API and reply callback", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const runtime = createRuntime({
      elizaOS: { sendMessage },
    });
    const service = new SignalNativeService(runtime as never);
    const native = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };

    (service as { native: typeof native }).native = native;
    (service as { authDir: string }).authDir = path.join(tmpDir, "signal-auth");

    await (
      service as {
        handleIncomingMessage: (msg: {
          senderUuid: string;
          text: string;
          timestamp: number;
        }) => Promise<void>;
      }
    ).handleIncomingMessage({
      senderUuid: "uuid-abc",
      text: "hello agent",
      timestamp: 123,
    });

    expect(runtime.ensureConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        userName: "uuid-abc",
        source: "signal",
        channelId: "uuid-abc",
        worldName: "Signal",
      }),
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const [, memory, opts] = sendMessage.mock.calls[0];
    expect(memory.content).toEqual(
      expect.objectContaining({
        text: "hello agent",
        source: "signal",
        channelType: "DM",
      }),
    );

    const replies = await opts.onResponse({ text: "reply from agent" });
    expect(native.sendMessage).toHaveBeenCalledWith(
      path.join(tmpDir, "signal-auth"),
      "uuid-abc",
      "reply from agent",
    );
    expect(runtime.createMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          text: "reply from agent",
          source: "signal",
          channelType: "DM",
        }),
      }),
      "messages",
    );
    expect(replies).toHaveLength(1);
  });

  it("falls back to MESSAGE_RECEIVED events when no message pipeline is available", async () => {
    const runtime = createRuntime();
    const service = new SignalNativeService(runtime as never);

    await (
      service as {
        handleIncomingMessage: (msg: {
          senderUuid: string;
          text: string;
          timestamp: number;
        }) => Promise<void>;
      }
    ).handleIncomingMessage({
      senderUuid: "uuid-fallback",
      text: "hello fallback",
      timestamp: 456,
    });

    expect(runtime.emitEvent).toHaveBeenCalledWith(["MESSAGE_RECEIVED"], {
      runtime,
      message: expect.objectContaining({
        content: expect.objectContaining({
          text: "hello fallback",
          source: "signal",
        }),
      }),
      callback: expect.any(Function),
      source: "signal",
    });
  });

  it("stops the native receive loop when shutting down", async () => {
    const runtime = createRuntime();
    const service = new SignalNativeService(runtime as never);
    const authDir = path.join(tmpDir, "signal-auth");
    mkdirSync(authDir, { recursive: true });
    const native = {
      stopReceiving: vi.fn().mockResolvedValue(undefined),
    };

    (service as { native: typeof native }).native = native;
    (service as { authDir: string }).authDir = authDir;
    (service as { connected: boolean }).connected = true;

    await service.stop();

    expect(native.stopReceiving).toHaveBeenCalledWith(authDir);
    expect(service.connected).toBe(false);
    expect(runtime.logger.info).toHaveBeenCalledWith(
      "[signal] Service stopped",
    );
  });
});
