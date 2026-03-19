import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WalletTradeLedgerEntry } from "../contracts/wallet.js";
import {
  buildWalletTradingProfile,
  loadWalletTradingProfile,
  readWalletTradeLedgerStore,
  recordWalletTradeLedgerEntry,
  resolveWalletTradingProfileFilePath,
  updateWalletTradeLedgerEntryStatus,
} from "./wallet-trading-profile.js";

const TMP_PREFIX = "eliza-wallet-profile-";

function createTempStateDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
}

function buildEntry(
  partial: Partial<WalletTradeLedgerEntry> &
    Pick<WalletTradeLedgerEntry, "hash" | "side" | "status" | "tokenAddress">,
): WalletTradeLedgerEntry {
  return {
    hash: partial.hash,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    updatedAt: partial.updatedAt ?? new Date().toISOString(),
    source: partial.source ?? "manual",
    side: partial.side,
    tokenAddress: partial.tokenAddress,
    slippageBps: partial.slippageBps ?? 100,
    route: partial.route ?? ["0xroute"],
    quoteIn: partial.quoteIn ?? {
      symbol: "BNB",
      amount: "1",
      amountWei: "1000000000000000000",
    },
    quoteOut: partial.quoteOut ?? {
      symbol: "ELIZA",
      amount: "10",
      amountWei: "10000000000000000000",
    },
    status: partial.status,
    confirmations: partial.confirmations ?? 1,
    nonce: partial.nonce ?? null,
    blockNumber: partial.blockNumber ?? 1,
    gasUsed: partial.gasUsed ?? null,
    effectiveGasPriceWei: partial.effectiveGasPriceWei ?? null,
    ...(partial.reason ? { reason: partial.reason } : {}),
    explorerUrl:
      partial.explorerUrl ?? `https://bscscan.com/tx/${partial.hash}`,
  };
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("wallet-trading-profile", () => {
  it("computes FIFO realized PnL, win rate, and tx success rate", () => {
    const now = Date.now();
    const entries: WalletTradeLedgerEntry[] = [
      buildEntry({
        hash: "0xbuy1",
        side: "buy",
        status: "success",
        tokenAddress: "0xtoken",
        quoteIn: {
          symbol: "BNB",
          amount: "1",
          amountWei: "1000000000000000000",
        },
        quoteOut: {
          symbol: "ELIZA",
          amount: "10",
          amountWei: "10000000000000000000",
        },
        createdAt: new Date(now - 50_000).toISOString(),
      }),
      buildEntry({
        hash: "0xbuy2",
        side: "buy",
        status: "success",
        tokenAddress: "0xtoken",
        quoteIn: {
          symbol: "BNB",
          amount: "2",
          amountWei: "2000000000000000000",
        },
        quoteOut: {
          symbol: "ELIZA",
          amount: "10",
          amountWei: "10000000000000000000",
        },
        createdAt: new Date(now - 40_000).toISOString(),
      }),
      buildEntry({
        hash: "0xsell1",
        side: "sell",
        status: "success",
        tokenAddress: "0xtoken",
        quoteIn: {
          symbol: "ELIZA",
          amount: "15",
          amountWei: "15000000000000000000",
        },
        quoteOut: {
          symbol: "BNB",
          amount: "2.7",
          amountWei: "2700000000000000000",
        },
        createdAt: new Date(now - 30_000).toISOString(),
      }),
      buildEntry({
        hash: "0xreverted1",
        side: "buy",
        status: "reverted",
        tokenAddress: "0xtoken",
        quoteIn: {
          symbol: "BNB",
          amount: "0.3",
          amountWei: "300000000000000000",
        },
        quoteOut: {
          symbol: "ELIZA",
          amount: "3",
          amountWei: "3000000000000000000",
        },
        createdAt: new Date(now - 20_000).toISOString(),
      }),
      buildEntry({
        hash: "0xpending1",
        side: "buy",
        status: "pending",
        tokenAddress: "0xtoken",
        quoteIn: {
          symbol: "BNB",
          amount: "0.2",
          amountWei: "200000000000000000",
        },
        quoteOut: {
          symbol: "ELIZA",
          amount: "2",
          amountWei: "2000000000000000000",
        },
        createdAt: new Date(now - 10_000).toISOString(),
      }),
    ];

    const profile = buildWalletTradingProfile(entries, {
      window: "all",
      source: "all",
    });

    expect(profile.summary.totalSwaps).toBe(5);
    expect(profile.summary.buyCount).toBe(4);
    expect(profile.summary.sellCount).toBe(1);
    expect(profile.summary.successCount).toBe(3);
    expect(profile.summary.revertedCount).toBe(1);
    expect(profile.summary.settledCount).toBe(4);
    expect(profile.summary.txSuccessRate).toBe(75);
    expect(profile.summary.realizedPnlBnb).toBe("0.7");
    expect(profile.summary.tradeWinRate).toBe(100);
    expect(profile.summary.volumeBnb).toBe("5.7");

    expect(profile.tokenBreakdown).toHaveLength(1);
    expect(profile.tokenBreakdown[0]?.symbol).toBe("ELIZA");
    expect(profile.tokenBreakdown[0]?.realizedPnlBnb).toBe("0.7");
    expect(profile.recentSwaps[0]?.hash).toBe("0xpending1");
  });

  it("applies window and source filters", () => {
    const now = Date.now();
    const entries: WalletTradeLedgerEntry[] = [
      buildEntry({
        hash: "0xold-agent",
        side: "buy",
        source: "agent",
        status: "success",
        tokenAddress: "0xtoken",
        createdAt: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      buildEntry({
        hash: "0xnew-agent",
        side: "buy",
        source: "agent",
        status: "success",
        tokenAddress: "0xtoken",
        createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      buildEntry({
        hash: "0xnew-manual",
        side: "buy",
        source: "manual",
        status: "success",
        tokenAddress: "0xtoken",
        createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    const last30Agent = buildWalletTradingProfile(entries, {
      window: "30d",
      source: "agent",
    });
    expect(last30Agent.summary.totalSwaps).toBe(1);
    expect(last30Agent.recentSwaps[0]?.hash).toBe("0xnew-agent");

    const last7All = buildWalletTradingProfile(entries, {
      window: "7d",
      source: "all",
    });
    expect(last7All.summary.totalSwaps).toBe(2);
  });

  it("persists entries and updates tx status in ledger store", () => {
    const stateDir = createTempStateDir();
    tempDirs.push(stateDir);

    recordWalletTradeLedgerEntry(
      {
        hash: "0xabc",
        source: "manual",
        side: "buy",
        tokenAddress: "0xtoken",
        slippageBps: 100,
        route: ["0xwbnb", "0xtoken"],
        quoteIn: {
          symbol: "BNB",
          amount: "1",
          amountWei: "1000000000000000000",
        },
        quoteOut: {
          symbol: "ELIZA",
          amount: "10",
          amountWei: "10000000000000000000",
        },
        status: "pending",
        confirmations: 0,
        nonce: 2,
        blockNumber: null,
        gasUsed: null,
        effectiveGasPriceWei: null,
        explorerUrl: "https://bscscan.com/tx/0xabc",
      },
      stateDir,
    );

    const updated = updateWalletTradeLedgerEntryStatus(
      "0xabc",
      {
        status: "success",
        confirmations: 12,
        nonce: 2,
        blockNumber: 1000,
        gasUsed: "21000",
        effectiveGasPriceWei: "1000000000",
        explorerUrl: "https://bscscan.com/tx/0xabc",
      },
      stateDir,
    );
    expect(updated?.status).toBe("success");
    expect(updated?.confirmations).toBe(12);

    const profile = loadWalletTradingProfile({
      stateDir,
      window: "all",
      source: "all",
    });
    expect(profile.summary.totalSwaps).toBe(1);
    expect(profile.summary.successCount).toBe(1);
  });

  it("backs up corrupt ledger file and falls back to empty store", () => {
    const stateDir = createTempStateDir();
    tempDirs.push(stateDir);
    const ledgerPath = resolveWalletTradingProfileFilePath(stateDir);
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, "{ this is invalid json", "utf-8");

    const store = readWalletTradeLedgerStore(stateDir);
    expect(store.entries).toHaveLength(0);

    const files = fs.readdirSync(path.dirname(ledgerPath));
    expect(
      files.some((file) => file.startsWith("trading-profile.v1.json.corrupt-")),
    ).toBe(true);
  });
});
