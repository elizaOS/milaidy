/**
 * Append-only audit log for sandbox security events.
 * Never log real secret values — only token IDs and metadata.
 */

export type AuditEventType =
  | "sandbox_mode_transition"
  | "secret_token_replacement_outbound"
  | "secret_sanitization_inbound"
  | "privileged_capability_invocation"
  | "policy_decision"
  | "signing_request_submitted"
  | "signing_request_rejected"
  | "signing_request_approved"
  | "plugin_fallback_attempt"
  | "security_kill_switch"
  | "sandbox_lifecycle"
  | "fetch_proxy_error";

export interface AuditEntry {
  timestamp: string;
  type: AuditEventType;
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
  severity: "info" | "warn" | "error" | "critical";
  traceId?: string;
}

export interface AuditLogConfig {
  console?: boolean;
  maxEntries?: number;
  sink?: (entry: AuditEntry) => void;
}

export class SandboxAuditLog {
  private entries: AuditEntry[] = [];
  private consoleEnabled: boolean;
  private maxEntries: number;
  private sink?: (entry: AuditEntry) => void;

  constructor(config: AuditLogConfig = {}) {
    this.consoleEnabled = config.console ?? true;
    this.maxEntries = config.maxEntries ?? 5000;
    this.sink = config.sink;
  }

  record(entry: Omit<AuditEntry, "timestamp">): void {
    const full: AuditEntry = { ...entry, timestamp: new Date().toISOString() };
    this.entries.push(full);

    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-Math.floor(this.maxEntries / 2));
    }

    if (this.consoleEnabled) {
      const line = `[AUDIT:${full.severity.toUpperCase()}] ${full.type}: ${full.summary}`;
      if (full.severity === "critical" || full.severity === "error")
        console.error(line);
      else if (full.severity === "warn") console.warn(line);
      else console.log(line);
    }

    this.sink?.(full);
  }

  recordTokenReplacement(
    direction: "outbound" | "inbound",
    url: string,
    tokenIds: string[],
  ): void {
    this.record({
      type:
        direction === "outbound"
          ? "secret_token_replacement_outbound"
          : "secret_sanitization_inbound",
      summary: `${direction}: ${tokenIds.length} token(s) for ${url}`,
      metadata: {
        direction,
        url,
        tokenCount: tokenIds.length,
        tokenIds: tokenIds.join(","),
      },
      severity: "info",
    });
  }

  recordCapabilityInvocation(
    capability: string,
    detail: string,
    metadata?: Record<string, string | number | boolean>,
  ): void {
    this.record({
      type: "privileged_capability_invocation",
      summary: `${capability}: ${detail}`,
      metadata: { capability, ...metadata },
      severity: "info",
    });
  }

  recordPolicyDecision(
    decision: "allow" | "deny",
    reason: string,
    metadata?: Record<string, string | number | boolean>,
  ): void {
    this.record({
      type: "policy_decision",
      summary: `${decision}: ${reason}`,
      metadata: { decision, reason, ...metadata },
      severity: decision === "deny" ? "warn" : "info",
    });
  }

  getRecent(count = 100): AuditEntry[] {
    return this.entries.slice(-count);
  }

  getByType(type: AuditEventType, count = 50): AuditEntry[] {
    return this.entries.filter((e) => e.type === type).slice(-count);
  }

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }
}
