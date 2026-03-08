/**
 * DexScreener Scanner Service — background scanning and alert processing.
 *
 * Runs periodic scans and evaluates alert rules. When rules fire,
 * alerts are dispatched through the hook bridge to become automatic
 * Milady hook events.
 *
 * @module plugins/dexscreener/service
 */

import { logger } from "@elizaos/core";
import type { IAgentRuntime } from "@elizaos/core";
import { DexScreenerClient } from "./client";
import { loadConfig, saveConfig } from "./config-store";
import { processAlerts } from "./hook-bridge";
import { DexScanner } from "./scanner";
import type {
  AlertRule,
  DexScreenerPluginConfig,
  ScanFilters,
  TokenCandidate,
} from "./types";
import { DEFAULT_SCAN_FILTERS } from "./types";

const DEFAULT_SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MIN_SCAN_INTERVAL_MS = 60 * 1000; // 1 minute minimum

export class DexScreenerService {
  private runtime: IAgentRuntime | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastCandidates: TokenCandidate[] = [];

  async start(runtime: IAgentRuntime): Promise<void> {
    this.runtime = runtime;

    const config = this.getConfig();
    const intervalMs = Math.max(
      (config.scanIntervalSeconds ?? 300) * 1000,
      MIN_SCAN_INTERVAL_MS,
    );

    // Only start background scanning if there are alert rules
    const rules = config.alertRules ?? [];
    if (rules.length === 0) {
      logger.info(
        { src: "dexscreener-service" },
        "No alert rules configured — background scanning disabled. Create rules via DEX_CONFIGURE_ALERT.",
      );
      return;
    }

    logger.info(
      {
        src: "dexscreener-service",
        intervalMs,
        ruleCount: rules.length,
        autoHookRules: rules.filter((r) => r.autoHook).length,
      },
      `DexScreener service starting: ${rules.length} alert rule(s), scanning every ${intervalMs / 1000}s`,
    );

    this.running = true;

    // Run first scan after short delay
    setTimeout(() => {
      if (this.running) this.runScanCycle();
    }, 5_000);

    this.timer = setInterval(() => {
      if (this.running) this.runScanCycle();
    }, intervalMs);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info({ src: "dexscreener-service" }, "DexScreener service stopped");
  }

  getLastCandidates(): TokenCandidate[] {
    return this.lastCandidates;
  }

  private getConfig(): DexScreenerPluginConfig {
    if (!this.runtime) return {};
    return loadConfig(this.runtime);
  }

  private getFilters(): ScanFilters {
    const config = this.getConfig();
    return {
      ...DEFAULT_SCAN_FILTERS,
      ...(config.filters ?? {}),
    };
  }

  private getAlertRules(): AlertRule[] {
    const config = this.getConfig();
    return config.alertRules ?? [];
  }

  private async runScanCycle(): Promise<void> {
    if (!this.runtime) return;

    const rules = this.getAlertRules();
    const activeRules = rules.filter((r) => r.enabled);
    if (activeRules.length === 0) return;

    try {
      const filters = this.getFilters();
      const client = new DexScreenerClient(
        this.getConfig().cacheTtlSeconds,
      );
      const scanner = new DexScanner(client);

      logger.debug(
        {
          src: "dexscreener-service",
          chains: filters.chains,
          limit: filters.limit,
        },
        "Running DexScreener scan cycle",
      );

      const candidates = await scanner.scan(filters);
      this.lastCandidates = candidates;

      if (candidates.length === 0) {
        logger.debug(
          { src: "dexscreener-service" },
          "Scan returned no candidates",
        );
        return;
      }

      // Process alerts through the hook bridge
      const { updatedRules, firedCount, results } = await processAlerts(
        activeRules,
        candidates,
        { sessionKey: "dexscreener" },
      );

      if (firedCount > 0) {
        logger.info(
          {
            src: "dexscreener-service",
            firedCount,
            totalRules: activeRules.length,
            results: results.filter((r) => r.fired),
          },
          `DexScreener: ${firedCount} alert(s) fired`,
        );

        // Persist updated rules (with lastAlertAt timestamps)
        const config = this.getConfig();
        const allRules = config.alertRules ?? [];
        const updatedMap = new Map(updatedRules.map((r) => [r.id, r]));
        const merged = allRules.map((r) => updatedMap.get(r.id) ?? r);
        saveConfig(this.runtime, { ...config, alertRules: merged });
      }
    } catch (error) {
      logger.error(
        {
          src: "dexscreener-service",
          error: error instanceof Error ? error.message : String(error),
        },
        "DexScreener scan cycle failed",
      );
    }
  }
}
