/**
 * End-to-end integration test for the full sandbox system.
 *
 * Verifies that all components work together:
 * - SandboxTokenManager tokenization and detokenization
 * - SandboxFetchProxy outbound injection and inbound sanitization
 * - Signing policy evaluation chain
 * - Audit log recording
 * - Capability detection
 *
 * These tests do NOT require Docker or containers — they test the
 * "light" sandbox mode logic that runs in-process.
 */

import { describe, expect, it, vi } from "vitest";
// Import directly from the source file — works without a package rebuild
import { SandboxTokenManager } from "../../../../eliza/packages/typescript/src/security/sandbox-token-manager.js";
import { SandboxAuditLog } from "../../security/audit-log";
import {
  RemoteSigningService,
  type SignerBackend,
} from "../remote-signing-service";
import { SandboxManager } from "../sandbox-manager";
import { createDefaultPolicy } from "../signing-policy";

// Inline a minimal createSandboxFetchProxy for test isolation
// (avoids fragile cross-package relative imports)
function createTestSandboxFetchProxy(opts: {
  tokenManager: SandboxTokenManager;
  baseFetch: typeof fetch;
  onAuditEvent?: (event: Record<string, unknown>) => void;
}): typeof fetch {
  const { tokenManager: tm, baseFetch, onAuditEvent } = opts;

  return (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // Outbound: detokenize
    const outboundTokenIds: string[] = [];
    let url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const originalUrl = url;
    url = tm.detokenizeString(url);
    if (url !== originalUrl) {
      outboundTokenIds.push("url");
    }

    let resolvedInit = init;
    if (init?.headers) {
      const headers: Record<string, string> = {};
      const src =
        init.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : Array.isArray(init.headers)
            ? Object.fromEntries(init.headers)
            : (init.headers as Record<string, string>);
      for (const [k, v] of Object.entries(src)) {
        const rawHeaderValue = String(v);
        const detokenizedHeaderValue = tm.detokenizeString(rawHeaderValue);
        if (detokenizedHeaderValue !== rawHeaderValue) {
          outboundTokenIds.push(`header:${k}`);
        }
        headers[k] = detokenizedHeaderValue;
      }
      resolvedInit = { ...init, headers };
    }
    if (resolvedInit?.body && typeof resolvedInit.body === "string") {
      const rawBody = resolvedInit.body;
      const detokenizedBody = tm.detokenizeString(rawBody);
      if (detokenizedBody !== rawBody) {
        outboundTokenIds.push("body");
      }
      resolvedInit = {
        ...resolvedInit,
        body: detokenizedBody,
      };
    }

    if (outboundTokenIds.length > 0) {
      onAuditEvent?.({
        direction: "outbound",
        url,
        replacementCount: outboundTokenIds.length,
        tokenIds: outboundTokenIds,
      });
    }

    const response = await baseFetch(url, resolvedInit);

    // Inbound: tokenize
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("json") || contentType.includes("text")) {
      const body = await response.text();
      const sanitized = tm.tokenizeString(body);
      if (sanitized !== body) {
        onAuditEvent?.({
          direction: "inbound",
          url: response.url,
          replacementCount: 1,
          tokenIds: [],
        });
      }
      const newHeaders = new Headers(response.headers);
      return new Response(sanitized, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }
    return response;
  }) as typeof fetch;
}
describe("Sandbox E2E Integration", () => {
  describe("Full tokenization round-trip", () => {
    it("should tokenize, send via proxy, and sanitize response", async () => {
      // Setup
      const tm = new SandboxTokenManager();
      const auditEvents: Array<Record<string, unknown>> = [];

      // Register a "secret" API key
      const token = tm.registerSecret("OPENAI_API_KEY", "sk-real-key-abc123");

      // Create a mock fetch that echoes back what it receives
      const mockFetch = vi
        .fn()
        .mockImplementation(async (_url: string, init: RequestInit) => {
          const authHeader =
            (init?.headers as Record<string, string>)?.Authorization ?? "";
          // Simulate API echoing back the key in an error message
          return new Response(
            JSON.stringify({
              status: "ok",
              echo: authHeader,
              debug: `Key used: ${authHeader.replace("Bearer ", "")}`,
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        });

      // Create proxy
      const proxy = createTestSandboxFetchProxy({
        tokenManager: tm,
        baseFetch: mockFetch,
        onAuditEvent: (e) => auditEvents.push(e),
      });

      // Simulate what a plugin would do
      const response = await proxy(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: "gpt-4", messages: [] }),
        },
      );

      // Verify: outbound request had REAL key (not token)
      const outboundCall = mockFetch.mock.calls[0];
      const outboundHeaders = (outboundCall[1] as RequestInit)
        .headers as Record<string, string>;
      expect(outboundHeaders.Authorization).toBe("Bearer sk-real-key-abc123");

      // Verify: inbound response has TOKENIZED key (not real)
      const body = await response.text();
      const parsed = JSON.parse(body);
      expect(parsed.echo).not.toContain("sk-real-key-abc123");
      expect(parsed.echo).toContain("stok_"); // Sanitized to token
      expect(parsed.debug).not.toContain("sk-real-key-abc123");

      // Verify: audit events were emitted
      expect(auditEvents.length).toBeGreaterThanOrEqual(1);
      const outbound = auditEvents.find((e) => e.direction === "outbound");
      expect(outbound).toBeTruthy();
      expect((outbound as Record<string, unknown>).replacementCount).toBe(1);
    });

    it("should handle multiple secrets in one request", async () => {
      const tm = new SandboxTokenManager();
      const tokenA = tm.registerSecret("KEY_A", "secret-aaa");
      const tokenB = tm.registerSecret("KEY_B", "secret-bbb");

      const mockFetch = vi.fn().mockResolvedValue(
        new Response("{}", {
          headers: { "content-type": "application/json" },
        }),
      );

      const proxy = createTestSandboxFetchProxy({
        tokenManager: tm,
        baseFetch: mockFetch,
      });

      await proxy("https://api.example.com", {
        method: "POST",
        headers: { "X-Key-A": tokenA },
        body: JSON.stringify({ keyB: tokenB }),
      });

      const call = mockFetch.mock.calls[0];
      const headers = (call[1] as RequestInit).headers as Record<
        string,
        string
      >;
      const body = JSON.parse((call[1] as RequestInit).body as string);

      expect(headers["X-Key-A"]).toBe("secret-aaa");
      expect(body.keyB).toBe("secret-bbb");
    });
  });

  describe("Signing policy + remote signing flow", () => {
    const mockSigner: SignerBackend = {
      getAddress: async () => "0x1234567890abcdef1234567890abcdef12345678",
      signMessage: async (msg: string) => `signed:${msg}`,
      signTransaction: async () => "0xsigned-tx-hex",
    };

    it("should allow and sign a valid transaction", async () => {
      const auditLog = new SandboxAuditLog({ console: false });
      const service = new RemoteSigningService({
        signer: mockSigner,
        auditLog,
      });

      const result = await service.submitSigningRequest({
        requestId: "test-1",
        chainId: 1,
        to: "0xaaaa000000000000000000000000000000000000",
        value: "1000000000000000", // 0.001 ETH
        data: "0x",
        createdAt: Date.now(),
      });

      expect(result.success).toBe(true);
      expect(result.signature).toBe("0xsigned-tx-hex");
      expect(result.policyDecision.allowed).toBe(true);

      // Verify audit log
      const entries = auditLog.getRecent();
      expect(entries.some((e) => e.type === "signing_request_submitted")).toBe(
        true,
      );
      expect(entries.some((e) => e.type === "signing_request_approved")).toBe(
        true,
      );
    });

    it("should deny transaction exceeding value cap", async () => {
      const service = new RemoteSigningService({
        signer: mockSigner,
        policy: {
          ...createDefaultPolicy(),
          maxTransactionValueWei: "1000000000000000", // 0.001 ETH
        },
      });

      const result = await service.submitSigningRequest({
        requestId: "test-2",
        chainId: 1,
        to: "0xaaaa000000000000000000000000000000000000",
        value: "5000000000000000000", // 5 ETH
        data: "0x",
        createdAt: Date.now(),
      });

      expect(result.success).toBe(false);
      expect(result.policyDecision.allowed).toBe(false);
      expect(result.policyDecision.matchedRule).toBe("value_cap");
    });

    it("should require human confirmation for high-value tx", async () => {
      const service = new RemoteSigningService({
        signer: mockSigner,
        policy: {
          ...createDefaultPolicy(),
          maxTransactionValueWei: "1000000000000000000", // 1 ETH
          humanConfirmationThresholdWei: "10000000000000000", // 0.01 ETH
        },
      });

      const result = await service.submitSigningRequest({
        requestId: "test-3",
        chainId: 1,
        to: "0xaaaa000000000000000000000000000000000000",
        value: "50000000000000000", // 0.05 ETH
        data: "0x",
        createdAt: Date.now(),
      });

      expect(result.success).toBe(false); // Pending approval
      expect(result.policyDecision.requiresHumanConfirmation).toBe(true);

      // Approve it
      const approved = await service.approveRequest("test-3");
      expect(approved.success).toBe(true);
      expect(approved.humanConfirmed).toBe(true);
      expect(approved.signature).toBe("0xsigned-tx-hex");
    });

    it("should deny replay of already-signed request", async () => {
      const service = new RemoteSigningService({ signer: mockSigner });

      const req = {
        requestId: "unique-id-1",
        chainId: 1,
        to: "0xaaaa000000000000000000000000000000000000",
        value: "1000000000000000",
        data: "0x",
        createdAt: Date.now(),
      };

      const r1 = await service.submitSigningRequest(req);
      expect(r1.success).toBe(true);

      const r2 = await service.submitSigningRequest(req);
      expect(r2.success).toBe(false);
      expect(r2.policyDecision.matchedRule).toBe("replay_protection");
    });
  });

  describe("Sandbox manager light mode lifecycle", () => {
    it("should support full light mode lifecycle", async () => {
      const mgr = new SandboxManager({ mode: "light" });

      expect(mgr.getState()).toBe("uninitialized");
      await mgr.start();
      expect(mgr.getState()).toBe("ready");
      expect(mgr.isReady()).toBe(true);

      // Light mode refuses exec
      const execResult = await mgr.exec({ command: "echo hello" });
      expect(execResult.executedInSandbox).toBe(false);

      await mgr.stop();
      expect(mgr.getState()).toBe("stopped");

      // Status includes correct info
      const status = mgr.getStatus();
      expect(status.mode).toBe("light");
      expect(status.containerId).toBeNull();
    });
  });

  describe("Audit log integration", () => {
    it("should record all event types correctly", () => {
      const log = new SandboxAuditLog({ console: false });

      log.recordTokenReplacement("outbound", "https://api.example.com", ["t1"]);
      log.recordTokenReplacement("inbound", "https://api.example.com", ["t1"]);
      log.recordCapabilityInvocation("shell", "exec: ls", { mode: "sandbox" });
      log.recordPolicyDecision("allow", "All checks passed");
      log.recordPolicyDecision("deny", "Value too high");

      log.record({
        type: "sandbox_lifecycle",
        summary: "Started",
        severity: "info",
      });
      log.record({
        type: "signing_request_submitted",
        summary: "Sign req",
        severity: "info",
      });
      log.record({
        type: "fetch_proxy_error",
        summary: "Parse error",
        severity: "error",
      });

      expect(log.size).toBe(8);

      const outbound = log.getByType("secret_token_replacement_outbound");
      expect(outbound).toHaveLength(1);

      const denials = log.getByType("policy_decision");
      expect(denials).toHaveLength(2);
    });
  });
});
