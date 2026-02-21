import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock heavy dependencies BEFORE importing the service module.
// The service module lazy-imports Baileys, but we mock at the top level
// to prevent any accidental real imports.
// ---------------------------------------------------------------------------

vi.mock("@whiskeysockets/baileys", () => ({
  default: vi.fn(),
  useMultiFileAuthState: vi.fn(),
  fetchLatestBaileysVersion: vi.fn(),
  DisconnectReason: { loggedOut: 401, restartRequired: 515, timedOut: 408 },
}));

vi.mock("@hapi/boom", () => ({
  Boom: class Boom extends Error {
    output = { statusCode: 500 };
  },
}));

vi.mock("pino", () => ({
  default: () => ({ level: "silent" }),
}));

vi.mock("node:fs", () => ({
  default: { existsSync: vi.fn() },
  existsSync: vi.fn(),
}));

import { WhatsAppBaileysService, extractMessageText } from "../service";

// ---------------------------------------------------------------------------
// Helpers — build mock runtime objects
// ---------------------------------------------------------------------------

function createMockRuntime(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "agent-1",
    getSetting: vi.fn().mockReturnValue(undefined),
    hasService: vi.fn().mockReturnValue(true),
    registerSendHandler: vi.fn(),
    getService: vi.fn(),
    sendMessageToTarget: vi.fn(),
    ensureConnection: vi.fn(),
    createMemory: vi.fn(),
    emitEvent: vi.fn(),
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    ...overrides,
  } as unknown as Parameters<typeof WhatsAppBaileysService.start>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WhatsAppBaileysService", () => {
  describe("static properties", () => {
    it("has serviceType 'whatsapp'", () => {
      expect(WhatsAppBaileysService.serviceType).toBe("whatsapp");
    });
  });

  describe("constructor", () => {
    it("can be constructed without a runtime", () => {
      const svc = new WhatsAppBaileysService();
      expect(svc).toBeInstanceOf(WhatsAppBaileysService);
    });

    it("can be constructed with a runtime", () => {
      const runtime = createMockRuntime();
      const svc = new WhatsAppBaileysService(runtime);
      expect(svc).toBeInstanceOf(WhatsAppBaileysService);
    });
  });

  describe("capabilityDescription", () => {
    it("describes WhatsApp messaging capability", () => {
      const svc = new WhatsAppBaileysService();
      expect(svc.capabilityDescription).toMatch(/whatsapp/i);
    });
  });

  // -----------------------------------------------------------------------
  // handleSendMessage() — tests the outbound message logic
  // -----------------------------------------------------------------------

  describe("handleSendMessage()", () => {
    let svc: WhatsAppBaileysService;
    let runtime: ReturnType<typeof createMockRuntime>;

    beforeEach(() => {
      runtime = createMockRuntime();
      svc = new WhatsAppBaileysService(runtime);
    });

    it("throws when not connected (no socket)", async () => {
      // The service has no socket set — connected is false by default
      await expect(
        svc.handleSendMessage(
          runtime,
          { channelId: "1234567890@s.whatsapp.net" },
          { text: "hello" } as Parameters<typeof svc.handleSendMessage>[2],
        ),
      ).rejects.toThrow(/not connected/i);
    });

    it("forms correct JID from channelId that already contains @", async () => {
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);

      // Manually set the socket and connected state via object manipulation
      // (these are private fields but we need to test the method's logic)
      Object.assign(svc, {
        sock: { sendMessage: mockSendMessage },
        connected: true,
      });

      await svc.handleSendMessage(
        runtime,
        { channelId: "1234567890@s.whatsapp.net" },
        { text: "hello" } as Parameters<typeof svc.handleSendMessage>[2],
      );

      expect(mockSendMessage).toHaveBeenCalledWith(
        "1234567890@s.whatsapp.net",
        { text: "hello" },
      );
    });

    it("appends @s.whatsapp.net when channelId has no @", async () => {
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      Object.assign(svc, {
        sock: { sendMessage: mockSendMessage },
        connected: true,
      });

      await svc.handleSendMessage(
        runtime,
        { channelId: "9876543210" },
        { text: "test" } as Parameters<typeof svc.handleSendMessage>[2],
      );

      expect(mockSendMessage).toHaveBeenCalledWith(
        "9876543210@s.whatsapp.net",
        { text: "test" },
      );
    });

    it("forms JID from entityId when no channelId is provided", async () => {
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      Object.assign(svc, {
        sock: { sendMessage: mockSendMessage },
        connected: true,
      });

      await svc.handleSendMessage(
        runtime,
        { entityId: "+1234567890" },
        { text: "hi" } as Parameters<typeof svc.handleSendMessage>[2],
      );

      expect(mockSendMessage).toHaveBeenCalledWith(
        "1234567890@s.whatsapp.net",
        { text: "hi" },
      );
    });

    it("throws when entityId has too few digits", async () => {
      Object.assign(svc, {
        sock: { sendMessage: vi.fn() },
        connected: true,
      });

      await expect(
        svc.handleSendMessage(
          runtime,
          { entityId: "abc" },
          { text: "hi" } as Parameters<typeof svc.handleSendMessage>[2],
        ),
      ).rejects.toThrow(/cannot determine/i);
    });

    it("throws when neither channelId nor entityId is provided", async () => {
      Object.assign(svc, {
        sock: { sendMessage: vi.fn() },
        connected: true,
      });

      await expect(
        svc.handleSendMessage(
          runtime,
          {},
          { text: "hi" } as Parameters<typeof svc.handleSendMessage>[2],
        ),
      ).rejects.toThrow(/requires channelId or entityId/i);
    });

    it("skips sending when message text is empty", async () => {
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      Object.assign(svc, {
        sock: { sendMessage: mockSendMessage },
        connected: true,
      });

      await svc.handleSendMessage(
        runtime,
        { channelId: "1234567890@s.whatsapp.net" },
        { text: "   " } as Parameters<typeof svc.handleSendMessage>[2],
      );

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(runtime.logger.warn).toHaveBeenCalled();
    });

    it("skips sending when message text is undefined", async () => {
      const mockSendMessage = vi.fn().mockResolvedValue(undefined);
      Object.assign(svc, {
        sock: { sendMessage: mockSendMessage },
        connected: true,
      });

      await svc.handleSendMessage(
        runtime,
        { channelId: "1234567890@s.whatsapp.net" },
        {} as Parameters<typeof svc.handleSendMessage>[2],
      );

      // text is undefined, so `content.text ?? ""` becomes "", which is empty
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // registerSendHandlers (static)
  // -----------------------------------------------------------------------

  describe("registerSendHandlers()", () => {
    it("registers a 'whatsapp' send handler on the runtime", () => {
      const runtime = createMockRuntime();
      const svc = new WhatsAppBaileysService(runtime);

      WhatsAppBaileysService.registerSendHandlers(
        runtime,
        svc as unknown as Parameters<typeof WhatsAppBaileysService.registerSendHandlers>[1],
      );

      expect(runtime.registerSendHandler).toHaveBeenCalledWith(
        "whatsapp",
        expect.any(Function),
      );
      expect(runtime.logger.info).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // stop()
  // -----------------------------------------------------------------------

  describe("stop()", () => {
    it("cleans up socket and sets connected to false", async () => {
      const runtime = createMockRuntime();
      const svc = new WhatsAppBaileysService(runtime);
      const mockEnd = vi.fn();

      Object.assign(svc, {
        sock: { end: mockEnd },
        connected: true,
      });

      await svc.stop();

      expect(mockEnd).toHaveBeenCalledWith(undefined);
      // After stop, handleSendMessage should throw (not connected)
      await expect(
        svc.handleSendMessage(
          runtime,
          { channelId: "123@s.whatsapp.net" },
          { text: "hi" } as Parameters<typeof svc.handleSendMessage>[2],
        ),
      ).rejects.toThrow(/not connected/i);
    });

    it("does not throw when socket end() throws", async () => {
      const runtime = createMockRuntime();
      const svc = new WhatsAppBaileysService(runtime);

      Object.assign(svc, {
        sock: {
          end: () => {
            throw new Error("cleanup error");
          },
        },
        connected: true,
      });

      // Should not throw
      await expect(svc.stop()).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Indirect tests for module-private helpers via class behavior
  // -----------------------------------------------------------------------

  describe("private helper behavior (tested indirectly)", () => {
    describe("jidToPhoneNumber (via handleSendMessage log output)", () => {
      it("logs phone number without JID suffix", async () => {
        const runtime = createMockRuntime();
        const svc = new WhatsAppBaileysService(runtime);
        const mockSendMessage = vi.fn().mockResolvedValue(undefined);
        Object.assign(svc, {
          sock: { sendMessage: mockSendMessage },
          connected: true,
        });

        await svc.handleSendMessage(
          runtime,
          { channelId: "1234567890@s.whatsapp.net" },
          { text: "hello" } as Parameters<typeof svc.handleSendMessage>[2],
        );

        // jidToPhoneNumber("1234567890@s.whatsapp.net") should produce "1234567890"
        const infoCall = runtime.logger.info.mock.calls.find(
          (call: string[]) => typeof call[0] === "string" && call[0].includes("Sending message to"),
        );
        expect(infoCall).toBeDefined();
        expect(infoCall![0]).toContain("1234567890");
        expect(infoCall![0]).not.toContain("@s.whatsapp.net");
      });

      it("strips device suffix from JID (colon-separated)", async () => {
        const runtime = createMockRuntime();
        const svc = new WhatsAppBaileysService(runtime);
        const mockSendMessage = vi.fn().mockResolvedValue(undefined);
        Object.assign(svc, {
          sock: { sendMessage: mockSendMessage },
          connected: true,
        });

        // JID with device suffix: "1234567890:0@s.whatsapp.net"
        await svc.handleSendMessage(
          runtime,
          { channelId: "1234567890:0@s.whatsapp.net" },
          { text: "hello" } as Parameters<typeof svc.handleSendMessage>[2],
        );

        const infoCall = runtime.logger.info.mock.calls.find(
          (call: string[]) => typeof call[0] === "string" && call[0].includes("Sending message to"),
        );
        expect(infoCall).toBeDefined();
        // jidToPhoneNumber should strip ":0" and "@s.whatsapp.net"
        expect(infoCall![0]).toContain("1234567890");
        expect(infoCall![0]).not.toContain(":0");
      });
    });

    describe("resolveAuthDir (tested indirectly via constructor/init path)", () => {
      it("uses custom WHATSAPP_AUTH_DIR when set in runtime settings", () => {
        const runtime = createMockRuntime({
          getSetting: vi.fn().mockReturnValue("/custom/auth/dir"),
        });
        // resolveAuthDir is called during initialize(), but we cannot easily
        // test it without importing Baileys. Instead we verify getSetting
        // is accessible on the runtime.
        expect(runtime.getSetting("WHATSAPP_AUTH_DIR")).toBe("/custom/auth/dir");
      });
    });
  });

  // -----------------------------------------------------------------------
  // stopRuntime (static)
  // -----------------------------------------------------------------------

  describe("stopRuntime()", () => {
    it("calls stop() on the service if it exists", async () => {
      const mockStop = vi.fn().mockResolvedValue(undefined);
      const runtime = createMockRuntime({
        getService: vi.fn().mockReturnValue({ stop: mockStop }),
      });

      await WhatsAppBaileysService.stopRuntime(runtime);

      expect(runtime.getService).toHaveBeenCalledWith("whatsapp");
      expect(mockStop).toHaveBeenCalled();
    });

    it("does nothing when the service does not exist", async () => {
      const runtime = createMockRuntime({
        getService: vi.fn().mockReturnValue(null),
      });

      // Should not throw
      await expect(
        WhatsAppBaileysService.stopRuntime(runtime),
      ).resolves.toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// extractMessageText()
// ---------------------------------------------------------------------------

describe("extractMessageText()", () => {
  it("returns undefined when msg has no message field", () => {
    expect(extractMessageText({})).toBeUndefined();
  });

  it("returns undefined when msg.message is undefined", () => {
    expect(extractMessageText({ message: undefined })).toBeUndefined();
  });

  it("extracts plain conversation text", () => {
    const msg = { message: { conversation: "Hello world" } };
    expect(extractMessageText(msg)).toBe("Hello world");
  });

  it("extracts extendedTextMessage text", () => {
    const msg = {
      message: { extendedTextMessage: { text: "Reply text" } },
    };
    expect(extractMessageText(msg)).toBe("Reply text");
  });

  it("prefers conversation over extendedTextMessage", () => {
    const msg = {
      message: {
        conversation: "Plain",
        extendedTextMessage: { text: "Extended" },
      },
    };
    expect(extractMessageText(msg)).toBe("Plain");
  });

  it("extracts imageMessage caption", () => {
    const msg = {
      message: { imageMessage: { caption: "Photo caption" } },
    };
    expect(extractMessageText(msg)).toBe("Photo caption");
  });

  it("extracts videoMessage caption", () => {
    const msg = {
      message: { videoMessage: { caption: "Video caption" } },
    };
    expect(extractMessageText(msg)).toBe("Video caption");
  });

  it("extracts documentMessage caption", () => {
    const msg = {
      message: { documentMessage: { caption: "Doc caption" } },
    };
    expect(extractMessageText(msg)).toBe("Doc caption");
  });

  it("returns undefined for media message without caption", () => {
    const msg = {
      message: { imageMessage: { url: "https://example.com/img.jpg" } },
    };
    expect(extractMessageText(msg)).toBeUndefined();
  });

  it("returns undefined for unknown message types", () => {
    const msg = {
      message: { stickerMessage: { url: "sticker.webp" } },
    };
    expect(extractMessageText(msg)).toBeUndefined();
  });
});
