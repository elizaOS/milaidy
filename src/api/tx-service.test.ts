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
});
