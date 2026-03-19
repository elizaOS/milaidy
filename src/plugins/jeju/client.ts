/**
 * Jeju chain client — provider, wallet, balances, and swap execution.
 */

import { ethers } from "ethers";
import { ERC20_ABI, ROUTER_ABI } from "./abi";
import { getJejuConfig } from "./config";
import { getOrCreateJejuWallet } from "./wallet";

const USDC_DECIMALS = 6;
const _WETH_DECIMALS = 18;

export type JejuClient = {
  provider: ethers.JsonRpcProvider;
  wallet: ethers.Wallet;
  address: string;
  config: ReturnType<typeof getJejuConfig>;
};

let cachedClient: JejuClient | null = null;

/**
 * Get or create the singleton Jeju client (provider + wallet).
 * Call getOrCreateJejuWallet so the user can fund the address.
 */
export function getJejuClient(): JejuClient {
  if (cachedClient) return cachedClient;

  const config = getJejuConfig();
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, {
    staticNetwork: true,
  });
  const { wallet, address } = getOrCreateJejuWallet();
  const signer = wallet.connect(provider);

  cachedClient = {
    provider,
    wallet: signer,
    address,
    config,
  };
  return cachedClient;
}

/**
 * Fetch ETH and token balances for the plugin wallet.
 */
export async function getJejuBalances(client: JejuClient): Promise<{
  eth: string;
  weth: string;
  usdc: string;
  error?: string;
}> {
  const { provider, wallet, config } = client;
  const formatEth = (v: bigint) => ethers.formatEther(v);
  const formatUsdc = (v: bigint) => ethers.formatUnits(v, USDC_DECIMALS);

  try {
    const [ethBalance, wethContract, usdcContract] = await Promise.all([
      provider.getBalance(wallet.address),
      new ethers.Contract(config.wethAddress, ERC20_ABI, provider),
      new ethers.Contract(config.usdcAddress, ERC20_ABI, provider),
    ]);

    const [wethBalance, usdcBalance] = await Promise.all([
      wethContract.balanceOf(wallet.address),
      usdcContract.balanceOf(wallet.address),
    ]);

    return {
      eth: formatEth(ethBalance),
      weth: formatEth(wethBalance),
      usdc: formatUsdc(usdcBalance),
    };
  } catch (err) {
    return {
      eth: "0",
      weth: "0",
      usdc: "0",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Execute swap: ETH → USDC (payable) or USDC → ETH (approve + swap).
 * Returns tx hash and a short summary; logs to terminal.
 */
export async function executeJejuSwap(
  client: JejuClient,
  direction: "eth_to_usdc" | "usdc_to_eth",
  amountHuman: string,
  _slippageBps: number,
  log: (msg: string) => void,
): Promise<{ success: boolean; txHash?: string; message: string }> {
  const { wallet, config } = client;
  const router = new ethers.Contract(config.routerAddress, ROUTER_ABI, wallet);
  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min

  if (direction === "eth_to_usdc") {
    const amountWei = ethers.parseEther(amountHuman);
    const path = [config.wethAddress, config.usdcAddress];
    const amountOutMin = 0n; // TODO: quote from router if available; for localnet 0 is ok with slippage
    log(`[jeju] Swapping ${amountHuman} ETH → USDC (path: WETH, USDC)`);
    try {
      const tx = await router.swapExactETHForTokensV2(
        amountOutMin,
        path,
        wallet.address,
        deadline,
        { value: amountWei },
      );
      log(`[jeju] Tx submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      log(
        `[jeju] Swap confirmed in block ${receipt?.blockNumber ?? "?"} (tx ${tx.hash})`,
      );
      return {
        success: true,
        txHash: tx.hash,
        message: `Swapped ${amountHuman} ETH for USDC. Tx: ${tx.hash}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`[jeju] Swap failed: ${msg}`);
      return { success: false, message: `Swap failed: ${msg}` };
    }
  }

  // USDC → ETH
  const amountWei = ethers.parseUnits(amountHuman, USDC_DECIMALS);
  const path = [config.usdcAddress, config.wethAddress];
  const usdc = new ethers.Contract(config.usdcAddress, ERC20_ABI, wallet);
  const amountOutMin = 0n;

  log(`[jeju] Approving USDC spend: ${amountHuman} USDC`);
  try {
    const approveTx = await usdc.approve(config.routerAddress, amountWei);
    await approveTx.wait();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[jeju] Approve failed: ${msg}`);
    return { success: false, message: `Approve failed: ${msg}` };
  }

  log(`[jeju] Swapping ${amountHuman} USDC → ETH`);
  try {
    const tx = await router.swapExactTokensForETHV2(
      amountWei,
      amountOutMin,
      path,
      wallet.address,
      deadline,
    );
    log(`[jeju] Tx submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    log(
      `[jeju] Swap confirmed in block ${receipt?.blockNumber ?? "?"} (tx ${tx.hash})`,
    );
    return {
      success: true,
      txHash: tx.hash,
      message: `Swapped ${amountHuman} USDC for ETH. Tx: ${tx.hash}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[jeju] Swap failed: ${msg}`);
    return { success: false, message: `Swap failed: ${msg}` };
  }
}
