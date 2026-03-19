/**
 * Jeju localnet defaults for the Milady plugin.
 * ETH and USDC addresses are static; other tokens may change on localnet restart.
 */

export const JEJU_DEFAULTS = {
  /** L2 RPC URL (localnet). */
  RPC_URL: "http://127.0.0.1:6546",
  /** Chain ID (localnet). */
  CHAIN_ID: 31337,
  /** XLPRouter on localnet. */
  ROUTER_ADDRESS: "0xffa7CA1AEEEbBc30C874d32C7e22F052BbEa0429" as const,
  /** WETH on localnet (contracts.json). */
  WETH_ADDRESS: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as const,
  /** USDC on localnet (6 decimals). */
  USDC_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const,
  /** Explorer base URL for tx links. */
  EXPLORER_URL: "http://127.0.0.1:4000",
} as const;

export const JEJU_ENV_KEYS = {
  RPC_URL: "JEJU_RPC_URL",
  CHAIN_ID: "JEJU_CHAIN_ID",
  ROUTER_ADDRESS: "JEJU_ROUTER_ADDRESS",
  WETH_ADDRESS: "JEJU_WETH_ADDRESS",
  USDC_ADDRESS: "JEJU_USDC_ADDRESS",
} as const;

export function getJejuConfig(env: NodeJS.ProcessEnv = process.env): {
  rpcUrl: string;
  chainId: number;
  routerAddress: string;
  wethAddress: string;
  usdcAddress: string;
  explorerUrl: string;
} {
  return {
    rpcUrl:
      env[JEJU_ENV_KEYS.RPC_URL]?.trim() || JEJU_DEFAULTS.RPC_URL,
    chainId: safeParseInt(
      env[JEJU_ENV_KEYS.CHAIN_ID],
      JEJU_DEFAULTS.CHAIN_ID,
    ),
    routerAddress:
      env[JEJU_ENV_KEYS.ROUTER_ADDRESS]?.trim() ||
      JEJU_DEFAULTS.ROUTER_ADDRESS,
    wethAddress:
      env[JEJU_ENV_KEYS.WETH_ADDRESS]?.trim() || JEJU_DEFAULTS.WETH_ADDRESS,
    usdcAddress:
      env[JEJU_ENV_KEYS.USDC_ADDRESS]?.trim() || JEJU_DEFAULTS.USDC_ADDRESS,
    explorerUrl: JEJU_DEFAULTS.EXPLORER_URL,
  };
}

function safeParseInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}
