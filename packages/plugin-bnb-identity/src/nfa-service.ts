/**
 * Bap578NfaService — direct on-chain BAP-578 NFA contract interactions.
 *
 * Uses ethers v6 to call the BAP-578 contract directly — no MCP dependency.
 * Read-only operations (getNfaInfo) work without a private key.
 * Write operations (mintNfa, updateLearningRoot) require a private key
 * and explicit user confirmation at the action layer.
 */

import { Contract, JsonRpcProvider, Wallet } from "ethers";
import type { Bap578NfaConfig, MintNfaResult, NfaInfoResult } from "./types.js";

/** Public RPC endpoints for supported BNB Chain networks. */
const RPC_URLS: Record<string, string> = {
  bsc: "https://bsc-dataseed1.binance.org/",
  "bsc-testnet": "https://data-seed-prebsc-1-s1.binance.org:8545/",
};

/**
 * Minimal ABI for the BAP-578 NFA contract.
 * Covers mint, updateLearningRoot, getNfaInfo, and tokenURI.
 */
const BAP578_ABI = [
  "function mint(string merkleRoot) returns (uint256 tokenId)",
  "function updateLearningRoot(uint256 tokenId, string merkleRoot)",
  "function getNfaInfo(uint256 tokenId) view returns (address owner, string merkleRoot, bool paused)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event Minted(uint256 indexed tokenId, address indexed owner, string merkleRoot)",
  "event LearningRootUpdated(uint256 indexed tokenId, string merkleRoot)",
];

export class Bap578NfaService {
  private config: Bap578NfaConfig;

  constructor(config: Bap578NfaConfig) {
    this.config = config;
  }

  /** Reads NFA info from the contract. No private key needed. */
  async getNfaInfo(tokenId: string): Promise<NfaInfoResult> {
    const provider = this.getProvider();
    const contract = new Contract(
      this.config.contractAddress,
      BAP578_ABI,
      provider,
    );

    const [owner, merkleRoot, paused] = (await contract.getNfaInfo(
      BigInt(tokenId),
    )) as [string, string, boolean];

    let tokenUri = "";
    try {
      tokenUri = (await contract.tokenURI(BigInt(tokenId))) as string;
    } catch {
      // tokenURI is optional on some deployments
    }

    return {
      tokenId,
      owner,
      merkleRoot,
      paused,
      network: this.config.network,
      ...(tokenUri ? { tokenURI: tokenUri } : {}),
    };
  }

  /**
   * Mints a new NFA token with the given Merkle root.
   * Caller must obtain user confirmation before calling this.
   */
  async mintNfa(merkleRoot: string): Promise<MintNfaResult> {
    const wallet = this.getSigner();
    const contract = new Contract(
      this.config.contractAddress,
      BAP578_ABI,
      wallet,
    );

    const tx = await contract.mint(merkleRoot);
    const receipt = await tx.wait();

    // Parse tokenId from the Minted event
    const mintedEvent = receipt?.logs
      ?.map((log: { topics: string[]; data: string }) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e: { name: string } | null) => e?.name === "Minted");

    const tokenId = mintedEvent?.args?.tokenId?.toString() ?? "0";

    return {
      tokenId,
      txHash: receipt?.hash ?? tx.hash,
      network: this.config.network,
    };
  }

  /**
   * Updates the on-chain Merkle root for an existing NFA token.
   * Caller must own the token and obtain user confirmation first.
   */
  async updateLearningRoot(
    tokenId: string,
    merkleRoot: string,
  ): Promise<{ txHash: string }> {
    const wallet = this.getSigner();
    const contract = new Contract(
      this.config.contractAddress,
      BAP578_ABI,
      wallet,
    );

    const tx = await contract.updateLearningRoot(BigInt(tokenId), merkleRoot);
    const receipt = await tx.wait();

    return { txHash: receipt?.hash ?? tx.hash };
  }

  private getProvider(): JsonRpcProvider {
    const rpcUrl = RPC_URLS[this.config.network];
    if (!rpcUrl) {
      throw new Error(
        `No RPC URL configured for network "${this.config.network}". ` +
          "Supported: bsc, bsc-testnet.",
      );
    }
    return new JsonRpcProvider(rpcUrl);
  }

  private getSigner(): Wallet {
    if (!this.config.privateKey) {
      throw new Error(
        "BNB_PRIVATE_KEY is required for write operations. " +
          "Add it to ~/.milady/.env or milady.json plugin parameters.",
      );
    }
    return new Wallet(this.config.privateKey, this.getProvider());
  }
}
