import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetForTesting,
  createHardenedExportGuard,
  getWalletExportAuditLog,
} from "./wallet-export-guard";

function mockReq(ip = "192.168.1.1", ua = "test-agent"): http.IncomingMessage {
  return {
    headers: { "user-agent": ua },
    socket: { remoteAddress: ip },
  } as http.IncomingMessage;
}

const alwaysAllow = () => null;
const alwaysReject = () => ({
  status: 403 as const,
  reason: "upstream rejected",
});

describe("wallet-export-guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects when upstream rejects (token invalid)", () => {
    const guard = createHardenedExportGuard(alwaysReject);
    const result = guard(mockReq(), { confirm: true });
    expect(result).toEqual({ status: 403, reason: "upstream rejected" });
  });

  it("requires requestNonce before allowing export", () => {
    const guard = createHardenedExportGuard(alwaysAllow);
    const result = guard(mockReq(), { confirm: true });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
    expect(result?.reason).toContain("confirmation delay");
  });

  it("issues a nonce when requestNonce is true", () => {
    const guard = createHardenedExportGuard(alwaysAllow);
    const result = guard(mockReq(), {
      confirm: true,
      requestNonce: true,
    });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
    const body = JSON.parse(result?.reason);
    expect(body.countdown).toBe(true);
    expect(body.nonce).toMatch(/^wxn_/);
    expect(body.delaySeconds).toBe(10);
  });

  it("rejects nonce before delay elapses", () => {
    const guard = createHardenedExportGuard(alwaysAllow);
    const req = mockReq();

    // Issue nonce
    const nonceResult = guard(req, { confirm: true, requestNonce: true });
    const nonce = JSON.parse(nonceResult?.reason).nonce;

    // Try immediately — should fail
    vi.advanceTimersByTime(5_000); // only 5s, need 10s
    const result = guard(req, { confirm: true, exportNonce: nonce });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
    expect(result?.reason).toContain("Wait");
  });

  it("allows export after delay elapses", () => {
    const guard = createHardenedExportGuard(alwaysAllow);
    const req = mockReq();

    // Issue nonce
    const nonceResult = guard(req, { confirm: true, requestNonce: true });
    const nonce = JSON.parse(nonceResult?.reason).nonce;

    // Wait 10s
    vi.advanceTimersByTime(10_000);
    const result = guard(req, { confirm: true, exportNonce: nonce });
    expect(result).toBeNull(); // allowed
  });

  it("rate limits after a successful export (1 per 10 min)", () => {
    const guard = createHardenedExportGuard(alwaysAllow);
    const req = mockReq("10.0.0.1");

    // First export: issue nonce, wait, export
    const nonce1Result = guard(req, { confirm: true, requestNonce: true });
    const nonce1 = JSON.parse(nonce1Result?.reason).nonce;
    vi.advanceTimersByTime(10_000);
    expect(guard(req, { confirm: true, exportNonce: nonce1 })).toBeNull();

    // Second attempt from same IP: issue nonce, wait, but rate limited
    const nonce2Result = guard(req, { confirm: true, requestNonce: true });
    const nonce2 = JSON.parse(nonce2Result?.reason).nonce;
    vi.advanceTimersByTime(10_000);
    const result = guard(req, { confirm: true, exportNonce: nonce2 });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
    expect(result?.reason).toContain("Rate limit");
  });

  it("allows export again after rate limit window expires", () => {
    const guard = createHardenedExportGuard(alwaysAllow);
    const req = mockReq("10.0.0.2");

    // First export
    const nonce1Result = guard(req, { confirm: true, requestNonce: true });
    const nonce1 = JSON.parse(nonce1Result?.reason).nonce;
    vi.advanceTimersByTime(10_000);
    expect(guard(req, { confirm: true, exportNonce: nonce1 })).toBeNull();

    // Wait 10 minutes
    vi.advanceTimersByTime(10 * 60 * 1000);

    // Second export should work
    const nonce2Result = guard(req, { confirm: true, requestNonce: true });
    const nonce2 = JSON.parse(nonce2Result?.reason).nonce;
    vi.advanceTimersByTime(10_000);
    expect(guard(req, { confirm: true, exportNonce: nonce2 })).toBeNull();
  });

  it("rejects nonce from a different IP", () => {
    const guard = createHardenedExportGuard(alwaysAllow);

    // Issue nonce from IP A
    const nonceResult = guard(mockReq("1.1.1.1"), {
      confirm: true,
      requestNonce: true,
    });
    const nonce = JSON.parse(nonceResult?.reason).nonce;

    // Try to use from IP B
    vi.advanceTimersByTime(10_000);
    const result = guard(mockReq("2.2.2.2"), {
      confirm: true,
      exportNonce: nonce,
    });
    expect(result).not.toBeNull();
    expect(result?.reason).toContain("different client");
  });

  it("rejects an invalid/expired nonce", () => {
    const guard = createHardenedExportGuard(alwaysAllow);
    const result = guard(mockReq(), {
      confirm: true,
      exportNonce: "wxn_bogus",
    });
    expect(result).not.toBeNull();
    expect(result?.reason).toContain("Invalid or expired");
  });

  it("nonce is single-use (consumed after successful export)", () => {
    const guard = createHardenedExportGuard(alwaysAllow);
    // Use unique IP so rate limiter doesn't interfere
    const req = mockReq("10.99.99.99");

    const nonceResult = guard(req, { confirm: true, requestNonce: true });
    const nonce = JSON.parse(nonceResult?.reason).nonce;

    vi.advanceTimersByTime(10_000);
    expect(guard(req, { confirm: true, exportNonce: nonce })).toBeNull();

    // Wait for rate limit to clear before testing nonce reuse
    vi.advanceTimersByTime(10 * 60 * 1000);

    // Reuse same nonce — should fail (nonce consumed, not rate limited)
    const reuse = guard(req, { confirm: true, exportNonce: nonce });
    expect(reuse).not.toBeNull();
    expect(reuse?.reason).toContain("Invalid or expired");
  });

  it("records audit entries for all outcomes", () => {
    const guard = createHardenedExportGuard(alwaysAllow);
    const req = mockReq("10.0.0.4", "AuditTestAgent");

    // Rejected: no nonce
    guard(req, { confirm: true });

    // Issue nonce
    guard(req, { confirm: true, requestNonce: true });

    const log = getWalletExportAuditLog();
    expect(log.length).toBeGreaterThanOrEqual(2);

    const rejected = log.find(
      (e) => e.ip === "10.0.0.4" && e.outcome === "rejected",
    );
    expect(rejected).toBeDefined();
    expect(rejected?.userAgent).toBe("AuditTestAgent");
    expect(rejected?.timestamp).toMatch(/^\d{4}-/);
  });

  it("ignores X-Forwarded-For and uses socket.remoteAddress", () => {
    const guard = createHardenedExportGuard(alwaysAllow);
    const req = {
      headers: {
        "user-agent": "test",
        "x-forwarded-for": "203.0.113.50, 10.0.0.1",
      },
      socket: { remoteAddress: "127.0.0.1" },
    } as http.IncomingMessage;

    guard(req, { confirm: true, requestNonce: true });

    const log = getWalletExportAuditLog();
    const latest = log[log.length - 1];
    // XFF is untrusted — must use socket address
    expect(latest.ip).toBe("127.0.0.1");
  });

  it("rejects nonce issuance when per-IP nonce cap is reached", () => {
    const guard = createHardenedExportGuard(alwaysAllow);
    const req = mockReq("10.0.0.50");

    // Issue 3 nonces (the cap)
    for (let i = 0; i < 3; i++) {
      const result = guard(req, { confirm: true, requestNonce: true });
      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    }

    // 4th should be rejected with 429
    const result = guard(req, { confirm: true, requestNonce: true });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
    expect(result?.reason).toContain("Too many pending");
  });
});
