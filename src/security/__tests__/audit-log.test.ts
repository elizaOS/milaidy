import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAuditFeedForTests,
  queryAuditFeed,
  SandboxAuditLog,
  subscribeAuditFeed,
} from "../audit-log";

describe("SandboxAuditLog", () => {
  let log: SandboxAuditLog;

  beforeEach(() => {
    __resetAuditFeedForTests();
    log = new SandboxAuditLog({ console: false }); // Silence console output in tests
  });

  describe("record", () => {
    it("should record events with timestamps", () => {
      log.record({
        type: "sandbox_lifecycle",
        summary: "Test event",
        severity: "info",
      });

      const recent = log.getRecent();
      expect(recent).toHaveLength(1);
      expect(recent[0].type).toBe("sandbox_lifecycle");
      expect(recent[0].summary).toBe("Test event");
      expect(recent[0].timestamp).toBeTruthy();
    });

    it("should support metadata", () => {
      log.record({
        type: "policy_decision",
        summary: "Allowed",
        severity: "info",
        metadata: { decision: "allow", amount: 100 },
      });

      const entries = log.getRecent();
      expect(entries[0].metadata?.decision).toBe("allow");
      expect(entries[0].metadata?.amount).toBe(100);
    });

    it("should call external sink", () => {
      const sink = vi.fn();
      const logWithSink = new SandboxAuditLog({ console: false, sink });

      logWithSink.record({
        type: "sandbox_lifecycle",
        summary: "Test",
        severity: "info",
      });

      expect(sink).toHaveBeenCalledTimes(1);
      expect(sink.mock.calls[0][0].type).toBe("sandbox_lifecycle");
    });
  });

  describe("convenience methods", () => {
    it("recordTokenReplacement should create correct entry", () => {
      log.recordTokenReplacement("outbound", "https://api.example.com", [
        "tok1",
        "tok2",
      ]);

      const entries = log.getRecent();
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("secret_token_replacement_outbound");
      expect(entries[0].metadata?.tokenCount).toBe(2);
    });

    it("recordCapabilityInvocation should create correct entry", () => {
      log.recordCapabilityInvocation("shell", "exec: ls -la");

      const entries = log.getRecent();
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("privileged_capability_invocation");
      expect(entries[0].metadata?.capability).toBe("shell");
    });

    it("recordPolicyDecision should set severity based on decision", () => {
      log.recordPolicyDecision("allow", "All checks passed");
      log.recordPolicyDecision("deny", "Value too high");

      const entries = log.getRecent();
      expect(entries[0].severity).toBe("info");
      expect(entries[1].severity).toBe("warn");
    });
  });

  describe("querying", () => {
    it("getRecent should respect count parameter", () => {
      for (let i = 0; i < 10; i++) {
        log.record({
          type: "sandbox_lifecycle",
          summary: `Event ${i}`,
          severity: "info",
        });
      }

      expect(log.getRecent(3)).toHaveLength(3);
      expect(log.getRecent(20)).toHaveLength(10);
    });

    it("getByType should filter correctly", () => {
      log.record({ type: "sandbox_lifecycle", summary: "A", severity: "info" });
      log.record({ type: "policy_decision", summary: "B", severity: "info" });
      log.record({ type: "sandbox_lifecycle", summary: "C", severity: "info" });

      const lifecycle = log.getByType("sandbox_lifecycle");
      expect(lifecycle).toHaveLength(2);
      expect(lifecycle[0].summary).toBe("A");
      expect(lifecycle[1].summary).toBe("C");
    });
  });

  describe("bounds", () => {
    it("should evict old entries when max is exceeded", () => {
      const smallLog = new SandboxAuditLog({ console: false, maxEntries: 10 });

      for (let i = 0; i < 20; i++) {
        smallLog.record({
          type: "sandbox_lifecycle",
          summary: `Event ${i}`,
          severity: "info",
        });
      }

      expect(smallLog.size).toBeLessThanOrEqual(10);
    });
  });

  describe("clear", () => {
    it("should remove all entries", () => {
      log.record({ type: "sandbox_lifecycle", summary: "A", severity: "info" });
      log.record({ type: "sandbox_lifecycle", summary: "B", severity: "info" });
      expect(log.size).toBe(2);
      log.clear();
      expect(log.size).toBe(0);
    });
  });

  describe("process-wide feed", () => {
    it("is visible across log instances", () => {
      const secondLog = new SandboxAuditLog({ console: false });

      log.record({
        type: "sandbox_lifecycle",
        summary: "first",
        severity: "info",
      });
      secondLog.record({
        type: "policy_decision",
        summary: "second",
        severity: "warn",
      });

      const entries = queryAuditFeed();
      expect(entries).toHaveLength(2);
      expect(entries[0].summary).toBe("first");
      expect(entries[1].summary).toBe("second");
    });

    it("supports filtered global feed queries", () => {
      log.record({
        type: "policy_decision",
        summary: "allow",
        severity: "info",
      });
      log.record({
        type: "policy_decision",
        summary: "deny",
        severity: "warn",
      });
      log.record({
        type: "sandbox_lifecycle",
        summary: "boot",
        severity: "info",
      });

      expect(queryAuditFeed({ severity: "warn" })).toHaveLength(1);
      expect(queryAuditFeed({ type: "policy_decision" })).toHaveLength(2);
      expect(
        queryAuditFeed({ type: "policy_decision", limit: 1 })[0].summary,
      ).toBe("deny");
    });

    it("publishes to global feed subscribers", () => {
      const subscriber = vi.fn();
      const unsubscribe = subscribeAuditFeed(subscriber);

      log.record({
        type: "sandbox_lifecycle",
        summary: "subscribed",
        severity: "info",
      });
      unsubscribe();
      log.record({
        type: "sandbox_lifecycle",
        summary: "after-unsubscribe",
        severity: "info",
      });

      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(subscriber.mock.calls[0][0].summary).toBe("subscribed");
    });

    it("reset helper clears global state for isolated tests", () => {
      log.record({
        type: "sandbox_lifecycle",
        summary: "before reset",
        severity: "info",
      });
      expect(queryAuditFeed()).toHaveLength(1);

      __resetAuditFeedForTests();
      expect(queryAuditFeed()).toHaveLength(0);
    });
  });
});
