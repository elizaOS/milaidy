import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSpanMock,
  spanSuccessMock,
  spanFailureMock,
  mockGetTransactionCount,
  mockDestroy,
  mockWaitForTransaction,
} = vi.hoisted(() => ({
  createSpanMock: vi.fn(),
  spanSuccessMock: vi.fn(),
  spanFailureMock: vi.fn(),
  mockGetTransactionCount: vi.fn(),
  mockDestroy: vi.fn(),
  mockWaitForTransaction: vi.fn(),
}));

vi.mock("../diagnostics/integration-observability", () => ({
  createIntegrationTelemetrySpan: createSpanMock,
}));

vi.mock("ethers", () => {
  class MockJsonRpcProvider {
    getTransactionCount = mockGetTransactionCount;
    destroy = mockDestroy;
    getBalance = vi.fn().mockResolvedValue(0n);
    getNetwork = vi.fn().mockResolvedValue({ chainId: 1n });
    estimateGas = vi.fn().mockResolvedValue(21000n);
    getFeeData = vi.fn().mockResolvedValue({ gasPrice: 0n });
    waitForTransaction = mockWaitForTransaction;
  }

  class MockWallet {
    address = "0x1234567890abcdef1234567890abcdef12345678";
  }

  return {
    ethers: {
      JsonRpcProvider: MockJsonRpcProvider,
      Wallet: MockWallet,
      formatEther: vi.fn((v: bigint) => `${v}`),
      Contract: vi.fn(),
    },
  };
});

import { TxService } from "./tx-service";

const VALID_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("tx-service observability", () => {
  let svc: TxService;

  beforeEach(() => {
    vi.clearAllMocks();
    createSpanMock.mockReturnValue({
      success: spanSuccessMock,
      failure: spanFailureMock,
    });
    svc = new TxService("https://rpc.example.com", VALID_KEY);
  });

  describe("getFreshNonce", () => {
    it("records success span on successful nonce fetch", async () => {
      mockGetTransactionCount.mockResolvedValue(42);

      const nonce = await svc.getFreshNonce();

      expect(nonce).toBe(42);
      expect(createSpanMock).toHaveBeenCalledWith({
        boundary: "wallet",
        operation: "rpc_get_nonce",
      });
      expect(spanSuccessMock).toHaveBeenCalled();
      expect(spanFailureMock).not.toHaveBeenCalled();
    });

    it("records failure span when nonce fetch throws", async () => {
      mockGetTransactionCount.mockRejectedValue(new Error("rpc down"));

      await expect(svc.getFreshNonce()).rejects.toThrow("rpc down");

      expect(spanFailureMock).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
      );
      expect(spanSuccessMock).not.toHaveBeenCalled();
    });
  });

  describe("waitForTransaction", () => {
    it("records success span on confirmed transaction", async () => {
      mockWaitForTransaction.mockResolvedValue({ status: 1 });

      const receipt = await svc.waitForTransaction("0xabc");

      expect(receipt.status).toBe(1);
      expect(createSpanMock).toHaveBeenCalledWith({
        boundary: "wallet",
        operation: "rpc_wait_for_transaction",
        timeoutMs: 120_000,
      });
      expect(spanSuccessMock).toHaveBeenCalled();
    });

    it("records failure span when transaction times out (null receipt)", async () => {
      mockWaitForTransaction.mockResolvedValue(null);

      await expect(svc.waitForTransaction("0xabc")).rejects.toThrow(
        /timed out/,
      );

      expect(spanFailureMock).toHaveBeenCalledWith(
        expect.objectContaining({ errorKind: "timeout" }),
      );
    });

    it("records failure span when transaction reverts", async () => {
      mockWaitForTransaction.mockResolvedValue({ status: 0 });

      await expect(svc.waitForTransaction("0xabc")).rejects.toThrow(/reverted/);

      expect(spanFailureMock).toHaveBeenCalledWith(
        expect.objectContaining({ errorKind: "tx_reverted" }),
      );
    });

    it("records failure span when provider throws", async () => {
      mockWaitForTransaction.mockRejectedValue(new Error("provider error"));

      await expect(svc.waitForTransaction("0xabc")).rejects.toThrow(
        "provider error",
      );

      expect(spanFailureMock).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });
  });
});
