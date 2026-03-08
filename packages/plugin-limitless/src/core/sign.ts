import type { WalletClient, LocalAccount } from "viem";
import { getAddress } from "viem";
import { EIP712_DOMAIN, EIP712_TYPES, type MarketVenue, type SignedOrder } from "./types.js";

export class OrderSigner {
  constructor(
    private wallet: WalletClient,
    private account: LocalAccount,
    private chainId: number = 8453,
  ) {}

  getAddress(): string {
    return this.account.address;
  }

  async signOrder(
    marketVenue: MarketVenue,
    orderParams: {
      tokenId: string;
      makerAmount: bigint;
      takerAmount: bigint;
      side: "BUY" | "SELL";
      expiration?: number;
      feeRateBps?: number;
      nonce?: number;
    },
  ): Promise<SignedOrder> {
    const { exchange } = marketVenue;

    const maker = getAddress(this.account.address);
    const signer = getAddress(this.account.address);
    const taker = "0x0000000000000000000000000000000000000000";

    const expiration = orderParams.expiration ? BigInt(orderParams.expiration) : 0n;
    const salt = BigInt(Date.now() + 86400000);
    const nonce = BigInt(orderParams.nonce || 0);
    const feeRateBps = BigInt(orderParams.feeRateBps || 300);

    const sideIdx = orderParams.side === "BUY" ? 0 : 1;
    const signatureType = 0;

    const domain = {
      ...EIP712_DOMAIN,
      chainId: this.chainId,
      verifyingContract: getAddress(exchange),
    };

    const message = {
      salt,
      maker,
      signer,
      taker,
      tokenId: BigInt(orderParams.tokenId),
      makerAmount: orderParams.makerAmount,
      takerAmount: orderParams.takerAmount,
      expiration,
      nonce,
      feeRateBps,
      side: sideIdx,
      signatureType,
    };

    const signature = await this.wallet.signTypedData({
      account: this.account,
      domain,
      types: EIP712_TYPES,
      primaryType: "Order",
      message: message as any,
    });

    return {
      salt: salt.toString(),
      maker,
      signer,
      taker,
      tokenId: orderParams.tokenId,
      makerAmount: orderParams.makerAmount.toString(),
      takerAmount: orderParams.takerAmount.toString(),
      expiration: expiration.toString(),
      nonce: Number(nonce),
      feeRateBps: Number(feeRateBps),
      side: sideIdx as 0 | 1,
      signatureType,
      signature,
    };
  }
}
