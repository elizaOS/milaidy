/**
 * Unit tests for signing-policy.ts — transaction signing policy engine.
 *
 * This is the most security-critical module in the codebase: it guards
 * agent private keys by evaluating every signing request against policy
 * rules before allowing transactions.
 *
 * Covers:
 * - Default policy creation (sane defaults)
 * - Replay protection (duplicate requestId blocking)
 * - Chain ID allowlisting (restrict to specific chains)
 * - Contract denylist (block specific contracts)
 * - Contract allowlist (restrict to specific contracts)
 * - Value caps (BigInt max transaction value)
 * - Method selector filtering (4-byte function signatures)
 * - Rate limiting (hourly + daily quotas)
 * - Human confirmation thresholds (value-based + global toggle)
 * - Request recording (replay + rate tracking)
 * - Policy updates (dynamic reconfiguration)
 *
 * @see signing-policy.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDefaultPolicy,
  type SigningPolicy,
  SigningPolicyEvaluator,
  type SigningRequest,
} from "./signing-policy";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<SigningRequest> = {}): SigningRequest {
  return {
    requestId: `req-${Math.random().toString(36).slice(2)}`,
    chainId: 1,
    to: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    value: "0",
    data: "0x",
    createdAt: Date.now(),
    ...overrides,
  };
}

function makePolicy(overrides: Partial<SigningPolicy> = {}): SigningPolicy {
  return { ...createDefaultPolicy(), ...overrides };
}

// ── Setup ────────────────────────────────────────────────────────────────

let evaluator: SigningPolicyEvaluator;

beforeEach(() => {
  evaluator = new SigningPolicyEvaluator();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────

describe("signing-policy", () => {
  // ===================================================================
  //  1. Default Policy
  // ===================================================================

  describe("createDefaultPolicy", () => {
    it("creates a policy with sane defaults", () => {
      const policy = createDefaultPolicy();
      expect(policy.allowedChainIds).toEqual([]);
      expect(policy.allowedContracts).toEqual([]);
      expect(policy.deniedContracts).toEqual([]);
      expect(policy.maxTransactionValueWei).toBe("100000000000000000"); // 0.1 ETH
      expect(policy.maxTransactionsPerHour).toBe(10);
      expect(policy.maxTransactionsPerDay).toBe(50);
      expect(policy.allowedMethodSelectors).toEqual([]);
      expect(policy.humanConfirmationThresholdWei).toBe("10000000000000000"); // 0.01 ETH
      expect(policy.requireHumanConfirmation).toBe(false);
    });
  });

  // ===================================================================
  //  2. Basic Allow
  // ===================================================================

  describe("basic evaluation", () => {
    it("allows a request that passes all checks", () => {
      const result = evaluator.evaluate(makeRequest());
      expect(result.allowed).toBe(true);
      expect(result.matchedRule).toBe("allowed");
    });
  });

  // ===================================================================
  //  3. Replay Protection
  // ===================================================================

  describe("replay protection", () => {
    it("blocks duplicate requestId after recording", () => {
      const req = makeRequest({ requestId: "replay-test" });
      const first = evaluator.evaluate(req);
      expect(first.allowed).toBe(true);

      evaluator.recordRequest("replay-test");

      const second = evaluator.evaluate(req);
      expect(second.allowed).toBe(false);
      expect(second.matchedRule).toBe("replay_protection");
      expect(second.reason).toContain("replay-test");
    });

    it("allows different requestIds", () => {
      evaluator.recordRequest("req-1");
      const result = evaluator.evaluate(makeRequest({ requestId: "req-2" }));
      expect(result.allowed).toBe(true);
    });
  });

  // ===================================================================
  //  4. Chain ID Allowlisting
  // ===================================================================

  describe("chain ID allowlist", () => {
    it("allows any chain when allowlist is empty", () => {
      const result = evaluator.evaluate(makeRequest({ chainId: 42161 }));
      expect(result.allowed).toBe(true);
    });

    it("allows specified chain IDs", () => {
      evaluator.updatePolicy(makePolicy({ allowedChainIds: [1, 8453] }));
      expect(evaluator.evaluate(makeRequest({ chainId: 1 })).allowed).toBe(
        true,
      );
      expect(evaluator.evaluate(makeRequest({ chainId: 8453 })).allowed).toBe(
        true,
      );
    });

    it("blocks non-allowed chain IDs", () => {
      evaluator.updatePolicy(makePolicy({ allowedChainIds: [1] }));
      const result = evaluator.evaluate(makeRequest({ chainId: 137 }));
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe("chain_id_allowlist");
    });
  });

  // ===================================================================
  //  5. Contract Denylist
  // ===================================================================

  describe("contract denylist", () => {
    const EVIL_CONTRACT = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF";

    it("blocks denylisted contracts", () => {
      evaluator.updatePolicy(
        makePolicy({ deniedContracts: [EVIL_CONTRACT.toLowerCase()] }),
      );
      const result = evaluator.evaluate(makeRequest({ to: EVIL_CONTRACT }));
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe("contract_denylist");
    });

    it("is case-insensitive", () => {
      evaluator.updatePolicy(
        makePolicy({ deniedContracts: [EVIL_CONTRACT.toUpperCase()] }),
      );
      const result = evaluator.evaluate(
        makeRequest({ to: EVIL_CONTRACT.toLowerCase() }),
      );
      expect(result.allowed).toBe(false);
    });

    it("denylist is checked before allowlist", () => {
      evaluator.updatePolicy(
        makePolicy({
          deniedContracts: [EVIL_CONTRACT.toLowerCase()],
          allowedContracts: [EVIL_CONTRACT.toLowerCase()],
        }),
      );
      const result = evaluator.evaluate(makeRequest({ to: EVIL_CONTRACT }));
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe("contract_denylist");
    });
  });

  // ===================================================================
  //  6. Contract Allowlist
  // ===================================================================

  describe("contract allowlist", () => {
    const SAFE_CONTRACT = "0x1234567890abcdef1234567890abcdef12345678";

    it("allows any contract when allowlist is empty", () => {
      const result = evaluator.evaluate(makeRequest({ to: "0xanything" }));
      expect(result.allowed).toBe(true);
    });

    it("allows specified contracts", () => {
      evaluator.updatePolicy(makePolicy({ allowedContracts: [SAFE_CONTRACT] }));
      const result = evaluator.evaluate(makeRequest({ to: SAFE_CONTRACT }));
      expect(result.allowed).toBe(true);
    });

    it("blocks non-allowed contracts", () => {
      evaluator.updatePolicy(makePolicy({ allowedContracts: [SAFE_CONTRACT] }));
      const result = evaluator.evaluate(makeRequest({ to: "0xnotinthelist" }));
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe("contract_allowlist");
    });
  });

  // ===================================================================
  //  7. Value Cap
  // ===================================================================

  describe("value cap", () => {
    it("allows transactions within the cap", () => {
      const result = evaluator.evaluate(
        makeRequest({ value: "50000000000000000" }), // 0.05 ETH < 0.1 ETH
      );
      expect(result.allowed).toBe(true);
    });

    it("allows transactions at exactly the cap", () => {
      const result = evaluator.evaluate(
        makeRequest({ value: "100000000000000000" }), // 0.1 ETH = 0.1 ETH
      );
      expect(result.allowed).toBe(true);
    });

    it("blocks transactions exceeding the cap", () => {
      const result = evaluator.evaluate(
        makeRequest({ value: "200000000000000000" }), // 0.2 ETH > 0.1 ETH
      );
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe("value_cap");
    });

    it("handles zero value", () => {
      const result = evaluator.evaluate(makeRequest({ value: "0" }));
      expect(result.allowed).toBe(true);
    });

    it("rejects invalid value format", () => {
      const result = evaluator.evaluate(makeRequest({ value: "not-a-number" }));
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe("value_parse_error");
    });
  });

  // ===================================================================
  //  8. Method Selector Filtering
  // ===================================================================

  describe("method selector filtering", () => {
    const TRANSFER_SELECTOR = "0xa9059cbb"; // transfer(address,uint256)
    const APPROVE_SELECTOR = "0x095ea7b3"; // approve(address,uint256)

    it("allows any method when selector list is empty", () => {
      const result = evaluator.evaluate(makeRequest({ data: "0xdeadbeef" }));
      expect(result.allowed).toBe(true);
    });

    it("allows whitelisted method selectors", () => {
      evaluator.updatePolicy(
        makePolicy({ allowedMethodSelectors: [TRANSFER_SELECTOR] }),
      );
      const result = evaluator.evaluate(
        makeRequest({ data: TRANSFER_SELECTOR + "0".repeat(128) }),
      );
      expect(result.allowed).toBe(true);
    });

    it("blocks non-allowed method selectors", () => {
      evaluator.updatePolicy(
        makePolicy({ allowedMethodSelectors: [TRANSFER_SELECTOR] }),
      );
      const result = evaluator.evaluate(
        makeRequest({ data: APPROVE_SELECTOR + "0".repeat(128) }),
      );
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe("method_selector_allowlist");
    });

    it("skips selector check for short data", () => {
      evaluator.updatePolicy(
        makePolicy({ allowedMethodSelectors: [TRANSFER_SELECTOR] }),
      );
      // data shorter than 10 chars = no selector to check
      const result = evaluator.evaluate(makeRequest({ data: "0x1234" }));
      expect(result.allowed).toBe(true);
    });
  });

  // ===================================================================
  //  9. Rate Limiting
  // ===================================================================

  describe("rate limiting", () => {
    it("allows requests within hourly limit", () => {
      evaluator.updatePolicy(makePolicy({ maxTransactionsPerHour: 3 }));
      for (let i = 0; i < 3; i++) {
        const req = makeRequest();
        expect(evaluator.evaluate(req).allowed).toBe(true);
        evaluator.recordRequest(req.requestId);
      }
    });

    it("blocks requests exceeding hourly limit", () => {
      evaluator.updatePolicy(makePolicy({ maxTransactionsPerHour: 2 }));
      for (let i = 0; i < 2; i++) {
        const req = makeRequest();
        evaluator.evaluate(req);
        evaluator.recordRequest(req.requestId);
      }
      const result = evaluator.evaluate(makeRequest());
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe("rate_limit_hourly");
    });

    it("blocks requests exceeding daily limit", () => {
      evaluator.updatePolicy(
        makePolicy({ maxTransactionsPerHour: 100, maxTransactionsPerDay: 3 }),
      );
      for (let i = 0; i < 3; i++) {
        const req = makeRequest();
        evaluator.evaluate(req);
        evaluator.recordRequest(req.requestId);
      }
      const result = evaluator.evaluate(makeRequest());
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe("rate_limit_daily");
    });

    it("resets after time window passes", () => {
      evaluator.updatePolicy(makePolicy({ maxTransactionsPerHour: 1 }));
      const req = makeRequest();
      evaluator.evaluate(req);
      evaluator.recordRequest(req.requestId);

      // Blocked now
      expect(evaluator.evaluate(makeRequest()).allowed).toBe(false);

      // Advance time past 1 hour
      const realNow = Date.now;
      Date.now = () => realNow() + 61 * 60 * 1000;

      expect(evaluator.evaluate(makeRequest()).allowed).toBe(true);
      Date.now = realNow;
    });
  });

  // ===================================================================
  //  10. Human Confirmation
  // ===================================================================

  describe("human confirmation", () => {
    it("does not require confirmation for low-value transactions", () => {
      const result = evaluator.evaluate(makeRequest({ value: "0" }));
      expect(result.allowed).toBe(true);
      expect(result.requiresHumanConfirmation).toBe(false);
    });

    it("requires confirmation above threshold", () => {
      const result = evaluator.evaluate(
        makeRequest({ value: "50000000000000000" }), // 0.05 ETH > 0.01 ETH threshold
      );
      expect(result.allowed).toBe(true);
      expect(result.requiresHumanConfirmation).toBe(true);
    });

    it("does not require confirmation at exactly threshold", () => {
      const result = evaluator.evaluate(
        makeRequest({ value: "10000000000000000" }), // 0.01 ETH = threshold
      );
      expect(result.allowed).toBe(true);
      expect(result.requiresHumanConfirmation).toBe(false);
    });

    it("requires confirmation globally when flag is set", () => {
      evaluator.updatePolicy(makePolicy({ requireHumanConfirmation: true }));
      const result = evaluator.evaluate(makeRequest({ value: "0" }));
      expect(result.allowed).toBe(true);
      expect(result.requiresHumanConfirmation).toBe(true);
    });
  });

  // ===================================================================
  //  11. Policy Updates
  // ===================================================================

  describe("policy management", () => {
    it("returns a copy of the policy", () => {
      const policy = evaluator.getPolicy();
      policy.maxTransactionsPerHour = 9999;
      expect(evaluator.getPolicy().maxTransactionsPerHour).toBe(10);
    });

    it("applies updated policy immediately", () => {
      evaluator.updatePolicy(makePolicy({ allowedChainIds: [42161] }));
      const result = evaluator.evaluate(makeRequest({ chainId: 1 }));
      expect(result.allowed).toBe(false);
    });
  });

  // ===================================================================
  //  12. Request Recording
  // ===================================================================

  describe("recordRequest", () => {
    it("marks request as processed for replay protection", () => {
      evaluator.recordRequest("req-123");
      const result = evaluator.evaluate(makeRequest({ requestId: "req-123" }));
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe("replay_protection");
    });

    it("increments rate limit counter", () => {
      evaluator.updatePolicy(makePolicy({ maxTransactionsPerHour: 1 }));
      evaluator.recordRequest("req-1");
      const result = evaluator.evaluate(makeRequest());
      expect(result.allowed).toBe(false);
    });
  });

  // ===================================================================
  //  13. Rule Evaluation Order
  // ===================================================================

  describe("evaluation order", () => {
    it("checks replay before chain ID", () => {
      evaluator.updatePolicy(makePolicy({ allowedChainIds: [1] }));
      const req = makeRequest({ requestId: "order-test", chainId: 999 });
      evaluator.recordRequest("order-test");
      const result = evaluator.evaluate(req);
      // Should hit replay before chain ID
      expect(result.matchedRule).toBe("replay_protection");
    });

    it("checks denylist before allowlist", () => {
      const addr = "0xaabbccdd11223344556677889900aabbccddeeff";
      evaluator.updatePolicy(
        makePolicy({
          deniedContracts: [addr],
          allowedContracts: [addr],
        }),
      );
      const result = evaluator.evaluate(makeRequest({ to: addr }));
      expect(result.matchedRule).toBe("contract_denylist");
    });

    it("checks value cap before rate limit", () => {
      evaluator.updatePolicy(
        makePolicy({
          maxTransactionValueWei: "1",
          maxTransactionsPerHour: 0,
        }),
      );
      const result = evaluator.evaluate(makeRequest({ value: "999" }));
      expect(result.matchedRule).toBe("value_cap");
    });
  });
});
