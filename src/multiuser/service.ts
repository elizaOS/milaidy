import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  ChatCreateSessionRequestSchema,
  ChatSendMessageRequestSchema,
  ConfirmActionRequestSchema,
  LoginRequestSchema,
  PermissionPatchSchema,
  SecretUpsertRequestSchema,
  SignupRequestSchema,
  TenantSettingsUpdateSchema,
  type ChatCreateSessionRequest,
  type ChatSendMessageRequest,
  type ConfirmActionRequest,
  type LoginRequest,
  type PermissionPatchRequest,
  type SecretUpsertRequest,
  type SignupRequest,
  type TenantSettingsUpdate,
} from "./api-contracts.js";
import { InMemoryExecutionQueue } from "./execution-queue.js";
import { resolveStateDir } from "../config/paths.js";
import {
  defaultPolymarketPermissions,
  evaluateBetPolicy,
  type BetRequest,
} from "./polymarket-policy.js";
import { createRateLimiter } from "./rate-limiter.js";
import {
  decryptSecret,
  encryptSecret,
  parseSecretKeyringFromEnv,
  redactSecret,
  type EncryptedSecret,
} from "./security.js";
import type {
  ActionOutcome,
  AuditLog,
  AuthSession,
  ChatMessage,
  ChatSession,
  IntegrationPermissions,
  PolymarketPermissions,
  TenantSettings,
  User,
  UserRole,
} from "./types.js";

type AccessTokenPayload = {
  sub: string;
  sid: string;
  role: UserRole;
  iat: number;
  exp: number;
};

type SecretRecord = {
  id: string;
  ownerUserId: string;
  scope: "workspace" | "user";
  integrationId: string;
  secretKey: string;
  encrypted: EncryptedSecret;
  createdAt: string;
  updatedAt: string;
};

type ExecutionJobRecord = {
  id: string;
  userId: string;
  sessionId: string | null;
  status:
    | "queued"
    | "running"
    | "waiting_confirmation"
    | "completed"
    | "failed";
  toolName: string;
  riskLevel: "safe" | "can_execute" | "can_spend";
  inputJson: string;
  outputJson: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

type WalletBindingRecord = {
  userId: string;
  evmAddress: string | null;
  solanaAddress: string | null;
  updatedAt: string;
};

type PendingConfirmation = {
  executionJobId: string;
  userId: string;
  codeHash: string;
  expiresAtMs: number;
  failedAttempts: number;
  payload: ActionExecuteRequest;
};

type SessionContext = {
  user: User;
  session: AuthSession;
};

type ActionExecuteRequest = {
  integrationId: string;
  action: string;
  sessionId?: string | null;
  params?: Record<string, unknown>;
};

type MultiUserSnapshotV1 = {
  version: 1;
  users: User[];
  sessions: AuthSession[];
  settings: TenantSettings[];
  secrets: SecretRecord[];
  chatSessions: ChatSession[];
  chatMessages: ChatMessage[];
  auditLogs: AuditLog[];
  jobs: ExecutionJobRecord[];
  pendingConfirmations: PendingConfirmation[];
  quotaCounters: Array<[string, number]>;
  walletBindings?: WalletBindingRecord[];
};

type SqliteDbLike = {
  exec(sql: string): void;
  prepare(sql: string): {
    run: (...args: unknown[]) => unknown;
    get: (...args: unknown[]) => unknown;
  };
};

export type ExecutionBackend = (args: {
  userId: string;
  executionJobId: string;
  integrationId: string;
  action: string;
  params: Record<string, unknown>;
  sessionId: string | null;
}) => Promise<Record<string, unknown>>;

export class MultiUserError extends Error {
  status: number;
  code: string;
  retryAfterSec?: number;

  constructor(
    message: string,
    status: number,
    code: string,
    retryAfterSec?: number,
  ) {
    super(message);
    this.name = "MultiUserError";
    this.status = status;
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function base64UrlEncode(input: Buffer | string): string {
  const raw = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return raw
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(`${normalized}${"=".repeat(padLen)}`, "base64");
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function hashRefreshToken(token: string): string {
  return sha256Hex(token);
}

function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function createPasswordHash(password: string): string {
  const iterations = 210_000;
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto
    .pbkdf2Sync(password, salt, iterations, 32, "sha256")
    .toString("hex");
  return `pbkdf2$sha256$${iterations}$${salt}$${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256")
    return false;
  const iterations = Number.parseInt(parts[2] ?? "", 10);
  const salt = parts[3] ?? "";
  const expected = parts[4] ?? "";
  if (!Number.isFinite(iterations) || iterations <= 0 || !salt || !expected)
    return false;
  const derived = crypto
    .pbkdf2Sync(password, salt, iterations, 32, "sha256")
    .toString("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(derived, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseJsonObject(input: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(input);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignored
  }
  return {};
}

function parseActionExecuteRequest(
  body: Record<string, unknown>,
): ActionExecuteRequest {
  const integrationId =
    typeof body.integrationId === "string" && body.integrationId.trim()
      ? body.integrationId.trim()
      : "other";
  const action =
    typeof body.action === "string" && body.action.trim()
      ? body.action.trim()
      : "tool.execute";
  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.trim()
      ? body.sessionId.trim()
      : null;
  const params =
    body.params &&
    typeof body.params === "object" &&
    !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : {};
  return { integrationId, action, sessionId, params };
}

function parsePolymarketBet(input: ActionExecuteRequest): BetRequest {
  const params = input.params ?? {};
  const marketId =
    typeof params.marketId === "string" ? params.marketId.trim() : "";
  const outcome =
    typeof params.outcome === "string" ? params.outcome.trim() : "";
  const amountRaw = params.amountUsd;
  const amountUsd =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
        ? Number.parseFloat(amountRaw)
        : NaN;
  if (!marketId || !outcome || !Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new MultiUserError(
      "Polymarket action requires marketId, outcome, and amountUsd",
      422,
      "INVALID_POLYMARKET_REQUEST",
    );
  }
  return { marketId, outcome, amountUsd };
}

function buildDefaultIntegrations(): IntegrationPermissions[] {
  return [
    { integrationId: "polymarket", enabled: true, executionEnabled: false },
    { integrationId: "solana-wallet", enabled: true, executionEnabled: false },
    { integrationId: "evm-wallet", enabled: true, executionEnabled: false },
    { integrationId: "telegram", enabled: false, executionEnabled: false },
    { integrationId: "discord", enabled: false, executionEnabled: false },
  ];
}

function buildDefaultSettings(userId: string): TenantSettings {
  return {
    userId,
    persona: {
      personaName: "Milady Degen",
      stylePreset: "default",
      systemPromptOverride: null,
    },
    policies: {
      canUseChat: true,
      canUseTools: true,
      canManageIntegrations: true,
      canManagePermissions: true,
    },
    integrations: buildDefaultIntegrations(),
    polymarket: defaultPolymarketPermissions(),
    updatedAt: nowIso(),
  };
}

export class MultiUserService {
  private readonly usersById = new Map<string, User>();
  private readonly userIdByEmail = new Map<string, string>();
  private readonly sessionsById = new Map<string, AuthSession>();
  private readonly sessionIdByRefreshHash = new Map<string, string>();
  private readonly settingsByUserId = new Map<string, TenantSettings>();
  private readonly secretsByUserId = new Map<string, SecretRecord[]>();
  private readonly chatSessionsByUserId = new Map<string, ChatSession[]>();
  private readonly chatMessagesBySessionId = new Map<string, ChatMessage[]>();
  private readonly auditLogsByUserId = new Map<string, AuditLog[]>();
  private readonly jobsById = new Map<string, ExecutionJobRecord>();
  private readonly pendingConfirmationsByJobId = new Map<
    string,
    PendingConfirmation
  >();
  private readonly executionQueue = new InMemoryExecutionQueue<
    Record<string, unknown>
  >();
  private readonly limiter = createRateLimiter();
  private readonly jwtSecret: string;
  private readonly accessTtlSec: number;
  private readonly refreshTtlSec: number;
  private readonly confirmationTtlSec: number;
  private readonly quotaChatPerDay: number;
  private readonly quotaActionsPerDay: number;
  private readonly maxConfirmAttempts: number;
  private readonly quotaCounters = new Map<string, number>();
  private readonly walletBindingByUserId = new Map<
    string,
    WalletBindingRecord
  >();
  private readonly keyVersion: number;
  private readonly keyring: Map<number, Buffer>;
  private readonly encryptionKey: Buffer;
  private readonly persistenceMode: "file" | "sqlite";
  private readonly snapshotPath: string;
  private readonly sqlitePath: string;
  private sqliteDb: SqliteDbLike | null = null;
  private readonly blockSimulatedExecution: boolean;
  private readonly requireUserProviderSecret: boolean;
  private executionBackend: ExecutionBackend | null = null;

  constructor() {
    const providedSecret = process.env.MILAIDY_AUTH_JWT_SECRET?.trim() ?? "";
    if (providedSecret.length < 32) {
      throw new Error(
        "MILAIDY_AUTH_JWT_SECRET must be set and at least 32 characters for v2 auth",
      );
    }
    this.jwtSecret = providedSecret;
    this.accessTtlSec = Math.max(
      60,
      Number(process.env.MILAIDY_AUTH_ACCESS_TTL_SEC ?? "900"),
    );
    this.refreshTtlSec = Math.max(
      300,
      Number(process.env.MILAIDY_AUTH_REFRESH_TTL_SEC ?? "2592000"),
    );
    this.confirmationTtlSec = Math.max(
      30,
      Number(process.env.MILAIDY_ACTION_CONFIRM_TTL_SEC ?? "300"),
    );
    this.maxConfirmAttempts = Math.max(
      1,
      Number(process.env.MILAIDY_ACTION_CONFIRM_MAX_ATTEMPTS ?? "5"),
    );
    this.quotaChatPerDay = Math.max(
      100,
      Number(process.env.MILAIDY_QUOTA_CHAT_PER_DAY ?? "5000"),
    );
    this.quotaActionsPerDay = Math.max(
      10,
      Number(process.env.MILAIDY_QUOTA_ACTIONS_PER_DAY ?? "500"),
    );
    const isProductionRuntime =
      process.env.MILAIDY_ENV === "production" ||
      process.env.NODE_ENV === "production";
    const requestedStore = (process.env.MILAIDY_MULTIUSER_STORE ?? "")
      .trim()
      .toLowerCase();
    const defaultStore: "file" | "sqlite" = isProductionRuntime
      ? "sqlite"
      : "file";
    this.persistenceMode =
      requestedStore === "sqlite" || requestedStore === "file"
        ? requestedStore
        : defaultStore;
    if (
      isProductionRuntime &&
      this.persistenceMode === "file" &&
      process.env.MILAIDY_ALLOW_FILE_STORE_IN_PROD !== "1"
    ) {
      throw new Error(
        "File-based multi-user persistence is blocked in production. Set MILAIDY_MULTIUSER_STORE=sqlite.",
      );
    }
    this.snapshotPath = path.join(resolveStateDir(), "multiuser-store.v1.json");
    this.sqlitePath =
      process.env.MILAIDY_MULTIUSER_DB_PATH?.trim() ||
      path.join(resolveStateDir(), "multiuser-store.v1.sqlite");
    this.blockSimulatedExecution =
      process.env.MILAIDY_MULTIUSER_BLOCK_SIMULATED_EXECUTION === "1";
    this.requireUserProviderSecret =
      process.env.MILAIDY_REQUIRE_USER_PROVIDER_SECRET !== "0";

    try {
      const parsed = parseSecretKeyringFromEnv(process.env);
      this.keyVersion = parsed.activeVersion;
      this.keyring = parsed.keyring;
      const selected = parsed.keyring.get(parsed.activeVersion);
      if (!selected) throw new Error("Active key not found");
      this.encryptionKey = selected;
    } catch (err) {
      throw new Error(
        `Multi-user secrets are not configured: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.ensurePersistenceBackend();
    this.loadSnapshot();
    this.pruneExpiredSessions();
  }

  getPersistenceInfo(): {
    mode: "file" | "sqlite";
    path: string;
    productionSafe: boolean;
  } {
    const isProductionRuntime =
      process.env.MILAIDY_ENV === "production" ||
      process.env.NODE_ENV === "production";
    const activePath =
      this.persistenceMode === "sqlite" ? this.sqlitePath : this.snapshotPath;
    return {
      mode: this.persistenceMode,
      path: activePath,
      productionSafe: !isProductionRuntime || this.persistenceMode === "sqlite",
    };
  }

  setExecutionBackend(backend: ExecutionBackend | null): void {
    this.executionBackend = backend;
  }

  hasExecutionBackend(): boolean {
    return this.executionBackend != null;
  }

  getRuntimeEntitySettings(
    userId: string,
  ): Map<string, string | boolean | number | null> {
    const map = new Map<string, string | boolean | number | null>();
    const records = this.secretsByUserId.get(userId) ?? [];
    // Newest wins (upsertSecret overwrites, but keep stable behavior if older snapshots exist).
    const ordered = records
      .slice()
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
    for (const record of ordered) {
      const key = this.keyring.get(record.encrypted.keyVersion);
      if (!key) continue;
      try {
        const plaintext = decryptSecret(record.encrypted, key);
        map.set(record.secretKey, plaintext);
      } catch {
        // Ignore invalid secrets; do not log plaintext or errors (may contain key IDs).
      }
    }
    return map;
  }

  private snapshotFromState(): MultiUserSnapshotV1 {
    const users = Array.from(this.usersById.values());
    const sessions = Array.from(this.sessionsById.values());
    const settings = Array.from(this.settingsByUserId.values());
    const secrets = Array.from(this.secretsByUserId.values()).flatMap((v) => v);
    const chatSessions = Array.from(this.chatSessionsByUserId.values()).flatMap(
      (v) => v,
    );
    const chatMessages = Array.from(
      this.chatMessagesBySessionId.values(),
    ).flatMap((v) => v);
    const auditLogs = Array.from(this.auditLogsByUserId.values()).flatMap(
      (v) => v,
    );
    const jobs = Array.from(this.jobsById.values());
    const pendingConfirmations = Array.from(
      this.pendingConfirmationsByJobId.values(),
    );
    const quotaCounters = Array.from(this.quotaCounters.entries());
    const walletBindings = Array.from(this.walletBindingByUserId.values());
    return {
      version: 1,
      users,
      sessions,
      settings,
      secrets,
      chatSessions,
      chatMessages,
      auditLogs,
      jobs,
      pendingConfirmations,
      quotaCounters,
      walletBindings,
    };
  }

  private loadSnapshot(): void {
    try {
      const raw = this.readSnapshotRaw();
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<MultiUserSnapshotV1>;
      if (parsed.version !== 1) return;

      const users = Array.isArray(parsed.users) ? parsed.users : [];
      for (const user of users) {
        if (!user?.id || !user.email) continue;
        this.usersById.set(user.id, user);
        this.userIdByEmail.set(sanitizeEmail(user.email), user.id);
      }

      const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
      for (const session of sessions) {
        if (!session?.id || !session.userId || !session.refreshTokenHash)
          continue;
        this.sessionsById.set(session.id, session);
        if (!session.revokedAt) {
          this.sessionIdByRefreshHash.set(session.refreshTokenHash, session.id);
        }
      }

      const settings = Array.isArray(parsed.settings) ? parsed.settings : [];
      for (const item of settings) {
        if (!item?.userId) continue;
        this.settingsByUserId.set(item.userId, item);
      }

      const secrets = Array.isArray(parsed.secrets) ? parsed.secrets : [];
      for (const item of secrets) {
        if (!item?.ownerUserId) continue;
        const list = this.secretsByUserId.get(item.ownerUserId) ?? [];
        list.push(item);
        this.secretsByUserId.set(item.ownerUserId, list);
      }

      const chatSessions = Array.isArray(parsed.chatSessions)
        ? parsed.chatSessions
        : [];
      for (const item of chatSessions) {
        if (!item?.userId) continue;
        const list = this.chatSessionsByUserId.get(item.userId) ?? [];
        list.push(item);
        this.chatSessionsByUserId.set(item.userId, list);
      }

      const chatMessages = Array.isArray(parsed.chatMessages)
        ? parsed.chatMessages
        : [];
      for (const item of chatMessages) {
        if (!item?.sessionId) continue;
        const list = this.chatMessagesBySessionId.get(item.sessionId) ?? [];
        list.push(item);
        this.chatMessagesBySessionId.set(item.sessionId, list);
      }

      const auditLogs = Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [];
      for (const item of auditLogs) {
        if (!item?.actorUserId) continue;
        const list = this.auditLogsByUserId.get(item.actorUserId) ?? [];
        list.push(item);
        this.auditLogsByUserId.set(item.actorUserId, list);
      }

      const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
      for (const job of jobs) {
        if (!job?.id) continue;
        this.jobsById.set(job.id, job);
      }

      const pendingConfirmations = Array.isArray(parsed.pendingConfirmations)
        ? parsed.pendingConfirmations
        : [];
      for (const pc of pendingConfirmations) {
        if (!pc?.executionJobId || !pc?.userId) continue;
        if (pc.expiresAtMs <= Date.now()) continue;
        this.pendingConfirmationsByJobId.set(pc.executionJobId, pc);
      }

      const quota = Array.isArray(parsed.quotaCounters)
        ? parsed.quotaCounters
        : [];
      for (const entry of quota) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const [key, value] = entry;
        if (typeof key !== "string" || typeof value !== "number") continue;
        this.quotaCounters.set(key, value);
      }

      const walletBindings = Array.isArray(parsed.walletBindings)
        ? parsed.walletBindings
        : [];
      for (const item of walletBindings) {
        if (!item?.userId) continue;
        const evmAddress =
          typeof item.evmAddress === "string" &&
          /^0x[a-fA-F0-9]{40}$/.test(item.evmAddress.trim())
            ? item.evmAddress.trim()
            : null;
        const solanaAddress =
          typeof item.solanaAddress === "string" &&
          /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(item.solanaAddress.trim())
            ? item.solanaAddress.trim()
            : null;
        this.walletBindingByUserId.set(item.userId, {
          userId: item.userId,
          evmAddress,
          solanaAddress,
          updatedAt:
            typeof item.updatedAt === "string" && item.updatedAt
              ? item.updatedAt
              : nowIso(),
        });
      }
    } catch {
      // Ignore corrupted snapshots and continue with empty in-memory state.
    }
  }

  getWalletBinding(userId: string): {
    evmAddress: string | null;
    solanaAddress: string | null;
    updatedAt: string | null;
  } {
    const item = this.walletBindingByUserId.get(userId);
    return {
      evmAddress: item?.evmAddress ?? null,
      solanaAddress: item?.solanaAddress ?? null,
      updatedAt: item?.updatedAt ?? null,
    };
  }

  setWalletBinding(
    userId: string,
    input: { evmAddress?: string | null; solanaAddress?: string | null },
  ): {
    evmAddress: string | null;
    solanaAddress: string | null;
    updatedAt: string;
  } {
    const normalizeEvm = (value: string | null | undefined): string | null => {
      const trimmed = value?.trim() ?? "";
      if (!trimmed) return null;
      if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
        throw new MultiUserError(
          "Invalid EVM address format",
          422,
          "INVALID_WALLET_ADDRESS",
        );
      }
      return trimmed;
    };
    const normalizeSolana = (
      value: string | null | undefined,
    ): string | null => {
      const trimmed = value?.trim() ?? "";
      if (!trimmed) return null;
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
        throw new MultiUserError(
          "Invalid Solana address format",
          422,
          "INVALID_WALLET_ADDRESS",
        );
      }
      return trimmed;
    };

    const next: WalletBindingRecord = {
      userId,
      evmAddress: normalizeEvm(input.evmAddress),
      solanaAddress: normalizeSolana(input.solanaAddress),
      updatedAt: nowIso(),
    };
    this.walletBindingByUserId.set(userId, next);
    this.createAudit(
      userId,
      "permission_change",
      "executed",
      "wallet_binding_updated",
      {
        evmAddress: next.evmAddress
          ? `${next.evmAddress.slice(0, 6)}...${next.evmAddress.slice(-4)}`
          : null,
        solanaAddress: next.solanaAddress
          ? `${next.solanaAddress.slice(0, 4)}...${next.solanaAddress.slice(-4)}`
          : null,
      },
    );
    this.persistSnapshot();
    return {
      evmAddress: next.evmAddress,
      solanaAddress: next.solanaAddress,
      updatedAt: next.updatedAt,
    };
  }

  clearWalletBinding(userId: string): { ok: true } {
    this.walletBindingByUserId.delete(userId);
    this.createAudit(
      userId,
      "permission_change",
      "executed",
      "wallet_binding_cleared",
      {},
    );
    this.persistSnapshot();
    return { ok: true };
  }

  private persistSnapshot(): void {
    try {
      const snapshot = this.snapshotFromState();
      const payload = JSON.stringify(snapshot);
      if (this.persistenceMode === "sqlite") {
        const db = this.sqliteDb;
        if (!db) return;
        const stmt = db.prepare(
          "INSERT INTO multiuser_snapshot (id, payload, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at",
        );
        stmt.run(payload, nowIso());
      } else {
        const dir = path.dirname(this.snapshotPath);
        fs.mkdirSync(dir, { recursive: true });
        const temp = `${this.snapshotPath}.tmp`;
        fs.writeFileSync(temp, payload, {
          encoding: "utf8",
          mode: 0o600,
        });
        fs.renameSync(temp, this.snapshotPath);
      }
    } catch {
      // Persistence failures should not crash the API path.
    }
  }

  private ensurePersistenceBackend(): void {
    if (this.persistenceMode !== "sqlite") return;
    const dir = path.dirname(this.sqlitePath);
    fs.mkdirSync(dir, { recursive: true });
    const req = createRequire(import.meta.url);
    let DatabaseSyncCtor: new (dbPath: string) => SqliteDbLike;
    try {
      const mod = req("node:sqlite") as {
        DatabaseSync?: new (dbPath: string) => SqliteDbLike;
      };
      if (!mod.DatabaseSync) {
        throw new Error("DatabaseSync export is unavailable");
      }
      DatabaseSyncCtor = mod.DatabaseSync;
    } catch (err) {
      throw new Error(
        `SQLite persistence requested, but node:sqlite is unavailable in this runtime (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
    const db = new DatabaseSyncCtor(this.sqlitePath);
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA synchronous=NORMAL");
    db.exec(
      "CREATE TABLE IF NOT EXISTS multiuser_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at TEXT NOT NULL)",
    );
    this.sqliteDb = db;
  }

  private readSnapshotRaw(): string | null {
    if (this.persistenceMode === "sqlite") {
      const db = this.sqliteDb;
      if (!db) return null;
      const row = db
        .prepare("SELECT payload FROM multiuser_snapshot WHERE id = 1 LIMIT 1")
        .get() as { payload?: unknown } | undefined;
      if (!row || typeof row.payload !== "string") return null;
      return row.payload;
    }
    if (!fs.existsSync(this.snapshotPath)) return null;
    return fs.readFileSync(this.snapshotPath, "utf8");
  }

  private pruneExpiredSessions(): void {
    const nowMs = Date.now();
    let changed = false;
    for (const [id, session] of this.sessionsById.entries()) {
      if (session.revokedAt) continue;
      if (Date.parse(session.expiresAt) > nowMs) continue;
      session.revokedAt = nowIso();
      this.sessionIdByRefreshHash.delete(session.refreshTokenHash);
      this.sessionsById.set(id, session);
      changed = true;
    }
    for (const [jobId, pending] of this.pendingConfirmationsByJobId.entries()) {
      if (pending.expiresAtMs <= nowMs) {
        this.pendingConfirmationsByJobId.delete(jobId);
        changed = true;
      }
    }
    if (changed) this.persistSnapshot();
  }

  parseSignup(input: Record<string, unknown>): SignupRequest {
    const parsed = SignupRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new MultiUserError("Invalid signup payload", 422, "INVALID_SIGNUP");
    return parsed.data;
  }

  parseLogin(input: Record<string, unknown>): LoginRequest {
    const parsed = LoginRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new MultiUserError("Invalid login payload", 422, "INVALID_LOGIN");
    return parsed.data;
  }

  parseTenantPatch(input: Record<string, unknown>): TenantSettingsUpdate {
    const parsed = TenantSettingsUpdateSchema.safeParse(input);
    if (!parsed.success)
      throw new MultiUserError(
        "Invalid settings payload",
        422,
        "INVALID_SETTINGS",
      );
    return parsed.data;
  }

  parsePermissionPatch(input: Record<string, unknown>): PermissionPatchRequest {
    const parsed = PermissionPatchSchema.safeParse(input);
    if (!parsed.success)
      throw new MultiUserError(
        "Invalid permissions payload",
        422,
        "INVALID_PERMISSIONS",
      );
    return parsed.data;
  }

  parseSecretUpsert(input: Record<string, unknown>): SecretUpsertRequest {
    const parsed = SecretUpsertRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new MultiUserError("Invalid secret payload", 422, "INVALID_SECRET");
    return parsed.data;
  }

  parseChatSessionCreate(
    input: Record<string, unknown>,
  ): ChatCreateSessionRequest {
    const parsed = ChatCreateSessionRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new MultiUserError(
        "Invalid session payload",
        422,
        "INVALID_CHAT_SESSION",
      );
    return parsed.data;
  }

  parseChatSend(input: Record<string, unknown>): ChatSendMessageRequest {
    const parsed = ChatSendMessageRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new MultiUserError(
        "Invalid chat message payload",
        422,
        "INVALID_CHAT_MESSAGE",
      );
    return parsed.data;
  }

  parseConfirm(input: Record<string, unknown>): ConfirmActionRequest {
    const parsed = ConfirmActionRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new MultiUserError(
        "Invalid confirmation payload",
        422,
        "INVALID_CONFIRMATION",
      );
    return parsed.data;
  }

  parseActionExecute(input: Record<string, unknown>): ActionExecuteRequest {
    return parseActionExecuteRequest(input);
  }

  private signAccessToken(payload: AccessTokenPayload): string {
    const header = { alg: "HS256", typ: "JWT" };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const sig = crypto
      .createHmac("sha256", this.jwtSecret)
      .update(signingInput, "utf8")
      .digest();
    return `${signingInput}.${base64UrlEncode(sig)}`;
  }

  private verifyAccessToken(token: string): AccessTokenPayload | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSig] = parts;
    if (!encodedHeader || !encodedPayload || !encodedSig) return null;
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expected = crypto
      .createHmac("sha256", this.jwtSecret)
      .update(signingInput, "utf8")
      .digest();
    const provided = base64UrlDecode(encodedSig);
    if (expected.length !== provided.length) return null;
    if (!crypto.timingSafeEqual(expected, provided)) return null;
    const payloadRaw = base64UrlDecode(encodedPayload).toString("utf8");
    let payload: unknown;
    try {
      payload = JSON.parse(payloadRaw);
    } catch {
      return null;
    }
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Partial<AccessTokenPayload>;
    if (!p.sub || !p.sid || !p.role || !p.exp || !p.iat) return null;
    if (Date.now() / 1000 > p.exp) return null;
    return p as AccessTokenPayload;
  }

  private issueTokens(
    user: User,
    sessionId: string,
  ): { accessToken: string; refreshToken: string; expiresInSeconds: number } {
    const now = Math.floor(Date.now() / 1000);
    const payload: AccessTokenPayload = {
      sub: user.id,
      sid: sessionId,
      role: user.role,
      iat: now,
      exp: now + this.accessTtlSec,
    };
    const accessToken = this.signAccessToken(payload);
    const refreshToken = base64UrlEncode(crypto.randomBytes(32));
    return { accessToken, refreshToken, expiresInSeconds: this.accessTtlSec };
  }

  private createAudit(
    actorUserId: string,
    actionKind: AuditLog["actionKind"],
    outcome: ActionOutcome,
    reason: string | null,
    metadata: Record<string, unknown>,
    targetUserId: string | null = null,
    sessionId: string | null = null,
  ): void {
    const entry: AuditLog = {
      id: crypto.randomUUID(),
      actorUserId,
      targetUserId,
      sessionId,
      actionKind,
      outcome,
      reason,
      metadataJson: JSON.stringify(metadata),
      createdAt: nowIso(),
    };
    const list = this.auditLogsByUserId.get(actorUserId) ?? [];
    list.unshift(entry);
    this.auditLogsByUserId.set(actorUserId, list.slice(0, 200));
    this.persistSnapshot();
  }

  private async enforceRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<void> {
    const decision = await this.limiter.check(key, maxRequests, windowMs);
    if (!decision.allowed) {
      throw new MultiUserError(
        "Too many requests",
        429,
        "RATE_LIMITED",
        decision.retryAfterSec,
      );
    }
  }

  private getQuotaKey(userId: string, key: string): string {
    const day = new Date().toISOString().slice(0, 10);
    return `${userId}:${day}:${key}`;
  }

  private checkAndConsumeQuota(
    userId: string,
    key: "chat_messages" | "actions",
    units = 1,
  ): { used: number; max: number } {
    const quotaMax =
      key === "chat_messages" ? this.quotaChatPerDay : this.quotaActionsPerDay;
    const quotaKey = this.getQuotaKey(userId, key);
    const used = this.quotaCounters.get(quotaKey) ?? 0;
    if (used + units > quotaMax) {
      throw new MultiUserError(
        `Quota exceeded for ${key}`,
        429,
        "QUOTA_EXCEEDED",
      );
    }
    const next = used + units;
    this.quotaCounters.set(quotaKey, next);
    this.persistSnapshot();
    return { used: next, max: quotaMax };
  }

  async signup(
    input: SignupRequest,
    context: { userAgent: string | null; ipAddress: string | null },
  ): Promise<{
    user: Omit<User, "passwordHash">;
    accessToken: string;
    refreshToken: string;
    expiresInSeconds: number;
  }> {
    await this.enforceRateLimit(
      `signup:${context.ipAddress ?? "unknown"}`,
      10,
      60_000,
    );
    const email = sanitizeEmail(input.email);
    if (this.userIdByEmail.has(email)) {
      throw new MultiUserError("Email already exists", 409, "EMAIL_EXISTS");
    }
    const now = nowIso();
    const user: User = {
      id: crypto.randomUUID(),
      email,
      passwordHash: createPasswordHash(input.password),
      displayName: input.displayName.trim(),
      role: "member",
      createdAt: now,
      updatedAt: now,
      disabledAt: null,
    };
    this.usersById.set(user.id, user);
    this.userIdByEmail.set(email, user.id);
    this.settingsByUserId.set(user.id, buildDefaultSettings(user.id));

    const sessionId = crypto.randomUUID();
    const tokens = this.issueTokens(user, sessionId);
    const refreshHash = hashRefreshToken(tokens.refreshToken);
    const expiresAt = new Date(
      Date.now() + this.refreshTtlSec * 1000,
    ).toISOString();
    const authSession: AuthSession = {
      id: sessionId,
      userId: user.id,
      refreshTokenHash: refreshHash,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      revokedAt: null,
    };
    this.sessionsById.set(sessionId, authSession);
    this.sessionIdByRefreshHash.set(refreshHash, sessionId);
    this.persistSnapshot();

    return {
      user: this.publicUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSeconds: tokens.expiresInSeconds,
    };
  }

  async login(
    input: LoginRequest,
    context: { userAgent: string | null; ipAddress: string | null },
  ): Promise<{
    user: Omit<User, "passwordHash">;
    accessToken: string;
    refreshToken: string;
    expiresInSeconds: number;
  }> {
    await this.enforceRateLimit(
      `login:${context.ipAddress ?? "unknown"}`,
      20,
      60_000,
    );
    const email = sanitizeEmail(input.email);
    const userId = this.userIdByEmail.get(email);
    if (!userId)
      throw new MultiUserError(
        "Invalid credentials",
        401,
        "INVALID_CREDENTIALS",
      );
    const user = this.usersById.get(userId);
    if (!user || user.disabledAt)
      throw new MultiUserError(
        "Invalid credentials",
        401,
        "INVALID_CREDENTIALS",
      );
    if (!verifyPassword(input.password, user.passwordHash)) {
      throw new MultiUserError(
        "Invalid credentials",
        401,
        "INVALID_CREDENTIALS",
      );
    }

    const sessionId = crypto.randomUUID();
    const tokens = this.issueTokens(user, sessionId);
    const refreshHash = hashRefreshToken(tokens.refreshToken);
    const now = nowIso();
    const expiresAt = new Date(
      Date.now() + this.refreshTtlSec * 1000,
    ).toISOString();
    const authSession: AuthSession = {
      id: sessionId,
      userId: user.id,
      refreshTokenHash: refreshHash,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      revokedAt: null,
    };
    this.sessionsById.set(sessionId, authSession);
    this.sessionIdByRefreshHash.set(refreshHash, sessionId);
    this.persistSnapshot();
    return {
      user: this.publicUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSeconds: tokens.expiresInSeconds,
    };
  }

  refresh(refreshToken: string): {
    accessToken: string;
    refreshToken: string;
    expiresInSeconds: number;
  } {
    this.pruneExpiredSessions();
    const token = refreshToken.trim();
    if (!token)
      throw new MultiUserError(
        "refreshToken is required",
        422,
        "INVALID_REFRESH",
      );
    const hash = hashRefreshToken(token);
    const sessionId = this.sessionIdByRefreshHash.get(hash);
    if (!sessionId)
      throw new MultiUserError("Invalid refresh token", 401, "INVALID_REFRESH");
    const session = this.sessionsById.get(sessionId);
    if (!session || session.revokedAt)
      throw new MultiUserError("Invalid refresh token", 401, "INVALID_REFRESH");
    if (Date.parse(session.expiresAt) <= Date.now()) {
      throw new MultiUserError("Refresh token expired", 401, "REFRESH_EXPIRED");
    }
    const user = this.usersById.get(session.userId);
    if (!user)
      throw new MultiUserError("Invalid refresh token", 401, "INVALID_REFRESH");

    // rotate
    this.sessionIdByRefreshHash.delete(hash);
    const nextTokens = this.issueTokens(user, session.id);
    const nextHash = hashRefreshToken(nextTokens.refreshToken);
    session.refreshTokenHash = nextHash;
    session.lastSeenAt = nowIso();
    this.sessionIdByRefreshHash.set(nextHash, session.id);
    this.persistSnapshot();
    return nextTokens;
  }

  revokeSession(sessionId: string): void {
    const session = this.sessionsById.get(sessionId);
    if (!session || session.revokedAt) return;
    session.revokedAt = nowIso();
    this.sessionIdByRefreshHash.delete(session.refreshTokenHash);
    this.persistSnapshot();
  }

  getSessionFromAccessToken(accessToken: string): SessionContext {
    this.pruneExpiredSessions();
    const payload = this.verifyAccessToken(accessToken);
    if (!payload) throw new MultiUserError("Unauthorized", 401, "UNAUTHORIZED");
    const session = this.sessionsById.get(payload.sid);
    if (!session || session.revokedAt || session.userId !== payload.sub) {
      throw new MultiUserError("Unauthorized", 401, "UNAUTHORIZED");
    }
    if (Date.parse(session.expiresAt) <= Date.now()) {
      throw new MultiUserError("Unauthorized", 401, "UNAUTHORIZED");
    }
    const user = this.usersById.get(payload.sub);
    if (!user || user.disabledAt)
      throw new MultiUserError("Unauthorized", 401, "UNAUTHORIZED");
    return { user, session };
  }

  getMe(ctx: SessionContext): Omit<User, "passwordHash"> {
    return this.publicUser(ctx.user);
  }

  getSettings(userId: string): TenantSettings {
    const settings =
      this.settingsByUserId.get(userId) ?? buildDefaultSettings(userId);
    if (!this.settingsByUserId.has(userId)) {
      this.settingsByUserId.set(userId, settings);
      this.persistSnapshot();
    }
    return settings;
  }

  patchSettings(userId: string, patch: TenantSettingsUpdate): TenantSettings {
    const settings = this.getSettings(userId);
    if (patch.persona) {
      settings.persona = {
        personaName: patch.persona.personaName,
        stylePreset: patch.persona.stylePreset,
        systemPromptOverride: patch.persona.systemPromptOverride,
      };
    }
    if (patch.policies) {
      settings.policies = { ...settings.policies, ...patch.policies };
    }
    settings.updatedAt = nowIso();
    this.settingsByUserId.set(userId, settings);
    this.createAudit(
      userId,
      "permission_change",
      "executed",
      "settings_updated",
      {
        personaChanged: Boolean(patch.persona),
        policiesChanged: Boolean(patch.policies),
      },
    );
    this.persistSnapshot();
    return settings;
  }

  listIntegrations(userId: string): Array<{
    integrationId: string;
    enabled: boolean;
    executionEnabled: boolean;
    hasSecrets: boolean;
  }> {
    const settings = this.getSettings(userId);
    const secrets = this.secretsByUserId.get(userId) ?? [];
    return settings.integrations.map((i) => ({
      integrationId: i.integrationId,
      enabled: i.enabled,
      executionEnabled: i.executionEnabled,
      hasSecrets: secrets.some((s) => s.integrationId === i.integrationId),
    }));
  }

  upsertSecret(
    userId: string,
    req: SecretUpsertRequest,
  ): { ok: true; redacted: string } {
    const settings = this.getSettings(userId);
    if (!settings.policies.canManageIntegrations) {
      throw new MultiUserError("Permission denied", 403, "FORBIDDEN");
    }
    const encrypted = encryptSecret(
      req.secretValue,
      this.keyVersion,
      this.encryptionKey,
    );
    const now = nowIso();
    const existing = this.secretsByUserId.get(userId) ?? [];
    const idx = existing.findIndex(
      (x) =>
        x.integrationId === req.integrationId && x.secretKey === req.secretKey,
    );
    const record: SecretRecord = {
      id: idx >= 0 ? existing[idx]!.id : crypto.randomUUID(),
      ownerUserId: userId,
      scope: req.scope,
      integrationId: req.integrationId,
      secretKey: req.secretKey,
      encrypted,
      createdAt: idx >= 0 ? existing[idx]!.createdAt : now,
      updatedAt: now,
    };
    if (idx >= 0) existing[idx] = record;
    else existing.push(record);
    this.secretsByUserId.set(userId, existing);
    this.createAudit(
      userId,
      "integration_secret_update",
      "executed",
      "secret_upserted",
      {
        integrationId: req.integrationId,
        secretKey: req.secretKey,
        redacted: redactSecret(req.secretValue),
      },
    );
    this.persistSnapshot();
    return { ok: true, redacted: redactSecret(req.secretValue) };
  }

  deleteSecret(
    userId: string,
    integrationId: string,
    secretKey: string,
  ): { ok: true } {
    const list = this.secretsByUserId.get(userId) ?? [];
    const next = list.filter(
      (x) => !(x.integrationId === integrationId && x.secretKey === secretKey),
    );
    this.secretsByUserId.set(userId, next);
    this.createAudit(
      userId,
      "integration_secret_update",
      "executed",
      "secret_deleted",
      {
        integrationId,
        secretKey,
      },
    );
    this.persistSnapshot();
    return { ok: true };
  }

  getPermissions(userId: string): {
    integrations: IntegrationPermissions[];
    polymarket: PolymarketPermissions;
  } {
    const settings = this.getSettings(userId);
    return {
      integrations: settings.integrations,
      polymarket: settings.polymarket,
    };
  }

  patchPermissions(
    userId: string,
    patch: PermissionPatchRequest,
  ): {
    integrations: IntegrationPermissions[];
    polymarket: PolymarketPermissions;
  } {
    const settings = this.getSettings(userId);
    if (!settings.policies.canManagePermissions) {
      throw new MultiUserError("Permission denied", 403, "FORBIDDEN");
    }
    const existing = settings.integrations.find(
      (i) => i.integrationId === patch.integrationId,
    );
    if (!existing) {
      settings.integrations.push({
        integrationId:
          patch.integrationId as IntegrationPermissions["integrationId"],
        enabled: patch.enabled ?? false,
        executionEnabled: patch.executionEnabled ?? false,
      });
    } else {
      if (typeof patch.enabled === "boolean") existing.enabled = patch.enabled;
      if (typeof patch.executionEnabled === "boolean")
        existing.executionEnabled = patch.executionEnabled;
    }
    if (patch.polymarket) {
      settings.polymarket = {
        level: patch.polymarket.level ?? settings.polymarket.level,
        dailySpendLimitUsd:
          patch.polymarket.dailySpendLimitUsd ??
          settings.polymarket.dailySpendLimitUsd,
        perTradeLimitUsd:
          patch.polymarket.perTradeLimitUsd ??
          settings.polymarket.perTradeLimitUsd,
        confirmationMode:
          patch.polymarket.confirmationMode ??
          settings.polymarket.confirmationMode,
        cooldownSeconds:
          patch.polymarket.cooldownSeconds ??
          settings.polymarket.cooldownSeconds,
      };
    }
    settings.updatedAt = nowIso();
    this.settingsByUserId.set(userId, settings);
    this.createAudit(
      userId,
      "permission_change",
      "executed",
      "permissions_updated",
      {
        integrationId: patch.integrationId,
        enabled: patch.enabled,
        executionEnabled: patch.executionEnabled,
        polymarket: patch.polymarket ?? null,
      },
    );
    this.persistSnapshot();
    return this.getPermissions(userId);
  }

  listChatSessions(userId: string): ChatSession[] {
    return this.chatSessionsByUserId.get(userId) ?? [];
  }

  createChatSession(
    userId: string,
    req: ChatCreateSessionRequest,
  ): ChatSession {
    const now = nowIso();
    const session: ChatSession = {
      id: crypto.randomUUID(),
      userId,
      title: req.title?.trim() || "New Chat",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    const list = this.chatSessionsByUserId.get(userId) ?? [];
    list.unshift(session);
    this.chatSessionsByUserId.set(userId, list.slice(0, 200));
    this.persistSnapshot();
    return session;
  }

  listMessages(userId: string, sessionId: string): ChatMessage[] {
    const session = (this.chatSessionsByUserId.get(userId) ?? []).find(
      (s) => s.id === sessionId,
    );
    if (!session)
      throw new MultiUserError("Session not found", 404, "SESSION_NOT_FOUND");
    return this.chatMessagesBySessionId.get(sessionId) ?? [];
  }

  private hasUserAiProviderSecret(userId: string): boolean {
    const knownProviderKeys = new Set([
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "OPENROUTER_API_KEY",
      "GROQ_API_KEY",
      "XAI_API_KEY",
      "GOOGLE_API_KEY",
      "GEMINI_API_KEY",
      "DEEPSEEK_API_KEY",
      "MISTRAL_API_KEY",
      "TOGETHER_API_KEY",
      "Z_AI_API_KEY",
      "ZAI_API_KEY",
    ]);
    const records = this.secretsByUserId.get(userId) ?? [];
    return records.some((record) =>
      knownProviderKeys.has(record.secretKey.toUpperCase()),
    );
  }

  async sendMessage(
    userId: string,
    req: ChatSendMessageRequest,
  ): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> {
    const settings = this.getSettings(userId);
    if (!settings.policies.canUseChat) {
      throw new MultiUserError(
        "Chat is disabled for this account",
        403,
        "CHAT_DISABLED",
      );
    }
    if (
      this.requireUserProviderSecret &&
      !this.hasUserAiProviderSecret(userId)
    ) {
      throw new MultiUserError(
        "AI provider not connected for this account. Add your provider key in AI Settings.",
        412,
        "AI_PROVIDER_REQUIRED",
      );
    }
    await this.enforceRateLimit(`chat:${userId}`, 120, 60_000);
    this.checkAndConsumeQuota(userId, "chat_messages", 1);
    const sessions = this.chatSessionsByUserId.get(userId) ?? [];
    let session = sessions.find((s) => s.id === req.sessionId);
    if (!session) {
      session = this.createChatSession(userId, { title: "New Chat" });
    }
    session.updatedAt = nowIso();
    const now = nowIso();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      userId,
      role: "user",
      content: req.content,
      toolName: null,
      createdAt: now,
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      userId,
      role: "assistant",
      content:
        "Message received. Multi-user orchestration scaffold is active for this session.",
      toolName: null,
      createdAt: nowIso(),
    };
    const existing = this.chatMessagesBySessionId.get(session.id) ?? [];
    existing.push(userMessage, assistantMessage);
    this.chatMessagesBySessionId.set(session.id, existing.slice(-5000));
    this.persistSnapshot();
    return { userMessage, assistantMessage };
  }

  previewAction(
    userId: string,
    input: ActionExecuteRequest,
  ): Record<string, unknown> {
    const settings = this.getSettings(userId);
    const integration = settings.integrations.find(
      (x) => x.integrationId === input.integrationId,
    );
    if (!integration?.enabled) {
      return {
        allowed: false,
        reason: "Integration disabled",
        requiresConfirmation: false,
        riskLevel: "can_execute",
      };
    }

    if (
      input.integrationId === "polymarket" ||
      input.action.includes("polymarket")
    ) {
      const bet = parsePolymarketBet(input);
      const stats = this.collectPolymarketStats(userId);
      const decision = evaluateBetPolicy(settings, bet, stats, Date.now());
      return {
        allowed: decision.allowed,
        reason: decision.reason,
        requiresConfirmation: decision.requiresConfirmation,
        riskLevel: "can_spend",
      };
    }

    return {
      allowed: true,
      reason: "Allowed",
      requiresConfirmation: false,
      riskLevel: "can_execute",
    };
  }

  async executeAction(
    userId: string,
    input: ActionExecuteRequest,
  ): Promise<Record<string, unknown>> {
    await this.enforceRateLimit(`actions:${userId}`, 90, 60_000);
    this.checkAndConsumeQuota(userId, "actions", 1);
    const settings = this.getSettings(userId);
    const integration = settings.integrations.find(
      (x) => x.integrationId === input.integrationId,
    );
    if (!integration?.enabled) {
      throw new MultiUserError(
        "Integration disabled",
        403,
        "INTEGRATION_DISABLED",
      );
    }
    if (!integration.executionEnabled) {
      throw new MultiUserError(
        "Execution is disabled for this integration",
        403,
        "EXECUTION_DISABLED",
      );
    }

    const createdAt = nowIso();
    const job: ExecutionJobRecord = {
      id: crypto.randomUUID(),
      userId,
      sessionId: input.sessionId ?? null,
      status: "queued",
      toolName: input.action,
      riskLevel: "can_execute",
      inputJson: JSON.stringify(input),
      outputJson: null,
      errorMessage: null,
      createdAt,
      startedAt: null,
      completedAt: null,
    };

    if (
      input.integrationId === "polymarket" ||
      input.action.includes("polymarket")
    ) {
      const bet = parsePolymarketBet(input);
      const stats = this.collectPolymarketStats(userId);
      const policy = evaluateBetPolicy(settings, bet, stats, Date.now());
      if (!policy.allowed) {
        this.createAudit(
          userId,
          "polymarket_bet_blocked",
          "blocked",
          policy.reason,
          { bet },
        );
        throw new MultiUserError(policy.reason, 403, "POLYMARKET_BLOCKED");
      }
      job.riskLevel = "can_spend";
      if (policy.requiresConfirmation) {
        const code = `${crypto.randomInt(100000, 1000000)}`;
        const codeHash = sha256Hex(code);
        this.pendingConfirmationsByJobId.set(job.id, {
          executionJobId: job.id,
          userId,
          codeHash,
          expiresAtMs: Date.now() + this.confirmationTtlSec * 1000,
          failedAttempts: 0,
          payload: input,
        });
        job.status = "waiting_confirmation";
        this.jobsById.set(job.id, job);
        this.persistSnapshot();
        this.createAudit(
          userId,
          "polymarket_bet_attempt",
          "allowed",
          "awaiting_confirmation",
          {
            executionJobId: job.id,
            bet,
          },
        );
        const resp: Record<string, unknown> = {
          executionJobId: job.id,
          status: job.status,
          requiresConfirmation: true,
          expiresInSeconds: this.confirmationTtlSec,
        };
        if (process.env.MILAIDY_EXPOSE_CONFIRM_CODE === "1") {
          resp.confirmationCode = code;
        }
        return resp;
      }
    }

    return await this.finalizeExecution(job, input);
  }

  async confirmAction(
    userId: string,
    req: ConfirmActionRequest,
  ): Promise<Record<string, unknown>> {
    await this.enforceRateLimit(`confirm:${userId}`, 30, 60_000);
    const pending = this.pendingConfirmationsByJobId.get(req.executionJobId);
    if (!pending || pending.userId !== userId) {
      throw new MultiUserError(
        "Confirmation not found",
        404,
        "CONFIRMATION_NOT_FOUND",
      );
    }
    if (pending.expiresAtMs <= Date.now()) {
      this.pendingConfirmationsByJobId.delete(req.executionJobId);
      this.persistSnapshot();
      throw new MultiUserError(
        "Confirmation expired",
        410,
        "CONFIRMATION_EXPIRED",
      );
    }
    const provided = sha256Hex(req.confirmationCode.trim());
    if (provided !== pending.codeHash) {
      pending.failedAttempts += 1;
      if (pending.failedAttempts >= this.maxConfirmAttempts) {
        this.pendingConfirmationsByJobId.delete(req.executionJobId);
        this.persistSnapshot();
        throw new MultiUserError(
          "Confirmation locked after too many failed attempts",
          429,
          "CONFIRMATION_LOCKED",
        );
      }
      this.persistSnapshot();
      throw new MultiUserError(
        "Invalid confirmation code",
        403,
        "INVALID_CONFIRMATION_CODE",
      );
    }
    this.pendingConfirmationsByJobId.delete(req.executionJobId);
    this.persistSnapshot();
    const job = this.jobsById.get(req.executionJobId);
    if (!job)
      throw new MultiUserError("Execution job not found", 404, "JOB_NOT_FOUND");
    return await this.finalizeExecution(job, pending.payload);
  }

  getActionStatus(userId: string, executionJobId: string): ExecutionJobRecord {
    const job = this.jobsById.get(executionJobId);
    if (!job || job.userId !== userId)
      throw new MultiUserError("Execution job not found", 404, "JOB_NOT_FOUND");
    return job;
  }

  listAudit(userId: string): AuditLog[] {
    return this.auditLogsByUserId.get(userId) ?? [];
  }

  getLimitsStatus(userId: string): Record<string, unknown> {
    const now = new Date();
    const resetAt = new Date(now);
    resetAt.setUTCSeconds(0, 0);
    resetAt.setUTCMinutes(now.getUTCMinutes() + 1);
    return {
      items: [
        {
          key: `chat:${userId}`,
          remaining: "dynamic",
          resetAt: resetAt.toISOString(),
        },
        {
          key: `actions:${userId}`,
          remaining: "dynamic",
          resetAt: resetAt.toISOString(),
        },
      ],
    };
  }

  getQuotaStatus(userId: string): Record<string, unknown> {
    const chatKey = this.getQuotaKey(userId, "chat_messages");
    const actionKey = this.getQuotaKey(userId, "actions");
    const chatUsed = this.quotaCounters.get(chatKey) ?? 0;
    const actionUsed = this.quotaCounters.get(actionKey) ?? 0;
    return {
      day: new Date().toISOString().slice(0, 10),
      chat: {
        used: chatUsed,
        max: this.quotaChatPerDay,
        remaining: Math.max(0, this.quotaChatPerDay - chatUsed),
      },
      actions: {
        used: actionUsed,
        max: this.quotaActionsPerDay,
        remaining: Math.max(0, this.quotaActionsPerDay - actionUsed),
      },
    };
  }

  private publicUser(user: User): Omit<User, "passwordHash"> {
    const { passwordHash: _omit, ...rest } = user;
    return rest;
  }

  private collectPolymarketStats(userId: string): {
    spentUsdToday: number;
    lastSpendAtMs: number | null;
  } {
    const logs = this.auditLogsByUserId.get(userId) ?? [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    let spent = 0;
    let lastSpendAtMs: number | null = null;
    for (const log of logs) {
      if (
        log.actionKind !== "polymarket_bet_execute" ||
        log.outcome !== "executed"
      )
        continue;
      const atMs = Date.parse(log.createdAt);
      const metadata = parseJsonObject(log.metadataJson);
      const amount = Number.parseFloat(String(metadata.amountUsd ?? "0"));
      if (atMs >= startMs && Number.isFinite(amount)) spent += amount;
      if (lastSpendAtMs == null || atMs > lastSpendAtMs) lastSpendAtMs = atMs;
    }
    return { spentUsdToday: spent, lastSpendAtMs };
  }

  private async finalizeExecution(
    job: ExecutionJobRecord,
    input: ActionExecuteRequest,
  ): Promise<Record<string, unknown>> {
    job.status = "running";
    job.startedAt = nowIso();
    this.jobsById.set(job.id, job);
    this.persistSnapshot();

    try {
      if (!this.executionBackend && this.blockSimulatedExecution) {
        job.status = "failed";
        job.errorMessage =
          "Execution backend is not configured. Set up real worker execution before enabling strict mode.";
        job.completedAt = nowIso();
        this.jobsById.set(job.id, job);
        this.createAudit(
          job.userId,
          "wallet_sign_attempt",
          "failed",
          "execution_backend_missing",
          {
            executionJobId: job.id,
            integrationId: input.integrationId,
            action: input.action,
          },
        );
        this.persistSnapshot();
        throw new MultiUserError(
          "Execution backend is not configured",
          503,
          "EXECUTION_BACKEND_MISSING",
        );
      }

      let output: Record<string, unknown>;
      if (this.executionBackend) {
        output = await this.executionBackend({
          userId: job.userId,
          executionJobId: job.id,
          integrationId: input.integrationId,
          action: input.action,
          params: input.params ?? {},
          sessionId: input.sessionId ?? null,
        });
      } else {
        output = {
          simulated: true,
          integrationId: input.integrationId,
          action: input.action,
          message:
            "Execution scaffold completed. Replace with real worker-backed execution.",
        };
      }

      job.status = "completed";
      job.outputJson = JSON.stringify(output);
      job.completedAt = nowIso();
      this.jobsById.set(job.id, job);
      this.persistSnapshot();

      if (
        input.integrationId === "polymarket" ||
        input.action.includes("polymarket")
      ) {
        const bet = parsePolymarketBet(input);
        this.createAudit(
          job.userId,
          "polymarket_bet_execute",
          "executed",
          "executed",
          {
            executionJobId: job.id,
            amountUsd: bet.amountUsd,
            marketId: bet.marketId,
            outcome: bet.outcome,
          },
        );
      } else {
        this.createAudit(
          job.userId,
          "wallet_sign_execute",
          "executed",
          "executed",
          {
            executionJobId: job.id,
            integrationId: input.integrationId,
            action: input.action,
          },
        );
      }

      return {
        executionJobId: job.id,
        status: job.status,
        output: parseJsonObject(job.outputJson ?? "{}"),
      };
    } catch (err) {
      job.status = "failed";
      job.errorMessage = err instanceof Error ? err.message : String(err);
      job.completedAt = nowIso();
      this.jobsById.set(job.id, job);
      this.persistSnapshot();
      this.createAudit(
        job.userId,
        "wallet_sign_attempt",
        "failed",
        "execution_failed",
        {
          executionJobId: job.id,
          integrationId: input.integrationId,
          action: input.action,
        },
      );
      if (err instanceof MultiUserError) throw err;
      throw new MultiUserError("Execution failed", 502, "EXECUTION_FAILED");
    } finally {
      this.persistSnapshot();
    }
  }
}
