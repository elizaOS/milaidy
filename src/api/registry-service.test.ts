import { describe, expect, it, vi } from "vitest";
import { RegistryService } from "./registry-service";
import type { TxService } from "./tx-service";

interface MockTxService {
  address: string;
  getFreshNonce: ReturnType<typeof vi.fn>;
  getChainId: ReturnType<typeof vi.fn>;
  getContract: ReturnType<typeof vi.fn>;
}

interface MockRegistryContract {
  isRegistered: ReturnType<typeof vi.fn>;
  totalAgents: ReturnType<typeof vi.fn>;
  getTokenId: ReturnType<typeof vi.fn>;
  getAgentInfo: ReturnType<typeof vi.fn>;
  tokenURI: ReturnType<typeof vi.fn>;
  registerAgent: ReturnType<typeof vi.fn>;
  updateTokenURI: ReturnType<typeof vi.fn>;
  updateAgent: ReturnType<typeof vi.fn>;
  updateAgentProfile: ReturnType<typeof vi.fn>;
}

function createFixture() {
  const contract: MockRegistryContract = {
    isRegistered: vi.fn().mockResolvedValue(false),
    totalAgents: vi.fn().mockResolvedValue(0n),
    getTokenId: vi.fn().mockResolvedValue(0n),
    getAgentInfo: vi.fn(),
    tokenURI: vi.fn(),
    registerAgent: vi.fn(),
    updateTokenURI: vi.fn(),
    updateAgent: vi.fn(),
    updateAgentProfile: vi.fn(),
  };

  const txService: MockTxService = {
    address: "0x1111111111111111111111111111111111111111",
    getFreshNonce: vi.fn().mockResolvedValue(7),
    getChainId: vi.fn().mockResolvedValue(8453),
    getContract: vi.fn().mockReturnValue(contract),
  };

  const service = new RegistryService(
    txService as unknown as TxService,
    "0x2222222222222222222222222222222222222222",
  );

  return { service, contract, txService };
}

describe("registry-service", () => {
  it("returns unregistered status without token details", async () => {
    const { service, contract, txService } = createFixture();
    contract.isRegistered.mockResolvedValue(false);
    contract.totalAgents.mockResolvedValue(12n);

    const status = await service.getStatus();

    expect(status).toMatchObject({
      registered: false,
      tokenId: 0,
      walletAddress: txService.address,
      totalAgents: 12,
    });
    expect(contract.getTokenId).not.toHaveBeenCalled();
  });

  it("uses a fresh nonce when registering and falls back to getTokenId when no event is present", async () => {
    const { service, contract, txService } = createFixture();
    const wait = vi.fn().mockResolvedValue({ hash: "0xtx", logs: [] });
    contract.registerAgent.mockResolvedValue({ hash: "0xsubmitted", wait });
    contract.getTokenId.mockResolvedValue(42n);

    const result = await service.register({
      name: "Milady",
      endpoint: "https://agent.example",
      capabilitiesHash: "0xcapabilities",
      tokenURI: "ipfs://token",
    });

    expect(txService.getFreshNonce).toHaveBeenCalledTimes(1);
    expect(contract.registerAgent).toHaveBeenCalledWith(
      "Milady",
      "https://agent.example",
      "0xcapabilities",
      "ipfs://token",
      { nonce: 7 },
    );
    expect(wait).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ tokenId: 42, txHash: "0xtx" });
  });

  it("fails tokenURI updates when the wallet is not registered", async () => {
    const { service, contract, txService } = createFixture();
    contract.getTokenId.mockResolvedValue(0n);

    await expect(service.updateTokenURI("ipfs://new-uri")).rejects.toThrow(
      "Agent not registered",
    );
    expect(txService.getFreshNonce).not.toHaveBeenCalled();
    expect(contract.updateTokenURI).not.toHaveBeenCalled();
  });

  it("uses a fresh nonce when updating tokenURI", async () => {
    const { service, contract, txService } = createFixture();
    contract.getTokenId.mockResolvedValue(9n);
    const wait = vi.fn().mockResolvedValue({ hash: "0xupdate" });
    contract.updateTokenURI.mockResolvedValue({ wait });
    txService.getFreshNonce.mockResolvedValue(99);

    const txHash = await service.updateTokenURI("ipfs://updated");

    expect(contract.updateTokenURI).toHaveBeenCalledWith(9, "ipfs://updated", {
      nonce: 99,
    });
    expect(wait).toHaveBeenCalledTimes(1);
    expect(txHash).toBe("0xupdate");
  });
});
