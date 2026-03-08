/** Optional: used by NFA routes when present. WHY: allows typecheck without resolving packages/ (excluded from tsconfig). */
declare module "@milady/plugin-bnb-identity" {
  export function buildMerkleRoot(leafHashes: string[]): string;
  export function parseLearnings(
    markdown: string,
  ): Array<{ date: string; content: string; hash: string }>;
  export function sha256(data: string): string;
}

declare module "@elizaos/plugin-secrets-manager" {
  const plugin: import("@elizaos/core").Plugin;
  export default plugin;
  export { plugin };
}

declare module "@elizaos/plugin-cua" {
  const plugin: import("@elizaos/core").Plugin;
  export default plugin;
  export { plugin };
}

declare module "@elizaos/plugin-obsidian" {
  const plugin: import("@elizaos/core").Plugin;
  export default plugin;
  export { plugin };
}

declare module "@elizaos/plugin-code" {
  const plugin: import("@elizaos/core").Plugin;
  export default plugin;
  export { plugin };
}

declare module "@elizaos/plugin-claude-code-workbench" {
  const plugin: import("@elizaos/core").Plugin;
  export default plugin;
  export { plugin };
}

declare module "@elizaos/plugin-xai" {
  const plugin: import("@elizaos/core").Plugin;
  export default plugin;
  export { plugin };
}

declare module "@elizaos/plugin-deepseek" {
  const plugin: import("@elizaos/core").Plugin;
  export default plugin;
  export { plugin };
}

declare module "@elizaos/plugin-mistral" {
  const plugin: import("@elizaos/core").Plugin;
  export default plugin;
  export { plugin };
}

declare module "@elizaos/plugin-together" {
  const plugin: import("@elizaos/core").Plugin;
  export default plugin;
  export { plugin };
}

declare module "@milady/plugin-limitless" {
  const plugin: import("@elizaos/core").Plugin;
  export default plugin;
  export { plugin as limitlessPlugin };
  export { LimitlessClient } from "@milady/plugin-limitless";
  export { TradingClient } from "@milady/plugin-limitless";
  export { PortfolioClient } from "@milady/plugin-limitless";
}

declare module "@opinion-labs/opinion-clob-sdk" {
  export class Client {
    constructor(opts: Record<string, unknown>);
    getMarkets(opts: Record<string, unknown>): Promise<unknown>;
    getMarket(id: number): Promise<unknown>;
    getCategoricalMarket(id: number): Promise<unknown>;
    getOrderbook(tokenId: string): Promise<unknown>;
    getLatestPrice(tokenId: string): Promise<unknown>;
    getMyPositions(): Promise<unknown>;
    getMyOrders(opts: Record<string, unknown>): Promise<unknown>;
    placeOrder(opts: Record<string, unknown>): Promise<unknown>;
    cancelOrder(id: string): Promise<unknown>;
    cancelAllOrders(): Promise<unknown>;
    enableTrading(): Promise<unknown>;
    redeem(id: number): Promise<unknown[]>;
  }
  export const OrderSide: { BUY: number; SELL: number };
  export const OrderType: { MARKET_ORDER: number; LIMIT_ORDER: number };
  export const CHAIN_ID_BNB_MAINNET: number;
  export const DEFAULT_API_HOST: string;
}
