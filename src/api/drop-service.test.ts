import { ethers } from "ethers";
import { describe, expect, it, vi } from "vitest";
import { DropService } from "./drop-service";
import type { TxService } from "./tx-service";

interface MockTxService {
  address: string;
  getFreshNonce: ReturnType<typeof vi.fn>;
  getContract: ReturnType<typeof vi.fn>;
}

interface MockDropContract {
  getCollectionDetails: ReturnType<typeof vi.fn>;
  whitelistMintOpen: ReturnType<typeof vi.fn>;
  hasMinted: ReturnType<typeof vi.fn>;
  SHINY_PRICE: ReturnType<typeof vi.fn>;
  mint: ReturnType<typeof vi.fn>;
  mintShiny: ReturnType<typeof vi.fn>;
  mintWhitelist: ReturnType<typeof vi.fn>;
  getAgentMintNumber: ReturnType<typeof vi.fn>;
  isShiny: ReturnType<typeof vi.fn>;
}

function createFixture(dropEnabled: boolean = true) {
  const contract: MockDropContract = {
    getCollectionDetails: vi.fn().mockResolvedValue([2138n, 100n, true]),
    whitelistMintOpen: vi.fn().mockResolvedValue(false),
    hasMinted: vi.fn().mockResolvedValue(false),
    SHINY_PRICE: vi.fn().mockResolvedValue(100_000_000_000_000_000n),
    mint: vi.fn(),
    mintShiny: vi.fn(),
    mintWhitelist: vi.fn(),
    getAgentMintNumber: vi.fn().mockResolvedValue(1n),
    isShiny: vi.fn().mockResolvedValue(false),
  };

  const txService: MockTxService = {
    address: "0x3333333333333333333333333333333333333333",
    getFreshNonce: vi.fn().mockResolvedValue(5),
    getContract: vi.fn().mockReturnValue(contract),
  };

  const service = new DropService(
    txService as unknown as TxService,
    "0x4444444444444444444444444444444444444444",
    dropEnabled,
  );

  return { service, contract, txService };
}

describe("drop-service", () => {
  it("returns disabled defaults when drop feature is off", async () => {
    const { service, contract } = createFixture(false);

    const status = await service.getStatus();

    expect(status).toEqual({
      dropEnabled: false,
      publicMintOpen: false,
      whitelistMintOpen: false,
      mintedOut: false,
      currentSupply: 0,
      maxSupply: 2138,
      shinyPrice: "0.1",
      userHasMinted: false,
    });
    expect(contract.getCollectionDetails).not.toHaveBeenCalled();
  });

  it("uses a fresh nonce for public mint transactions", async () => {
    const { service, contract, txService } = createFixture(true);
    const wait = vi.fn().mockResolvedValue({ hash: "0xmint", logs: [] });
    contract.mint.mockResolvedValue({ hash: "0xsubmitted", wait });
    txService.getFreshNonce.mockResolvedValue(8);

    const result = await service.mint("Milady", "https://agent.example");

    expect(txService.getFreshNonce).toHaveBeenCalledTimes(1);
    expect(contract.mint).toHaveBeenCalledWith(
      "Milady",
      "https://agent.example",
      expect.any(String),
      { nonce: 8 },
    );
    expect(wait).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      agentId: 0,
      mintNumber: 0,
      txHash: "0xmint",
      isShiny: false,
    });
  });

  it("uses shiny price + fresh nonce for shiny mints", async () => {
    const { service, contract, txService } = createFixture(true);
    const wait = vi.fn().mockResolvedValue({ hash: "0xshiny", logs: [] });
    contract.mintShiny.mockResolvedValue({ hash: "0xsubmitted", wait });
    contract.SHINY_PRICE.mockResolvedValue(123n);
    txService.getFreshNonce.mockResolvedValue(12);

    const result = await service.mintShiny(
      "Shiny",
      "https://agent.example/shiny",
      "0xcap",
    );

    expect(contract.mintShiny).toHaveBeenCalledWith(
      "Shiny",
      "https://agent.example/shiny",
      "0xcap",
      { value: 123n, nonce: 12 },
    );
    expect(wait).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      agentId: 0,
      mintNumber: 0,
      txHash: "0xshiny",
      isShiny: true,
    });
  });

  it("uses a fresh nonce for whitelist mints", async () => {
    const { service, contract, txService } = createFixture(true);
    const wait = vi.fn().mockResolvedValue({ hash: "0xwl", logs: [] });
    contract.mintWhitelist.mockResolvedValue({ hash: "0xsubmitted", wait });
    txService.getFreshNonce.mockResolvedValue(21);

    const result = await service.mintWithWhitelist(
      "Whitelist",
      "https://agent.example/whitelist",
      ["0xproof1", "0xproof2"],
      "0xcap",
    );

    expect(contract.mintWhitelist).toHaveBeenCalledWith(
      "Whitelist",
      "https://agent.example/whitelist",
      "0xcap",
      ["0xproof1", "0xproof2"],
      { nonce: 21 },
    );
    expect(wait).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      agentId: 0,
      mintNumber: 0,
      txHash: "0xwl",
      isShiny: false,
    });
  });

  it("marks drop status as minted out when current supply reaches max", async () => {
    const { service, contract } = createFixture(true);
    contract.getCollectionDetails.mockResolvedValue([100n, 100n, true]);
    contract.whitelistMintOpen.mockResolvedValue(true);
    contract.hasMinted.mockResolvedValue(true);
    contract.SHINY_PRICE.mockResolvedValue(200_000_000_000_000_000n);

    const status = await service.getStatus();

    expect(status).toEqual({
      dropEnabled: true,
      publicMintOpen: true,
      whitelistMintOpen: true,
      mintedOut: true,
      currentSupply: 100,
      maxSupply: 100,
      shinyPrice: "0.2",
      userHasMinted: true,
    });
  });

  it("surfaces mint failures from transaction wait", async () => {
    const { service, contract } = createFixture(true);
    const wait = vi
      .fn()
      .mockRejectedValue(
        new Error("insufficient funds for gas * price + value"),
      );
    contract.mint.mockResolvedValue({ hash: "0xsubmitted", wait });

    await expect(
      service.mint("Milady", "https://agent.example"),
    ).rejects.toThrow("insufficient funds");
  });

  it("returns full enabled status from contract", async () => {
    const { service, contract } = createFixture(true);
    contract.getCollectionDetails.mockResolvedValue([2138n, 50n, true]);
    contract.whitelistMintOpen.mockResolvedValue(false);
    contract.hasMinted.mockResolvedValue(false);
    contract.SHINY_PRICE.mockResolvedValue(100_000_000_000_000_000n);

    const status = await service.getStatus();

    expect(status).toEqual({
      dropEnabled: true,
      publicMintOpen: true,
      whitelistMintOpen: false,
      mintedOut: false,
      currentSupply: 50,
      maxSupply: 2138,
      shinyPrice: "0.1",
      userHasMinted: false,
    });
  });

  it("parses AgentMinted event from logs for mint result", async () => {
    const { service, contract } = createFixture(true);

    const iface = new ethers.Interface([
      "event AgentMinted(uint256 indexed agentId, uint256 indexed mintNumber, address indexed owner, bool shiny)",
    ]);
    const encoded = iface.encodeEventLog("AgentMinted", [
      7,
      42,
      "0x3333333333333333333333333333333333333333",
      true,
    ]);

    const wait = vi.fn().mockResolvedValue({
      hash: "0xminted",
      logs: [{ topics: encoded.topics, data: encoded.data }],
    });
    contract.mint.mockResolvedValue({ hash: "0xsubmitted", wait });

    const result = await service.mint("Milady", "https://agent.example");

    expect(result).toEqual({
      agentId: 7,
      mintNumber: 42,
      txHash: "0xminted",
      isShiny: true,
    });
  });

  it("delegates getMintNumber to contract", async () => {
    const { service, contract } = createFixture(true);
    contract.getAgentMintNumber.mockResolvedValue(99n);

    const mintNumber = await service.getMintNumber(5);

    expect(mintNumber).toBe(99);
    expect(contract.getAgentMintNumber).toHaveBeenCalledWith(5);
  });

  it("delegates checkIsShiny to contract", async () => {
    const { service, contract } = createFixture(true);
    contract.isShiny.mockResolvedValue(true);

    const isShiny = await service.checkIsShiny(5);

    expect(isShiny).toBe(true);
    expect(contract.isShiny).toHaveBeenCalledWith(5);
  });

  it("uses default capabilities hash when not provided", async () => {
    const { service, contract } = createFixture(true);
    const wait = vi.fn().mockResolvedValue({ hash: "0xmint", logs: [] });
    contract.mint.mockResolvedValue({ hash: "0xsubmitted", wait });

    await service.mint("Milady", "https://agent.example");

    expect(contract.mint).toHaveBeenCalledWith(
      "Milady",
      "https://agent.example",
      ethers.id("milady-agent"),
      { nonce: 5 },
    );
  });

  it("surfaces shiny mint failure from transaction wait", async () => {
    const { service, contract } = createFixture(true);
    contract.SHINY_PRICE.mockResolvedValue(100_000_000_000_000_000n);
    const wait = vi
      .fn()
      .mockRejectedValue(new Error("execution reverted: not enough ETH"));
    contract.mintShiny.mockResolvedValue({ hash: "0xsubmitted", wait });

    await expect(
      service.mintShiny("Shiny", "https://agent.example/shiny"),
    ).rejects.toThrow("not enough ETH");
  });

  it("surfaces whitelist mint failure from transaction wait", async () => {
    const { service, contract } = createFixture(true);
    const wait = vi
      .fn()
      .mockRejectedValue(new Error("execution reverted: invalid proof"));
    contract.mintWhitelist.mockResolvedValue({ hash: "0xsubmitted", wait });

    await expect(
      service.mintWithWhitelist(
        "WL",
        "https://agent.example/wl",
        ["0xproof"],
        "0xcap",
      ),
    ).rejects.toThrow("invalid proof");
  });

  // ── Timeout handling ────────────────────────────────────────────────

  it("surfaces timeout from mint tx.wait", async () => {
    const { service, contract } = createFixture(true);
    const wait = vi
      .fn()
      .mockRejectedValue(new Error("Transaction timed out after 120000ms"));
    contract.mint.mockResolvedValue({ hash: "0xsubmitted", wait });

    await expect(
      service.mint("Milady", "https://agent.example"),
    ).rejects.toThrow("timed out");
  });

  it("surfaces timeout from mintShiny tx.wait", async () => {
    const { service, contract } = createFixture(true);
    contract.SHINY_PRICE.mockResolvedValue(100_000_000_000_000_000n);
    const wait = vi
      .fn()
      .mockRejectedValue(new Error("Transaction timed out after 120000ms"));
    contract.mintShiny.mockResolvedValue({ hash: "0xsubmitted", wait });

    await expect(
      service.mintShiny("Shiny", "https://agent.example/shiny"),
    ).rejects.toThrow("timed out");
  });

  it("surfaces timeout from mintWithWhitelist tx.wait", async () => {
    const { service, contract } = createFixture(true);
    const wait = vi
      .fn()
      .mockRejectedValue(new Error("Transaction timed out after 120000ms"));
    contract.mintWhitelist.mockResolvedValue({ hash: "0xsubmitted", wait });

    await expect(
      service.mintWithWhitelist(
        "WL",
        "https://agent.example/wl",
        ["0xproof"],
        "0xcap",
      ),
    ).rejects.toThrow("timed out");
  });

  // ── Nonce/retry error mapping ───────────────────────────────────────

  it("surfaces nonce-expired from mint contract call", async () => {
    const { service, contract } = createFixture(true);
    contract.mint.mockRejectedValue(new Error("nonce has already been used"));

    await expect(
      service.mint("Milady", "https://agent.example"),
    ).rejects.toThrow("nonce has already been used");
  });

  it("surfaces replacement-underpriced from mintShiny tx submission", async () => {
    const { service, contract } = createFixture(true);
    contract.SHINY_PRICE.mockResolvedValue(100_000_000_000_000_000n);
    contract.mintShiny.mockRejectedValue(
      new Error("replacement transaction underpriced"),
    );

    await expect(
      service.mintShiny("Shiny", "https://agent.example/shiny"),
    ).rejects.toThrow("replacement transaction underpriced");
  });

  // ── Contract read / service failure mapping ─────────────────────────

  it("surfaces contract read failure from getStatus when enabled", async () => {
    const { service, contract } = createFixture(true);
    contract.getCollectionDetails.mockRejectedValue(
      new Error("call revert exception"),
    );

    await expect(service.getStatus()).rejects.toThrow("call revert exception");
  });

  it("surfaces SHINY_PRICE fetch failure before mintShiny tx", async () => {
    const { service, contract } = createFixture(true);
    contract.SHINY_PRICE.mockRejectedValue(
      new Error("execution reverted: contract not deployed"),
    );

    await expect(
      service.mintShiny("Shiny", "https://agent.example/shiny"),
    ).rejects.toThrow("contract not deployed");
  });

  it("propagates getFreshNonce failure through mint", async () => {
    const { service, txService } = createFixture(true);
    txService.getFreshNonce.mockRejectedValue(
      new Error("RPC connection refused"),
    );

    await expect(
      service.mint("Milady", "https://agent.example"),
    ).rejects.toThrow("RPC connection refused");
  });
});
