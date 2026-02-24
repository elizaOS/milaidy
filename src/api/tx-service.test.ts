import { ethers } from "ethers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TxService } from "./tx-service";

const RPC_URL = "http://127.0.0.1:8545";
const VALID_PRIVATE_KEY = "1".repeat(64);

function createService(): TxService {
  return new TxService(RPC_URL, VALID_PRIVATE_KEY);
}

describe("tx-service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects invalid private keys with a clear error", () => {
    expect(() => new TxService(RPC_URL, "not-a-key")).toThrow(
      /Invalid EVM_PRIVATE_KEY/,
    );
  });

  it("fetches nonce from a fresh provider using pending block state", async () => {
    const nonceSpy = vi
      .spyOn(ethers.JsonRpcProvider.prototype, "getTransactionCount")
      .mockResolvedValue(17);
    const destroySpy = vi
      .spyOn(ethers.JsonRpcProvider.prototype, "destroy")
      .mockImplementation(() => undefined);

    const service = createService();
    const nonce = await service.getFreshNonce();

    expect(nonce).toBe(17);
    expect(nonceSpy).toHaveBeenCalledWith(service.address, "pending");
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it("destroys the fresh provider even when nonce lookup fails", async () => {
    const nonceError = new Error("nonce fetch failed");
    vi.spyOn(
      ethers.JsonRpcProvider.prototype,
      "getTransactionCount",
    ).mockRejectedValue(nonceError);
    const destroySpy = vi
      .spyOn(ethers.JsonRpcProvider.prototype, "destroy")
      .mockImplementation(() => undefined);

    const service = createService();

    await expect(service.getFreshNonce()).rejects.toThrow("nonce fetch failed");
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it("throws when waiting for a transaction times out", async () => {
    const service = createService();
    const provider = (
      service as unknown as {
        provider: {
          waitForTransaction: (
            txHash: string,
            confirmations: number,
            timeoutMs: number,
          ) => Promise<ethers.TransactionReceipt | null>;
        };
      }
    ).provider;

    vi.spyOn(provider, "waitForTransaction").mockResolvedValue(null);

    await expect(service.waitForTransaction("0xabc", 1, 500)).rejects.toThrow(
      "timed out",
    );
  });

  it("throws when a mined transaction reverted", async () => {
    const service = createService();
    const provider = (
      service as unknown as {
        provider: {
          waitForTransaction: (
            txHash: string,
            confirmations: number,
            timeoutMs: number,
          ) => Promise<ethers.TransactionReceipt | null>;
        };
      }
    ).provider;

    const revertedReceipt = {
      status: 0,
      hash: "0xreverted",
      logs: [],
    } as unknown as ethers.TransactionReceipt;

    vi.spyOn(provider, "waitForTransaction").mockResolvedValue(revertedReceipt);

    await expect(
      service.waitForTransaction("0xreverted", 1, 1_000),
    ).rejects.toThrow("reverted");
  });

  it("returns the receipt for successful transactions", async () => {
    const service = createService();
    const provider = (
      service as unknown as {
        provider: {
          waitForTransaction: (
            txHash: string,
            confirmations: number,
            timeoutMs: number,
          ) => Promise<ethers.TransactionReceipt | null>;
        };
      }
    ).provider;

    const receipt = {
      status: 1,
      hash: "0xsuccess",
      logs: [],
    } as unknown as ethers.TransactionReceipt;

    vi.spyOn(provider, "waitForTransaction").mockResolvedValue(receipt);

    await expect(service.waitForTransaction("0xsuccess")).resolves.toBe(
      receipt,
    );
  });

  it("accepts 0x-prefixed private keys", () => {
    const service = new TxService(RPC_URL, `0x${VALID_PRIVATE_KEY}`);
    expect(service.address).toBeTruthy();
  });

  it("shows preview in error for short keys", () => {
    expect(() => new TxService(RPC_URL, "abc")).toThrow(/empty or too short/);
  });

  it("getBalance delegates to provider", async () => {
    const service = createService();
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getBalance").mockResolvedValue(
      5_000_000_000_000_000_000n,
    );

    const balance = await service.getBalance();

    expect(balance).toBe(5_000_000_000_000_000_000n);
  });

  it("getBalanceFormatted returns ETH string", async () => {
    const service = createService();
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getBalance").mockResolvedValue(
      1_500_000_000_000_000_000n,
    );

    const formatted = await service.getBalanceFormatted();

    expect(formatted).toBe("1.5");
  });

  it("getChainId returns network chain ID", async () => {
    const service = createService();
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getNetwork").mockResolvedValue({
      chainId: 8453n,
    } as ethers.Network);

    const chainId = await service.getChainId();

    expect(chainId).toBe(8453);
  });

  it("estimateGasCostEth combines gas estimate and fee data", async () => {
    const service = createService();
    vi.spyOn(ethers.JsonRpcProvider.prototype, "estimateGas").mockResolvedValue(
      21_000n,
    );
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getFeeData").mockResolvedValue({
      gasPrice: 1_000_000_000n,
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
    } as unknown as ethers.FeeData);

    const cost = await service.estimateGasCostEth({ to: "0x0" });

    // 21000 * 1 gwei = 0.000021 ETH
    expect(cost).toBe("0.000021");
  });

  it("hasEnoughBalance returns true when sufficient", async () => {
    const service = createService();
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getBalance").mockResolvedValue(
      1_000_000_000_000_000_000n,
    );
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getFeeData").mockResolvedValue({
      gasPrice: 1_000_000_000n,
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
    } as unknown as ethers.FeeData);

    const result = await service.hasEnoughBalance(0n, 21_000n);

    expect(result).toBe(true);
  });

  it("hasEnoughBalance returns false when insufficient", async () => {
    const service = createService();
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getBalance").mockResolvedValue(
      100n,
    );
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getFeeData").mockResolvedValue({
      gasPrice: 1_000_000_000n,
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
    } as unknown as ethers.FeeData);

    const result = await service.hasEnoughBalance(
      1_000_000_000_000_000_000n,
      21_000n,
    );

    expect(result).toBe(false);
  });

  // ── Timeout edge cases ──────────────────────────────────────────────

  it("waitForTransaction forwards default 120s timeout to provider", async () => {
    const service = createService();
    const provider = (
      service as unknown as {
        provider: {
          waitForTransaction: (
            txHash: string,
            confirmations: number,
            timeoutMs: number,
          ) => Promise<ethers.TransactionReceipt | null>;
        };
      }
    ).provider;

    const receipt = {
      status: 1,
      hash: "0xdefault",
      logs: [],
    } as unknown as ethers.TransactionReceipt;

    const spy = vi
      .spyOn(provider, "waitForTransaction")
      .mockResolvedValue(receipt);

    await service.waitForTransaction("0xdefault");

    expect(spy).toHaveBeenCalledWith("0xdefault", 1, 120_000);
  });

  it("waitForTransaction forwards custom confirmations and timeout", async () => {
    const service = createService();
    const provider = (
      service as unknown as {
        provider: {
          waitForTransaction: (
            txHash: string,
            confirmations: number,
            timeoutMs: number,
          ) => Promise<ethers.TransactionReceipt | null>;
        };
      }
    ).provider;

    const receipt = {
      status: 1,
      hash: "0xcustom",
      logs: [],
    } as unknown as ethers.TransactionReceipt;

    const spy = vi
      .spyOn(provider, "waitForTransaction")
      .mockResolvedValue(receipt);

    await service.waitForTransaction("0xcustom", 3, 60_000);

    expect(spy).toHaveBeenCalledWith("0xcustom", 3, 60_000);
  });

  // ── Nonce isolation ─────────────────────────────────────────────────

  it("creates an isolated provider for each getFreshNonce call", async () => {
    const nonceSpy = vi
      .spyOn(ethers.JsonRpcProvider.prototype, "getTransactionCount")
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(11);
    const destroySpy = vi
      .spyOn(ethers.JsonRpcProvider.prototype, "destroy")
      .mockImplementation(() => undefined);

    const service = createService();
    const first = await service.getFreshNonce();
    const second = await service.getFreshNonce();

    expect(first).toBe(10);
    expect(second).toBe(11);
    expect(nonceSpy).toHaveBeenCalledTimes(2);
    expect(destroySpy).toHaveBeenCalledTimes(2);
  });

  it("getFreshNonce returns correct value after a simulated failed transaction", async () => {
    vi.spyOn(ethers.JsonRpcProvider.prototype, "destroy").mockImplementation(
      () => undefined,
    );
    const nonceSpy = vi
      .spyOn(ethers.JsonRpcProvider.prototype, "getTransactionCount")
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(5);

    const service = createService();

    // First call — nonce for tx that will "fail"
    const nonceBefore = await service.getFreshNonce();
    // Second call — nonce should still be 5 (pending tx didn't land)
    const nonceAfter = await service.getFreshNonce();

    expect(nonceBefore).toBe(5);
    expect(nonceAfter).toBe(5);
    expect(nonceSpy).toHaveBeenCalledTimes(2);
  });

  // ── Failure propagation ─────────────────────────────────────────────

  it("estimateGasCostEth propagates provider estimateGas failure", async () => {
    const service = createService();
    vi.spyOn(ethers.JsonRpcProvider.prototype, "estimateGas").mockRejectedValue(
      new Error("execution reverted"),
    );

    await expect(service.estimateGasCostEth({ to: "0x0" })).rejects.toThrow(
      "execution reverted",
    );
  });

  it("hasEnoughBalance propagates getBalance failure", async () => {
    const service = createService();
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getBalance").mockRejectedValue(
      new Error("RPC connection refused"),
    );

    await expect(service.hasEnoughBalance(0n, 21_000n)).rejects.toThrow(
      "RPC connection refused",
    );
  });

  it("getChainId propagates network errors", async () => {
    const service = createService();
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getNetwork").mockRejectedValue(
      new Error("could not detect network"),
    );

    await expect(service.getChainId()).rejects.toThrow(
      "could not detect network",
    );
  });
});
