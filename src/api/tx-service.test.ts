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
});
