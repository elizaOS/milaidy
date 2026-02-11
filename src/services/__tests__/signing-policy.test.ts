import { beforeEach, describe, expect, it } from "vitest";
import {
  createDefaultPolicy,
  SigningPolicyEvaluator,
  type SigningRequest,
} from "../signing-policy";

function makeRequest(overrides: Partial<SigningRequest> = {}): SigningRequest {
  return {
    requestId: `req-${Date.now()}-${Math.random()}`,
    chainId: 1,
    to: "0x1234567890abcdef1234567890abcdef12345678",
    value: "1000000000000000", // 0.001 ETH
    data: "0x",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("SigningPolicyEvaluator", () => {
  let evaluator: SigningPolicyEvaluator;

  beforeEach(() => {
    evaluator = new SigningPolicyEvaluator();
  });

  describe("default policy", () => {
    it("should allow a basic low-value transaction", () => {
      const decision = evaluator.evaluate(makeRequest());
      expect(decision.allowed).toBe(true);
      expect(decision.matchedRule).toBe("allowed");
    });
  });

  describe("chain ID allowlist", () => {
    it("should deny transaction on non-allowed chain", () => {
      evaluator.updatePolicy({
        ...createDefaultPolicy(),
        allowedChainIds: [1, 137],
      });

      const decision = evaluator.evaluate(makeRequest({ chainId: 42 }));
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRule).toBe("chain_id_allowlist");
    });

    it("should allow transaction on allowed chain", () => {
      evaluator.updatePolicy({
        ...createDefaultPolicy(),
        allowedChainIds: [1, 137],
      });

      const decision = evaluator.evaluate(makeRequest({ chainId: 1 }));
      expect(decision.allowed).toBe(true);
    });

    it("should allow all chains when allowlist is empty", () => {
      evaluator.updatePolicy({
        ...createDefaultPolicy(),
        allowedChainIds: [],
      });

      const decision = evaluator.evaluate(makeRequest({ chainId: 999 }));
      expect(decision.allowed).toBe(true);
    });
  });

  describe("contract denylist", () => {
    it("should deny transaction to denylisted contract", () => {
      const contractAddr = "0xdead000000000000000000000000000000000000";
      evaluator.updatePolicy({
        ...createDefaultPolicy(),
        deniedContracts: [contractAddr],
      });

      const decision = evaluator.evaluate(makeRequest({ to: contractAddr }));
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRule).toBe("contract_denylist");
    });

    it("should be case-insensitive for addresses", () => {
      evaluator.updatePolicy({
        ...createDefaultPolicy(),
        deniedContracts: ["0xDEAD000000000000000000000000000000000000"],
      });

      const decision = evaluator.evaluate(
        makeRequest({ to: "0xdead000000000000000000000000000000000000" }),
      );
      expect(decision.allowed).toBe(false);
    });
  });

  describe("contract allowlist", () => {
    it("should deny transaction to non-allowed contract", () => {
      evaluator.updatePolicy({
        ...createDefaultPolicy(),
        allowedContracts: ["0xaaaa000000000000000000000000000000000000"],
      });

      const decision = evaluator.evaluate(
        makeRequest({ to: "0xbbbb000000000000000000000000000000000000" }),
      );
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRule).toBe("contract_allowlist");
    });

    it("should allow all contracts when allowlist is empty", () => {
      const decision = evaluator.evaluate(makeRequest());
      expect(decision.allowed).toBe(true);
    });
  });

  describe("value cap", () => {
    it("should deny transaction exceeding max value", () => {
      evaluator.updatePolicy({
        ...createDefaultPolicy(),
        maxTransactionValueWei: "1000000000000000", // 0.001 ETH
      });

      const decision = evaluator.evaluate(
        makeRequest({ value: "2000000000000000" }), // 0.002 ETH
      );
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRule).toBe("value_cap");
    });

    it("should allow transaction within cap", () => {
      const decision = evaluator.evaluate(
        makeRequest({ value: "50000000000000000" }), // 0.05 ETH < 0.1 ETH default
      );
      expect(decision.allowed).toBe(true);
    });

    it("should handle zero-value transactions", () => {
      const decision = evaluator.evaluate(makeRequest({ value: "0" }));
      expect(decision.allowed).toBe(true);
    });

    it("should deny on malformed value", () => {
      const decision = evaluator.evaluate(
        makeRequest({ value: "not-a-number" }),
      );
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRule).toBe("value_parse_error");
    });
  });

  describe("method selector allowlist", () => {
    it("should deny calls with non-allowed method selector", () => {
      evaluator.updatePolicy({
        ...createDefaultPolicy(),
        allowedMethodSelectors: ["0xa9059cbb"], // transfer(address,uint256)
      });

      const decision = evaluator.evaluate(
        makeRequest({ data: "0xdeadbeef00000000" }), // unknown selector
      );
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRule).toBe("method_selector_allowlist");
    });

    it("should allow calls with allowed method selector", () => {
      evaluator.updatePolicy({
        ...createDefaultPolicy(),
        allowedMethodSelectors: ["0xa9059cbb"],
      });

      const decision = evaluator.evaluate(
        makeRequest({ data: "0xa9059cbb00000000" }),
      );
      expect(decision.allowed).toBe(true);
    });

    it("should allow all when no selectors specified", () => {
      const decision = evaluator.evaluate(
        makeRequest({ data: "0xdeadbeef00000000" }),
      );
      expect(decision.allowed).toBe(true);
    });
  });

  describe("replay protection", () => {
    it("should deny duplicate request IDs", () => {
      const request = makeRequest({ requestId: "unique-req-1" });

      const d1 = evaluator.evaluate(request);
      expect(d1.allowed).toBe(true);
      evaluator.recordRequest(request.requestId);

      const d2 = evaluator.evaluate(request);
      expect(d2.allowed).toBe(false);
      expect(d2.matchedRule).toBe("replay_protection");
    });
  });

  describe("rate limiting", () => {
    it("should deny when hourly rate limit exceeded", () => {
      evaluator.updatePolicy({
        ...createDefaultPolicy(),
        maxTransactionsPerHour: 3,
      });

      for (let i = 0; i < 3; i++) {
        const req = makeRequest({ requestId: `rate-test-${i}` });
        const d = evaluator.evaluate(req);
        expect(d.allowed).toBe(true);
        evaluator.recordRequest(req.requestId);
      }

      const final = evaluator.evaluate(
        makeRequest({ requestId: "rate-test-final" }),
      );
      expect(final.allowed).toBe(false);
      expect(final.matchedRule).toBe("rate_limit_hourly");
    });
  });

  describe("human confirmation", () => {
    it("should require confirmation when always required", () => {
      evaluator.updatePolicy({
        ...createDefaultPolicy(),
        requireHumanConfirmation: true,
      });

      const decision = evaluator.evaluate(makeRequest({ value: "0" }));
      expect(decision.allowed).toBe(true);
      expect(decision.requiresHumanConfirmation).toBe(true);
    });

    it("should require confirmation above threshold", () => {
      evaluator.updatePolicy({
        ...createDefaultPolicy(),
        humanConfirmationThresholdWei: "1000000000000000", // 0.001 ETH
      });

      const decision = evaluator.evaluate(
        makeRequest({ value: "5000000000000000" }), // 0.005 ETH
      );
      expect(decision.allowed).toBe(true);
      expect(decision.requiresHumanConfirmation).toBe(true);
    });

    it("should not require confirmation below threshold", () => {
      evaluator.updatePolicy({
        ...createDefaultPolicy(),
        humanConfirmationThresholdWei: "1000000000000000000", // 1 ETH
        requireHumanConfirmation: false,
      });

      const decision = evaluator.evaluate(
        makeRequest({ value: "1000000000000000" }), // 0.001 ETH
      );
      expect(decision.allowed).toBe(true);
      expect(decision.requiresHumanConfirmation).toBe(false);
    });
  });

  describe("policy updates", () => {
    it("should apply updated policy to subsequent evaluations", () => {
      // Default allows 0.1 ETH
      const d1 = evaluator.evaluate(
        makeRequest({ value: "50000000000000000" }), // 0.05 ETH
      );
      expect(d1.allowed).toBe(true);

      // Tighten to 0.01 ETH
      evaluator.updatePolicy({
        ...createDefaultPolicy(),
        maxTransactionValueWei: "10000000000000000",
      });

      const d2 = evaluator.evaluate(
        makeRequest({ value: "50000000000000000" }), // 0.05 ETH
      );
      expect(d2.allowed).toBe(false);
    });

    it("should return current policy", () => {
      const policy = evaluator.getPolicy();
      expect(policy.maxTransactionsPerHour).toBe(10);
      expect(policy.maxTransactionsPerDay).toBe(50);
    });
  });
});
