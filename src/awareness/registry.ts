/**
 * AwarenessRegistry — core orchestration layer for the Self-Awareness System.
 *
 * Manages contributor registration, summary composition (Layer 1),
 * detail retrieval (Layer 2), caching, sanitization, and invalidation.
 *
 * @architecture All public methods are fault-tolerant: individual contributor
 * errors are captured and surfaced as `[{id}: unavailable]` markers — the
 * registry itself NEVER throws from composeSummary / getDetail.
 */
import type { IAgentRuntime } from "@elizaos/core";
import {
  type AwarenessContributor,
  type AwarenessInvalidationEvent,
  DEFAULT_CACHE_TTL_MS,
  SELF_STATUS_SCHEMA_VERSION,
  SUMMARY_CHAR_LIMIT,
  SUMMARY_TOTAL_CHAR_LIMIT,
} from "../contracts/awareness";

// ---------------------------------------------------------------------------
// Sanitization patterns (P0 guardrail)
// ---------------------------------------------------------------------------

const SANITIZE_PATTERNS: RegExp[] = [
  // API key prefixes
  /sk-ant-\S+/gi,
  /sk-\S{20,}/gi,
  /gsk_\S+/gi,
  /xai-\S+/gi,
  // Private keys (hex, 64 hex chars)
  /0x[a-fA-F0-9]{64}/gi,
  // Generic long hex secrets (64+ hex chars — avoids false-positives on ETH addresses / git SHAs)
  /[a-fA-F0-9]{64,}/gi,
  // Prompt injection attempts
  /ignore\s+(all\s+)?(previous\s+)?instructions/gi,
  /you are now/gi,
];

function sanitize(input: string): string {
  let output = input;
  for (const pattern of SANITIZE_PATTERNS) {
    output = output.replace(pattern, "[REDACTED]");
  }
  return output;
}

// ---------------------------------------------------------------------------
// Cache entry
// ---------------------------------------------------------------------------

interface CacheEntry {
  value: string;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// AwarenessRegistry
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Global accessor (module-level variable pattern — same as custom-actions.ts)
// ---------------------------------------------------------------------------

let _globalRegistry: AwarenessRegistry | null = null;

export function setGlobalAwarenessRegistry(registry: AwarenessRegistry): void {
  _globalRegistry = registry;
}

export function getGlobalAwarenessRegistry(): AwarenessRegistry | null {
  return _globalRegistry;
}

// ---------------------------------------------------------------------------
// AwarenessRegistry
// ---------------------------------------------------------------------------

export class AwarenessRegistry {
  private readonly contributors: AwarenessContributor[] = [];
  private readonly contributorIds = new Set<string>();
  private readonly cache = new Map<string, CacheEntry>();

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  register(contributor: AwarenessContributor): void {
    if (this.contributorIds.has(contributor.id)) {
      throw new Error(
        `AwarenessRegistry: duplicate contributor id "${contributor.id}"`,
      );
    }
    this.contributorIds.add(contributor.id);
    // Insert in sorted position so composeSummary/composeAllDetails never need
    // to sort — contributors are registered at startup and rarely change.
    const idx = this.contributors.findIndex(
      (c) => c.position > contributor.position,
    );
    if (idx === -1) {
      this.contributors.push(contributor);
    } else {
      this.contributors.splice(idx, 0, contributor);
    }
  }

  // -----------------------------------------------------------------------
  // Layer 1 — composeSummary
  // -----------------------------------------------------------------------

  async composeSummary(runtime: IAgentRuntime): Promise<string> {
    // Contributors are kept sorted by position at registration time.
    const lines: string[] = [];

    for (const contributor of this.contributors) {
      let line: string;
      try {
        line = await this.getCachedSummary(contributor, runtime);
      } catch {
        line = `[${contributor.id}: unavailable]`;
      }

      // Skip empty strings.
      if (line === "") continue;

      // Sanitize untrusted output.
      if (contributor.trusted !== true) {
        line = sanitize(line);
      }

      // Enforce per-line char limit.
      if (line.length > SUMMARY_CHAR_LIMIT) {
        line = `${line.slice(0, SUMMARY_CHAR_LIMIT - 3)}...`;
      }

      lines.push(line);
    }

    // Apply global char budget.
    const header = `[Self Status v${SELF_STATUS_SCHEMA_VERSION}]`;
    const result = this.applyGlobalBudget(lines, header);
    return result;
  }

  // -----------------------------------------------------------------------
  // Layer 2 — getDetail
  // -----------------------------------------------------------------------

  async getDetail(
    runtime: IAgentRuntime,
    module: string,
    level: "brief" | "full",
  ): Promise<string> {
    if (module === "all") {
      return this.composeAllDetails(runtime, level);
    }

    const contributor = this.contributors.find((c) => c.id === module);
    if (!contributor) {
      const available = this.contributors.map((c) => c.id).join(", ");
      return `[Error: unknown module "${module}". Available: ${available}]`;
    }

    if (!contributor.detail) {
      return `[${contributor.id}: no detail available]`;
    }

    try {
      const detail = await contributor.detail(runtime, level);
      return contributor.trusted !== true ? sanitize(detail) : detail;
    } catch {
      return `[${contributor.id}: unavailable]`;
    }
  }

  // -----------------------------------------------------------------------
  // Cache invalidation
  // -----------------------------------------------------------------------

  invalidate(event: AwarenessInvalidationEvent): void {
    for (const contributor of this.contributors) {
      if (contributor.invalidateOn?.includes(event)) {
        this.cache.delete(contributor.id);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async getCachedSummary(
    contributor: AwarenessContributor,
    runtime: IAgentRuntime,
  ): Promise<string> {
    const ttl = contributor.cacheTtl ?? DEFAULT_CACHE_TTL_MS;
    const cached = this.cache.get(contributor.id);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const value = await contributor.summary(runtime);

    this.cache.set(contributor.id, {
      value,
      expiresAt: now + ttl,
    });

    return value;
  }

  private applyGlobalBudget(lines: string[], header: string): string {
    // Header + newline is always included.
    const headerLen = header.length + 1; // +1 for the newline after header
    let budget = SUMMARY_TOTAL_CHAR_LIMIT - headerLen;
    const included: string[] = [];
    let remaining = 0;
    // Track included.join("\n").length incrementally to avoid O(n) join per pop.
    let bodyLen = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineLen = lines[i].length + 1; // +1 for newline separator
      if (budget >= lineLen) {
        // First item contributes its length; each subsequent item also adds the
        // newline separator that join() would insert before it.
        bodyLen =
          included.length === 0
            ? lines[i].length
            : bodyLen + 1 + lines[i].length;
        included.push(lines[i]);
        budget -= lineLen;
      } else {
        remaining = lines.length - i;
        break;
      }
    }

    if (remaining > 0) {
      let suffix = `\n[+${remaining} more]`;
      // Make room for the suffix if needed — recompute suffix each iteration
      // because remaining++ can change its digit count (e.g. 9→10, 99→100).
      while (
        bodyLen + suffix.length + headerLen + 1 > SUMMARY_TOTAL_CHAR_LIMIT &&
        included.length > 1
      ) {
        const removed = included.pop() as string;
        // Subtract the removed line and its preceding newline separator.
        bodyLen -= removed.length + 1;
        remaining++;
        suffix = `\n[+${remaining} more]`;
      }
      return `${header}\n${included.join("\n")}${suffix}`;
    }

    return `${header}\n${included.join("\n")}`;
  }

  private async composeAllDetails(
    runtime: IAgentRuntime,
    level: "brief" | "full",
  ): Promise<string> {
    // Contributors are kept sorted by position at registration time.
    const parts: string[] = [];
    for (const contributor of this.contributors) {
      if (!contributor.detail) {
        parts.push(`[${contributor.id}: no detail available]`);
        continue;
      }
      try {
        let detail = await contributor.detail(runtime, level);
        if (contributor.trusted !== true) {
          detail = sanitize(detail);
        }
        parts.push(detail);
      } catch {
        parts.push(`[${contributor.id}: unavailable]`);
      }
    }

    return parts.join("\n");
  }
}
