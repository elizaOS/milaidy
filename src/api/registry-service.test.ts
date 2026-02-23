import { ethers } from "ethers";
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

  it("surfaces register failures from transaction wait", async () => {
    const { service, contract } = createFixture();
    const wait = vi
      .fn()
      .mockRejectedValue(new Error("replacement transaction underpriced"));
    contract.registerAgent.mockResolvedValue({ hash: "0xsubmitted", wait });

    await expect(
      service.register({
        name: "Milady",
        endpoint: "https://agent.example",
        capabilitiesHash: "0xcapabilities",
        tokenURI: "ipfs://token",
      }),
    ).rejects.toThrow("replacement transaction underpriced");
  });

  it("uses a fresh nonce when updating endpoint/capabilities", async () => {
    const { service, contract, txService } = createFixture();
    const wait = vi.fn().mockResolvedValue({ hash: "0xagentupdate" });
    contract.updateAgent.mockResolvedValue({ wait });
    txService.getFreshNonce.mockResolvedValue(44);

    const txHash = await service.updateAgent(
      "https://agent.example/v2",
      "0xcapabilities2",
    );

    expect(contract.updateAgent).toHaveBeenCalledWith(
      "https://agent.example/v2",
      "0xcapabilities2",
      { nonce: 44 },
    );
    expect(wait).toHaveBeenCalledTimes(1);
    expect(txHash).toBe("0xagentupdate");
  });

  it("uses a fresh nonce when syncing the full profile", async () => {
    const { service, contract, txService } = createFixture();
    const wait = vi.fn().mockResolvedValue({ hash: "0xprofilesync" });
    contract.updateAgentProfile.mockResolvedValue({
      hash: "0xsubmitted",
      wait,
    });
    txService.getFreshNonce.mockResolvedValue(55);

    const txHash = await service.syncProfile({
      name: "Milady v2",
      endpoint: "https://agent.example/v2",
      capabilitiesHash: "0xprofilecap",
      tokenURI: "ipfs://token-v2",
    });

    expect(contract.updateAgentProfile).toHaveBeenCalledWith(
      "Milady v2",
      "https://agent.example/v2",
      "0xprofilecap",
      "ipfs://token-v2",
      { nonce: 55 },
    );
    expect(wait).toHaveBeenCalledTimes(1);
    expect(txHash).toBe("0xprofilesync");
  });

  it("returns full agent info for registered wallet", async () => {
    const { service, contract, txService } = createFixture();
    contract.isRegistered.mockResolvedValue(true);
    contract.totalAgents.mockResolvedValue(50n);
    contract.getTokenId.mockResolvedValue(7n);
    contract.getAgentInfo.mockResolvedValue([
      "Milady",
      "https://agent.example",
      "0xcaphash",
      true,
    ]);
    contract.tokenURI.mockResolvedValue("ipfs://token-7");

    const status = await service.getStatus();

    expect(status).toEqual({
      registered: true,
      tokenId: 7,
      agentName: "Milady",
      agentEndpoint: "https://agent.example",
      capabilitiesHash: "0xcaphash",
      isActive: true,
      tokenURI: "ipfs://token-7",
      walletAddress: txService.address,
      totalAgents: 50,
    });
  });

  it("parses AgentRegistered event from logs for tokenId", async () => {
    const { service, contract } = createFixture();

    const iface = new ethers.Interface([
      "event AgentRegistered(uint256 indexed tokenId, address indexed owner, string name, string endpoint)",
    ]);
    const encoded = iface.encodeEventLog("AgentRegistered", [
      42,
      "0x1111111111111111111111111111111111111111",
      "Milady",
      "https://agent.example",
    ]);

    const wait = vi.fn().mockResolvedValue({
      hash: "0xtx",
      logs: [{ topics: encoded.topics, data: encoded.data }],
    });
    contract.registerAgent.mockResolvedValue({ hash: "0xsubmitted", wait });

    const result = await service.register({
      name: "Milady",
      endpoint: "https://agent.example",
      capabilitiesHash: "0xcap",
      tokenURI: "ipfs://token",
    });

    expect(result).toEqual({ tokenId: 42, txHash: "0xtx" });
    expect(contract.getTokenId).not.toHaveBeenCalled();
  });

  it("uses default capabilities hash when empty string passed to register", async () => {
    const { service, contract } = createFixture();
    const wait = vi.fn().mockResolvedValue({ hash: "0xtx", logs: [] });
    contract.registerAgent.mockResolvedValue({ hash: "0xsubmitted", wait });
    contract.getTokenId.mockResolvedValue(1n);

    await service.register({
      name: "Milady",
      endpoint: "https://agent.example",
      capabilitiesHash: "",
      tokenURI: "ipfs://token",
    });

    expect(contract.registerAgent).toHaveBeenCalledWith(
      "Milady",
      "https://agent.example",
      RegistryService.defaultCapabilitiesHash(),
      "ipfs://token",
      { nonce: 7 },
    );
  });

  it("uses default capabilities hash when empty string passed to updateAgent", async () => {
    const { service, contract, txService } = createFixture();
    const wait = vi.fn().mockResolvedValue({ hash: "0xupdate" });
    contract.updateAgent.mockResolvedValue({ wait });
    txService.getFreshNonce.mockResolvedValue(10);

    await service.updateAgent("https://agent.example/v2", "");

    expect(contract.updateAgent).toHaveBeenCalledWith(
      "https://agent.example/v2",
      RegistryService.defaultCapabilitiesHash(),
      { nonce: 10 },
    );
  });

  it("delegates getChainId to txService", async () => {
    const { service, txService } = createFixture();

    const chainId = await service.getChainId();

    expect(chainId).toBe(8453);
    expect(txService.getChainId).toHaveBeenCalledTimes(1);
  });

  it("exposes address from txService", () => {
    const { service, txService } = createFixture();

    expect(service.address).toBe(txService.address);
  });

  it("exposes contractAddress", () => {
    const { service } = createFixture();

    expect(service.contractAddress).toBe(
      "0x2222222222222222222222222222222222222222",
    );
  });

  it("delegates isRegistered to contract", async () => {
    const { service, contract } = createFixture();
    contract.isRegistered.mockResolvedValue(true);

    const result = await service.isRegistered("0xsome-address");

    expect(result).toBe(true);
    expect(contract.isRegistered).toHaveBeenCalledWith("0xsome-address");
  });

  it("returns default capabilities hash from static method", () => {
    const hash = RegistryService.defaultCapabilitiesHash();

    expect(hash).toBe(ethers.id("milady-agent"));
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
