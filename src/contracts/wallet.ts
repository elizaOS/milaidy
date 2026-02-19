/**
 * Shared wallet API contracts.
 */

export interface WalletKeys {
  evmPrivateKey: string;
  evmAddress: string;
  solanaPrivateKey: string;
  solanaAddress: string;
}

export interface WalletAddresses {
  evmAddress: string | null;
  solanaAddress: string | null;
}

export interface EvmTokenBalance {
  symbol: string;
  name: string;
  contractAddress: string;
  balance: string;
  decimals: number;
  valueUsd: string;
  logoUrl: string;
}

export interface EvmChainBalance {
  chain: string;
  chainId: number;
  nativeBalance: string;
  nativeSymbol: string;
  nativeValueUsd: string;
  tokens: EvmTokenBalance[];
  error: string | null;
}

export interface SolanaTokenBalance {
  symbol: string;
  name: string;
  mint: string;
  balance: string;
  decimals: number;
  valueUsd: string;
  logoUrl: string;
}

export interface WalletBalancesResponse {
  evm: { address: string; chains: EvmChainBalance[] } | null;
  solana: {
    address: string;
    solBalance: string;
    solValueUsd: string;
    tokens: SolanaTokenBalance[];
  } | null;
}

export interface EvmNft {
  contractAddress: string;
  tokenId: string;
  name: string;
  description: string;
  imageUrl: string;
  collectionName: string;
  tokenType: string;
}

export interface SolanaNft {
  mint: string;
  name: string;
  description: string;
  imageUrl: string;
  collectionName: string;
}

export interface WalletNftsResponse {
  evm: Array<{ chain: string; nfts: EvmNft[] }>;
  solana: { nfts: SolanaNft[] } | null;
}

export interface WalletConfigStatus {
  alchemyKeySet: boolean;
  infuraKeySet: boolean;
  ankrKeySet: boolean;
  nodeRealBscRpcSet?: boolean;
  quickNodeBscRpcSet?: boolean;
  managedBscRpcReady?: boolean;
  tradePermissionMode?: TradePermissionMode;
  tradeUserCanLocalExecute?: boolean;
  tradeAgentCanLocalExecute?: boolean;
  heliusKeySet: boolean;
  birdeyeKeySet: boolean;
  evmChains: string[];
  evmAddress: string | null;
  solanaAddress: string | null;
}

export type TradePermissionMode =
  | "user-sign-only"
  | "manual-local-key"
  | "agent-auto";

export type BscTradeSide = "buy" | "sell";

export interface BscTradePreflightRequest {
  tokenAddress?: string;
}

export interface BscTradeReadinessChecks {
  walletReady: boolean;
  rpcReady: boolean;
  chainReady: boolean;
  gasReady: boolean;
  tokenAddressValid: boolean;
}

export interface BscTradePreflightResponse {
  ok: boolean;
  walletAddress: string | null;
  rpcUrlHost: string | null;
  chainId: number | null;
  bnbBalance: string | null;
  minGasBnb: string;
  checks: BscTradeReadinessChecks;
  reasons: string[];
}

export interface BscTradeQuoteRequest {
  side: BscTradeSide;
  tokenAddress: string;
  amount: string;
  slippageBps?: number;
}

export interface BscTradeQuoteLeg {
  symbol: string;
  amount: string;
  amountWei: string;
}

export interface BscTradeQuoteResponse {
  ok: boolean;
  side: BscTradeSide;
  routerAddress: string;
  wrappedNativeAddress: string;
  tokenAddress: string;
  slippageBps: number;
  route: string[];
  quoteIn: BscTradeQuoteLeg;
  quoteOut: BscTradeQuoteLeg;
  minReceive: BscTradeQuoteLeg;
  price: string;
  preflight: BscTradePreflightResponse;
}

export interface BscTradeExecuteRequest {
  side: BscTradeSide;
  tokenAddress: string;
  amount: string;
  slippageBps?: number;
  confirm?: boolean;
  deadlineSeconds?: number;
}

export interface BscUnsignedTradeTx {
  chainId: number;
  from: string | null;
  to: string;
  data: string;
  valueWei: string;
  deadline: number;
  explorerUrl: string;
}

export interface BscUnsignedApprovalTx {
  chainId: number;
  from: string | null;
  to: string;
  data: string;
  valueWei: string;
  explorerUrl: string;
  spender: string;
  amountWei: string;
}

export interface BscTradeExecutionResult {
  hash: string;
  nonce: number;
  gasLimit: string;
  valueWei: string;
  explorerUrl: string;
  blockNumber: number | null;
  status: "success" | "pending";
  approvalHash?: string;
}

export interface BscTradeExecuteResponse {
  ok: boolean;
  side: BscTradeSide;
  mode: "local-key" | "user-sign";
  quote: BscTradeQuoteResponse;
  executed: boolean;
  requiresUserSignature: boolean;
  unsignedTx: BscUnsignedTradeTx;
  unsignedApprovalTx?: BscUnsignedApprovalTx;
  requiresApproval?: boolean;
  execution?: BscTradeExecutionResult;
}

export type WalletChain = "evm" | "solana";

export interface KeyValidationResult {
  valid: boolean;
  chain: WalletChain;
  address: string | null;
  error: string | null;
}

export interface WalletImportResult {
  success: boolean;
  chain: WalletChain;
  address: string | null;
  error: string | null;
}

export interface WalletGenerateResult {
  chain: WalletChain;
  address: string;
  privateKey: string;
}
