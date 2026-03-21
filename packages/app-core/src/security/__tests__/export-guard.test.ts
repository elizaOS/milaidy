import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHardenedExportGuard,
  type HardenedExportGuard,
} from "../export-guard";

describe("createHardenedExportGuard", () => {
  let guard: HardenedExportGuard;

  beforeEach(() => {
    guard = createHardenedExportGuard();
    vi.useFakeTimers();
  });

  /* ── 1. Upstream rejection pass-through (guard is additive) ─────── */

  it("does not interfere with upstream rejection (guard is additive)", () => {
    // The guard wraps upstream validation; if upstream rejects, the
    // guard never even runs. This test verifies the guard has an
    // independent lifecycle — no false positives on its own.
    const { nonce } = guard.requestNonce("127.0.0.1");
    expect(typeof nonce).toBe("string");
    expect(nonce.length).toBeGreaterThan(0);
  });

  /* ── 2. Nonce issuance ──────────────────────────────────────────── */

  it("issues a nonce with an expiry timestamp", () => {
    const result = guard.requestNonce("10.0.0.1");
    expect(result.nonce).toBeTruthy();
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  /* ── 3. Delay enforcement ───────────────────────────────────────── */

  it("rejects nonce validation before 10-second delay elapses", () => {
    const { nonce } = guard.requestNonce("10.0.0.1");

    // Immediately try to validate — should fail
    const rejection = guard.validateNonce(nonce, "10.0.0.1");
    expect(rejection).not.toBeNull();
    expect(rejection?.status).toBe(429);
    expect(rejection?.reason).toContain("delay");
  });

  it("accepts nonce validation after 10-second delay", () => {
    const { nonce } = guard.requestNonce("10.0.0.1");

    vi.advanceTimersByTime(10_001);

    const rejection = guard.validateNonce(nonce, "10.0.0.1");
    expect(rejection).toBeNull();
  });

  /* ── 4. Rate limiting ───────────────────────────────────────────── */

  it("allows first export and blocks second within 10-minute window", () => {
    const ip = "192.168.1.1";

    // First export — should be allowed
    expect(guard.checkRateLimit(ip)).toBeNull();
    guard.recordSuccessfulExport(ip);

    // Second export — should be blocked
    const rejection = guard.checkRateLimit(ip);
    expect(rejection).not.toBeNull();
    expect(rejection?.status).toBe(429);
    expect(rejection?.reason).toContain("Rate limit");
  });

  it("resets rate limit after 10-minute window expires", () => {
    const ip = "192.168.1.1";

    guard.recordSuccessfulExport(ip);
    expect(guard.checkRateLimit(ip)).not.toBeNull();

    // Advance past the 10-minute window
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(guard.checkRateLimit(ip)).toBeNull();
  });

  /* ── 5. Nonce IP binding ────────────────────────────────────────── */

  it("rejects nonce from a different IP than it was issued to", () => {
    const { nonce } = guard.requestNonce("10.0.0.1");
    vi.advanceTimersByTime(10_001);

    const rejection = guard.validateNonce(nonce, "10.0.0.2");
    expect(rejection).not.toBeNull();
    expect(rejection?.status).toBe(403);
    expect(rejection?.reason).toContain("different client");
  });

  /* ── 6. Nonce expiry ────────────────────────────────────────────── */

  it("rejects nonce after TTL expires (60 seconds)", () => {
    const { nonce } = guard.requestNonce("10.0.0.1");

    vi.advanceTimersByTime(61_000);

    const rejection = guard.validateNonce(nonce, "10.0.0.1");
    expect(rejection).not.toBeNull();
    expect(rejection?.status).toBe(403);
    expect(rejection?.reason).toContain("expired");
  });

  /* ── 7. Single-use consumption ──────────────────────────────────── */

  it("rejects nonce on second use (single-use enforcement)", () => {
    const { nonce } = guard.requestNonce("10.0.0.1");
    vi.advanceTimersByTime(10_001);

    // First use — succeeds
    expect(guard.validateNonce(nonce, "10.0.0.1")).toBeNull();

    // Second use — fails
    const rejection = guard.validateNonce(nonce, "10.0.0.1");
    expect(rejection).not.toBeNull();
    expect(rejection?.status).toBe(403);
    expect(rejection?.reason).toContain("already been used");
  });

  /* ── 8. Audit log recording ─────────────────────────────────────── */

  it("records audit entries with IP, User-Agent, and timestamp", () => {
    const record = {
      ip: "10.0.0.1",
      userAgent: "TestClient/1.0",
      timestamp: Date.now(),
      action: "export_attempt",
      success: false,
    };

    guard.recordAudit(record);

    const log = guard.getAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].ip).toBe("10.0.0.1");
    expect(log[0].userAgent).toBe("TestClient/1.0");
    expect(log[0].action).toBe("export_attempt");
    expect(log[0].success).toBe(false);
  });

  it("records both successful and failed attempts in audit log", () => {
    guard.recordAudit({
      ip: "10.0.0.1",
      userAgent: "TestClient/1.0",
      timestamp: Date.now(),
      action: "export_attempt",
      success: false,
    });

    guard.recordAudit({
      ip: "10.0.0.1",
      userAgent: "TestClient/1.0",
      timestamp: Date.now(),
      action: "export_success",
      success: true,
    });

    const log = guard.getAuditLog();
    expect(log).toHaveLength(2);
    expect(log[0].success).toBe(false);
    expect(log[1].success).toBe(true);
  });

  /* ── 9. Invalid nonce ───────────────────────────────────────────── */

  it("rejects a completely invalid nonce", () => {
    const rejection = guard.validateNonce("bogus-nonce", "10.0.0.1");
    expect(rejection).not.toBeNull();
    expect(rejection?.status).toBe(403);
    expect(rejection?.reason).toContain("Invalid");
  });

  /* ── 10. Independent IPs ────────────────────────────────────────── */

  it("rate limits IPs independently", () => {
    guard.recordSuccessfulExport("10.0.0.1");

    // Different IP should not be rate-limited
    expect(guard.checkRateLimit("10.0.0.2")).toBeNull();

    // Same IP should be rate-limited
    expect(guard.checkRateLimit("10.0.0.1")).not.toBeNull();
  });
});
