/**
 * Jeju plugin wallet — generate or load a persistent key for the agent.
 * Stored under ~/.milady/jeju-wallet.json so it does not mix with EVM_PRIVATE_KEY.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { ethers } from "ethers";

const WALLET_FILENAME = "jeju-wallet.json";
const STATE_DIRNAME = ".milady";

function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.MILADY_STATE_DIR?.trim();
  if (override) {
    const trimmed = override.replace(/^~(?=$|[\\/])/, os.homedir());
    return path.resolve(trimmed);
  }
  return path.join(os.homedir(), STATE_DIRNAME);
}

export type JejuWalletData = {
  privateKey: string;
  address: string;
  createdAt: string;
};

function getWalletPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), WALLET_FILENAME);
}

function generatePrivateKey(): string {
  const bytes = crypto.randomBytes(32);
  return "0x" + bytes.toString("hex");
}

/**
 * Load existing Jeju wallet from disk, or create, persist, and return a new one.
 * Logs the wallet address for the user to fund.
 */
export function getOrCreateJejuWallet(): {
  wallet: ethers.Wallet;
  address: string;
  isNew: boolean;
} {
  const walletPath = getWalletPath();
  let data: JejuWalletData | null = null;

  try {
    const raw = fs.readFileSync(walletPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as JejuWalletData).privateKey === "string" &&
      typeof (parsed as JejuWalletData).address === "string"
    ) {
      data = parsed as JejuWalletData;
    }
  } catch {
    // File missing or invalid — will create new wallet
  }

  if (data?.privateKey && data?.address) {
    const wallet = new ethers.Wallet(data.privateKey);
    return {
      wallet,
      address: wallet.address,
      isNew: false,
    };
  }

  const privateKey = generatePrivateKey();
  const wallet = new ethers.Wallet(privateKey);
  const newData: JejuWalletData = {
    privateKey: wallet.privateKey,
    address: wallet.address,
    createdAt: new Date().toISOString(),
  };

  const dir = path.dirname(walletPath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      walletPath,
      JSON.stringify(newData, null, 2),
      "utf-8",
    );
  } catch (err) {
    throw new Error(
      `[jeju] Failed to persist wallet at ${walletPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    wallet,
    address: wallet.address,
    isNew: true,
  };
}
