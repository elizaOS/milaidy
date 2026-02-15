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
  heliusKeySet: boolean;
  birdeyeKeySet: boolean;
  evmChains: string[];
  evmAddress: string | null;
  solanaAddress: string | null;
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
