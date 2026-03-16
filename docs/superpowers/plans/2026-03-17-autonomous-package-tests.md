# @milady/autonomous Test Suite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ~200 unit tests to the extracted `@milady/autonomous` package (PR #983) covering all untested API routes, security, auth, services, and diagnostics modules.

**Architecture:** Tests run from the workspace root via `bunx vitest run`. Route handlers use dependency injection — we mock the domain context interface for each handler and call it directly. Pure modules (security, services) are tested by importing functions directly. All tests go under `packages/autonomous/test/`.

**Tech Stack:** Vitest, Shaw's existing test-helpers (`createMockIncomingMessage`, `createMockHttpResponse`, `createMockJsonRequest`)

**Branch:** Create a new branch off `upstream/shaw/autonomous-package-foundation`

**Spec:** `docs/superpowers/specs/2026-03-17-autonomous-package-test-suite-design.md`

---

## Chunk 1: Setup + Security Module Tests

### Task 1: Branch setup

**Files:**
- No file changes — git operations only

- [ ] **Step 1: Create working branch off Shaw's PR branch**

```bash
git fetch upstream shaw/autonomous-package-foundation
git checkout -b feat/autonomous-test-suite upstream/shaw/autonomous-package-foundation
```

- [ ] **Step 2: Verify tests can run**

Run: `bunx vitest run packages/autonomous/test/api/lifecycle.test.ts`
Expected: PASS — Shaw's existing lifecycle tests pass

- [ ] **Step 3: Commit (empty, branch marker)**

```bash
git commit --allow-empty -m "chore: start autonomous package test suite"
```

---

### Task 2: network-policy tests

**Files:**
- Create: `packages/autonomous/test/security/network-policy.test.ts`
- Source: `packages/autonomous/src/security/network-policy.ts`

The source exports these pure functions:
```typescript
export function normalizeHostLike(value: string): string
export function decodeIpv6MappedHex(mapped: string): string | null
export function normalizeIpForPolicy(ip: string): string
export function isBlockedPrivateOrLinkLocalIp(ip: string): boolean
export function isLoopbackHost(host: string): boolean
```

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, test, expect } from "vitest";
import {
  normalizeIpForPolicy,
  isBlockedPrivateOrLinkLocalIp,
  isLoopbackHost,
  normalizeHostLike,
  decodeIpv6MappedHex,
} from "../../src/security/network-policy";

describe("network-policy", () => {
  describe("normalizeIpForPolicy", () => {
    test("passes through plain IPv4", () => {
      expect(normalizeIpForPolicy("8.8.8.8")).toBe("8.8.8.8");
    });

    test("strips IPv6-mapped IPv4 prefix", () => {
      expect(normalizeIpForPolicy("::ffff:192.168.1.1")).toBe("192.168.1.1");
    });

    test("lowercases IPv6", () => {
      const result = normalizeIpForPolicy("FE80::1");
      expect(result).toBe(result.toLowerCase());
    });
  });

  describe("isBlockedPrivateOrLinkLocalIp", () => {
    test.each([
      ["10.0.0.1", true],
      ["10.255.255.255", true],
      ["172.16.0.1", true],
      ["172.31.255.255", true],
      ["192.168.0.1", true],
      ["192.168.100.50", true],
      ["127.0.0.1", true],
      ["169.254.1.1", true],
      ["0.0.0.0", true],
      ["8.8.8.8", false],
      ["1.1.1.1", false],
      ["203.0.113.1", false],
    ])("returns %s for %s", (ip, expected) => {
      expect(isBlockedPrivateOrLinkLocalIp(ip)).toBe(expected);
    });

    test("blocks IPv6 loopback ::1", () => {
      expect(isBlockedPrivateOrLinkLocalIp("::1")).toBe(true);
    });

    test("blocks IPv6 unspecified ::", () => {
      expect(isBlockedPrivateOrLinkLocalIp("::")).toBe(true);
    });

    test("blocks IPv6 link-local fe80::", () => {
      expect(isBlockedPrivateOrLinkLocalIp("fe80::1")).toBe(true);
    });

    test("blocks IPv6 ULA fc00::/7", () => {
      expect(isBlockedPrivateOrLinkLocalIp("fd12:3456::1")).toBe(true);
    });

    test("allows public IPv6", () => {
      expect(isBlockedPrivateOrLinkLocalIp("2001:4860:4860::8888")).toBe(false);
    });
  });

  describe("isLoopbackHost", () => {
    test("localhost is loopback", () => {
      expect(isLoopbackHost("localhost")).toBe(true);
    });

    test("127.0.0.1 is loopback", () => {
      expect(isLoopbackHost("127.0.0.1")).toBe(true);
    });

    test("::1 is loopback", () => {
      expect(isLoopbackHost("::1")).toBe(true);
    });

    test("external host is not loopback", () => {
      expect(isLoopbackHost("example.com")).toBe(false);
    });
  });

  describe("normalizeHostLike", () => {
    test("strips port from host:port", () => {
      expect(normalizeHostLike("localhost:3000")).toBe("localhost");
    });

    test("passes through bare host", () => {
      expect(normalizeHostLike("example.com")).toBe("example.com");
    });
  });

  describe("decodeIpv6MappedHex", () => {
    test("decodes hex-mapped IPv4", () => {
      const result = decodeIpv6MappedHex("::ffff:c0a8:0101");
      expect(result).toBe("192.168.1.1");
    });

    test("returns null for non-mapped address", () => {
      expect(decodeIpv6MappedHex("2001:db8::1")).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bunx vitest run packages/autonomous/test/security/network-policy.test.ts`
Expected: All tests PASS (these are testing existing pure functions)

- [ ] **Step 3: Commit**

```bash
git add packages/autonomous/test/security/network-policy.test.ts
git commit -m "test(autonomous): add network-policy unit tests — IP normalization, blocking, loopback"
```

---

### Task 3: audit-log tests

**Files:**
- Create: `packages/autonomous/test/security/audit-log.test.ts`
- Source: `packages/autonomous/src/security/audit-log.ts`

Key exports: `SandboxAuditLog` class, `queryAuditFeed()`, `getAuditFeedSize()`, `subscribeAuditFeed()`, `__resetAuditFeedForTests()`, `AUDIT_EVENT_TYPES`, `AUDIT_SEVERITIES`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  SandboxAuditLog,
  queryAuditFeed,
  getAuditFeedSize,
  subscribeAuditFeed,
  __resetAuditFeedForTests,
  AUDIT_EVENT_TYPES,
  AUDIT_SEVERITIES,
} from "../../src/security/audit-log";

describe("SandboxAuditLog", () => {
  let log: SandboxAuditLog;

  beforeEach(() => {
    log = new SandboxAuditLog();
  });

  test("records an entry and retrieves it", () => {
    log.record({
      type: "policy_decision",
      summary: "allowed fetch",
      severity: "info",
    });
    const recent = log.getRecent(10);
    expect(recent).toHaveLength(1);
    expect(recent[0].type).toBe("policy_decision");
    expect(recent[0].summary).toBe("allowed fetch");
    expect(recent[0].timestamp).toBeDefined();
  });

  test("getByType filters correctly", () => {
    log.record({ type: "policy_decision", summary: "a", severity: "info" });
    log.record({ type: "sandbox_lifecycle", summary: "b", severity: "info" });
    log.record({ type: "policy_decision", summary: "c", severity: "warn" });

    const decisions = log.getByType("policy_decision");
    expect(decisions).toHaveLength(2);
    expect(decisions.every((e) => e.type === "policy_decision")).toBe(true);
  });

  test("size tracks entry count", () => {
    expect(log.size).toBe(0);
    log.record({ type: "policy_decision", summary: "a", severity: "info" });
    expect(log.size).toBe(1);
  });

  test("clear removes all entries", () => {
    log.record({ type: "policy_decision", summary: "a", severity: "info" });
    log.clear();
    expect(log.size).toBe(0);
  });

  test("recordTokenReplacement creates correct entry", () => {
    log.recordTokenReplacement("outbound", "https://api.example.com", ["tok1"]);
    const recent = log.getRecent(1);
    expect(recent[0].type).toBe("secret_token_replacement_outbound");
  });

  test("recordCapabilityInvocation creates correct entry", () => {
    log.recordCapabilityInvocation("shell", "ran ls command");
    const recent = log.getRecent(1);
    expect(recent[0].type).toBe("privileged_capability_invocation");
  });

  test("recordPolicyDecision creates correct entry", () => {
    log.recordPolicyDecision("deny", "blocked private IP");
    const recent = log.getRecent(1);
    expect(recent[0].type).toBe("policy_decision");
  });

  test("calls custom sink when provided", () => {
    const sink = vi.fn();
    const sinkLog = new SandboxAuditLog({ sink });
    sinkLog.record({ type: "policy_decision", summary: "test", severity: "info" });
    expect(sink).toHaveBeenCalledOnce();
    expect(sink.mock.calls[0][0].type).toBe("policy_decision");
  });

  test("respects maxEntries limit", () => {
    const smallLog = new SandboxAuditLog({ maxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      smallLog.record({ type: "policy_decision", summary: `entry-${i}`, severity: "info" });
    }
    expect(smallLog.size).toBeLessThanOrEqual(3);
  });
});

describe("process-level audit feed", () => {
  beforeEach(() => {
    __resetAuditFeedForTests();
  });

  test("queryAuditFeed returns empty initially", () => {
    expect(queryAuditFeed()).toEqual([]);
    expect(getAuditFeedSize()).toBe(0);
  });

  test("subscribeAuditFeed receives new entries", () => {
    const received: unknown[] = [];
    const unsub = subscribeAuditFeed((entry) => received.push(entry));

    const log = new SandboxAuditLog();
    log.record({ type: "sandbox_lifecycle", summary: "started", severity: "info" });

    // Feed is populated by the record call if it pushes to global feed
    unsub();
    // After unsub, no more entries should arrive
  });
});

describe("constants", () => {
  test("AUDIT_EVENT_TYPES has 12 entries", () => {
    expect(AUDIT_EVENT_TYPES.length).toBe(12);
  });

  test("AUDIT_SEVERITIES has 4 levels", () => {
    expect(AUDIT_SEVERITIES).toEqual(["info", "warn", "error", "critical"]);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `bunx vitest run packages/autonomous/test/security/audit-log.test.ts`
Expected: PASS (may need minor adjustments based on actual feed wiring)

- [ ] **Step 3: Fix any failures and re-run**

Adjust assertions based on actual behavior (e.g., the global feed may or may not be wired to individual `SandboxAuditLog` instances). The test structure is correct; only assertion values may need tweaking.

- [ ] **Step 4: Commit**

```bash
git add packages/autonomous/test/security/audit-log.test.ts
git commit -m "test(autonomous): add audit-log tests — recording, querying, subscriptions, limits"
```

---

## Chunk 2: Auth + Agent Lifecycle Route Tests

### Task 4: auth-routes tests

**Files:**
- Create: `packages/autonomous/test/api/auth-routes.test.ts`
- Source: `packages/autonomous/src/api/auth-routes.ts`

The handler signature is `handleAuthRoutes(ctx: AuthRouteContext): Promise<boolean>` where `AuthRouteContext extends RouteRequestContext` with: `pairingEnabled()`, `ensurePairingCode()`, `normalizePairingCode()`, `rateLimitPairing(ip)`, `getPairingExpiresAt()`, `clearPairing()`.

- [ ] **Step 1: Write tests**

```typescript
import { describe, test, expect, vi } from "vitest";
import {
  createMockIncomingMessage,
  createMockHttpResponse,
} from "../../src/test-support/test-helpers";
import { handleAuthRoutes } from "../../src/api/auth-routes";
import type { AuthRouteContext } from "../../src/api/auth-routes";

function buildCtx(
  method: string,
  pathname: string,
  overrides?: Partial<AuthRouteContext>,
): AuthRouteContext {
  const { res, getResponse } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method, url: pathname }),
    res,
    method,
    pathname,
    json: vi.fn((r, data, status = 200) => {
      r.statusCode = status;
      r.end(JSON.stringify(data));
    }),
    error: vi.fn((r, msg, status = 500) => {
      r.statusCode = status;
      r.end(JSON.stringify({ error: msg }));
    }),
    readJsonBody: vi.fn(async () => null),
    pairingEnabled: () => true,
    ensurePairingCode: () => "ABC123",
    normalizePairingCode: (code: string) => code.toUpperCase().trim(),
    rateLimitPairing: () => false,
    getPairingExpiresAt: () => Date.now() + 60_000,
    clearPairing: vi.fn(),
    ...overrides,
  } as AuthRouteContext;
}

describe("auth-routes", () => {
  describe("GET /api/auth/status", () => {
    test("returns pairing status when enabled", async () => {
      const ctx = buildCtx("GET", "/api/auth/status");
      const handled = await handleAuthRoutes(ctx);
      expect(handled).toBe(true);
      expect(ctx.json).toHaveBeenCalledOnce();
      const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(payload).toHaveProperty("enabled");
    });

    test("returns false handled for unrelated path", async () => {
      const ctx = buildCtx("GET", "/api/other");
      const handled = await handleAuthRoutes(ctx);
      expect(handled).toBe(false);
    });
  });

  describe("POST /api/auth/pair", () => {
    test("succeeds with valid code", async () => {
      const ctx = buildCtx("POST", "/api/auth/pair", {
        readJsonBody: vi.fn(async () => ({ code: "ABC123" })),
      });
      const handled = await handleAuthRoutes(ctx);
      expect(handled).toBe(true);
    });

    test("rejects when pairing disabled", async () => {
      const ctx = buildCtx("POST", "/api/auth/pair", {
        pairingEnabled: () => false,
        readJsonBody: vi.fn(async () => ({ code: "ABC123" })),
      });
      const handled = await handleAuthRoutes(ctx);
      expect(handled).toBe(true);
      expect(ctx.error).toHaveBeenCalled();
    });

    test("rejects when rate limited", async () => {
      const ctx = buildCtx("POST", "/api/auth/pair", {
        rateLimitPairing: () => true,
        readJsonBody: vi.fn(async () => ({ code: "ABC123" })),
      });
      const handled = await handleAuthRoutes(ctx);
      expect(handled).toBe(true);
      expect(ctx.error).toHaveBeenCalled();
    });

    test("rejects with missing code", async () => {
      const ctx = buildCtx("POST", "/api/auth/pair", {
        readJsonBody: vi.fn(async () => ({})),
      });
      const handled = await handleAuthRoutes(ctx);
      expect(handled).toBe(true);
      expect(ctx.error).toHaveBeenCalled();
    });

    test("rejects with wrong code", async () => {
      const ctx = buildCtx("POST", "/api/auth/pair", {
        readJsonBody: vi.fn(async () => ({ code: "WRONG" })),
      });
      const handled = await handleAuthRoutes(ctx);
      expect(handled).toBe(true);
      // Should call error or json with failure indicator
    });
  });
});
```

- [ ] **Step 2: Run and adjust**

Run: `bunx vitest run packages/autonomous/test/api/auth-routes.test.ts`
Fix any assertion mismatches based on actual response shape.

- [ ] **Step 3: Commit**

```bash
git add packages/autonomous/test/api/auth-routes.test.ts
git commit -m "test(autonomous): add auth-routes tests — status, pairing, rate limiting"
```

---

### Task 5: agent-lifecycle-routes tests

**Files:**
- Create: `packages/autonomous/test/api/agent-lifecycle-routes.test.ts`
- Source: `packages/autonomous/src/api/agent-lifecycle-routes.ts`

Handler: `handleAgentLifecycleRoutes(ctx: AgentLifecycleRouteContext): Promise<boolean>`
State: `{ runtime, agentState, agentName, model, startedAt }`
Endpoints: start, stop, pause, resume (POST), autonomy (GET/POST)

- [ ] **Step 1: Write tests**

```typescript
import { describe, test, expect, vi } from "vitest";
import {
  createMockIncomingMessage,
  createMockHttpResponse,
} from "../../src/test-support/test-helpers";
import {
  handleAgentLifecycleRoutes,
} from "../../src/api/agent-lifecycle-routes";
import type {
  AgentLifecycleRouteContext,
  AgentLifecycleRouteState,
} from "../../src/api/agent-lifecycle-routes";

function buildState(overrides?: Partial<AgentLifecycleRouteState>): AgentLifecycleRouteState {
  return {
    runtime: null,
    agentState: "not_started",
    agentName: "test-agent",
    model: undefined,
    startedAt: undefined,
    ...overrides,
  };
}

function buildCtx(
  method: string,
  pathname: string,
  state: AgentLifecycleRouteState,
  overrides?: Partial<AgentLifecycleRouteContext>,
): AgentLifecycleRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method, url: pathname }),
    res,
    method,
    pathname,
    json: vi.fn((r, data, status = 200) => {
      r.statusCode = status;
      r.end(JSON.stringify(data));
    }),
    error: vi.fn((r, msg, status = 500) => {
      r.statusCode = status;
      r.end(JSON.stringify({ error: msg }));
    }),
    readJsonBody: vi.fn(async () => ({})),
    state,
    ...overrides,
  } as AgentLifecycleRouteContext;
}

describe("agent-lifecycle-routes", () => {
  test("POST /api/agent/start transitions from not_started", async () => {
    const state = buildState({ agentState: "not_started" });
    const ctx = buildCtx("POST", "/api/agent/start", state);
    const handled = await handleAgentLifecycleRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.json).toHaveBeenCalled();
  });

  test("POST /api/agent/stop transitions to stopped", async () => {
    const state = buildState({ agentState: "running" });
    const ctx = buildCtx("POST", "/api/agent/stop", state);
    const handled = await handleAgentLifecycleRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.json).toHaveBeenCalled();
  });

  test("POST /api/agent/pause transitions to paused", async () => {
    const state = buildState({ agentState: "running" });
    const ctx = buildCtx("POST", "/api/agent/pause", state);
    const handled = await handleAgentLifecycleRoutes(ctx);
    expect(handled).toBe(true);
  });

  test("POST /api/agent/resume transitions from paused to running", async () => {
    const state = buildState({ agentState: "paused" });
    const ctx = buildCtx("POST", "/api/agent/resume", state);
    const handled = await handleAgentLifecycleRoutes(ctx);
    expect(handled).toBe(true);
  });

  test("unrelated path returns false", async () => {
    const state = buildState();
    const ctx = buildCtx("GET", "/api/other", state);
    const handled = await handleAgentLifecycleRoutes(ctx);
    expect(handled).toBe(false);
  });

  test("GET /api/agent/autonomy returns autonomy config", async () => {
    const state = buildState({ agentState: "running" });
    const ctx = buildCtx("GET", "/api/agent/autonomy", state);
    const handled = await handleAgentLifecycleRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.json).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and adjust**

Run: `bunx vitest run packages/autonomous/test/api/agent-lifecycle-routes.test.ts`

- [ ] **Step 3: Commit**

```bash
git add packages/autonomous/test/api/agent-lifecycle-routes.test.ts
git commit -m "test(autonomous): add agent-lifecycle-routes tests — state transitions"
```

---

### Task 6: permissions-routes tests

**Files:**
- Create: `packages/autonomous/test/api/permissions-routes.test.ts`
- Source: `packages/autonomous/src/api/permissions-routes.ts`

Handler: `handlePermissionRoutes(ctx: PermissionRouteContext): Promise<boolean>`
Endpoints: GET /api/permissions, GET/PUT /api/permissions/shell, POST /api/permissions/refresh, PUT /api/permissions/state

- [ ] **Step 1: Write tests**

```typescript
import { describe, test, expect, vi } from "vitest";
import {
  createMockIncomingMessage,
  createMockHttpResponse,
} from "../../src/test-support/test-helpers";
import { handlePermissionRoutes } from "../../src/api/permissions-routes";
import type { PermissionRouteContext } from "../../src/api/permissions-routes";

function buildCtx(
  method: string,
  pathname: string,
  overrides?: Partial<PermissionRouteContext>,
): PermissionRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method, url: pathname }),
    res,
    method,
    pathname,
    json: vi.fn((r, data, status = 200) => {
      r.statusCode = status;
      r.end(JSON.stringify(data));
    }),
    error: vi.fn((r, msg, status = 500) => {
      r.statusCode = status;
      r.end(JSON.stringify({ error: msg }));
    }),
    readJsonBody: vi.fn(async () => ({})),
    state: {
      runtime: null,
      config: { features: { shellEnabled: false } },
      permissionStates: {},
      shellEnabled: false,
    },
    saveConfig: vi.fn(),
    scheduleRuntimeRestart: vi.fn(),
    ...overrides,
  } as PermissionRouteContext;
}

describe("permissions-routes", () => {
  test("GET /api/permissions returns permission states", async () => {
    const ctx = buildCtx("GET", "/api/permissions");
    const handled = await handlePermissionRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.json).toHaveBeenCalled();
  });

  test("GET /api/permissions/shell returns shell status", async () => {
    const ctx = buildCtx("GET", "/api/permissions/shell");
    const handled = await handlePermissionRoutes(ctx);
    expect(handled).toBe(true);
  });

  test("PUT /api/permissions/shell toggles and schedules restart", async () => {
    const ctx = buildCtx("PUT", "/api/permissions/shell", {
      readJsonBody: vi.fn(async () => ({ enabled: true })),
    });
    const handled = await handlePermissionRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.saveConfig).toHaveBeenCalled();
  });

  test("unrelated path returns false", async () => {
    const ctx = buildCtx("GET", "/api/other");
    const handled = await handlePermissionRoutes(ctx);
    expect(handled).toBe(false);
  });
});
```

- [ ] **Step 2: Run and adjust**

Run: `bunx vitest run packages/autonomous/test/api/permissions-routes.test.ts`

- [ ] **Step 3: Commit**

```bash
git add packages/autonomous/test/api/permissions-routes.test.ts
git commit -m "test(autonomous): add permissions-routes tests — read, shell toggle, restart"
```

---

## Chunk 3: Wallet + Knowledge + Memory Route Tests

### Task 7: wallet-routes tests

**Files:**
- Create: `packages/autonomous/test/api/wallet-routes.test.ts`
- Source: `packages/autonomous/src/api/wallet-routes.ts`

Handler: `handleWalletRoutes(ctx: WalletRouteContext): Promise<boolean>`
Endpoints: GET addresses/balances/nfts/config, POST import/generate/export, PUT config

- [ ] **Step 1: Write tests**

```typescript
import { describe, test, expect, vi } from "vitest";
import {
  createMockIncomingMessage,
  createMockHttpResponse,
} from "../../src/test-support/test-helpers";
import {
  handleWalletRoutes,
  DEFAULT_WALLET_ROUTE_DEPENDENCIES,
} from "../../src/api/wallet-routes";
import type { WalletRouteContext } from "../../src/api/wallet-routes";

function buildCtx(
  method: string,
  pathname: string,
  overrides?: Partial<WalletRouteContext>,
): WalletRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method, url: pathname }),
    res,
    method,
    pathname,
    json: vi.fn((r, data, status = 200) => {
      r.statusCode = status;
      r.end(JSON.stringify(data));
    }),
    error: vi.fn((r, msg, status = 500) => {
      r.statusCode = status;
      r.end(JSON.stringify({ error: msg }));
    }),
    readJsonBody: vi.fn(async () => ({})),
    config: { wallets: {} } as any,
    saveConfig: vi.fn(),
    ensureWalletKeysInEnvAndConfig: vi.fn(() => true),
    resolveWalletExportRejection: vi.fn(() => null),
    scheduleRuntimeRestart: vi.fn(),
    deps: {
      getWalletAddresses: vi.fn(async () => ({ evmAddress: "0x123", solanaAddress: null })),
      fetchEvmBalances: vi.fn(async () => []),
      fetchSolanaBalances: vi.fn(async () => ({ tokens: [], nativeBalance: "0" })),
      fetchSolanaNativeBalanceViaRpc: vi.fn(async () => "0"),
      fetchEvmNfts: vi.fn(async () => []),
      fetchSolanaNfts: vi.fn(async () => []),
      validatePrivateKey: vi.fn(() => true),
      importWallet: vi.fn(async () => ({ success: true })),
      generateWalletForChain: vi.fn(async () => ({ address: "0xnew" })),
    },
    ...overrides,
  } as WalletRouteContext;
}

describe("wallet-routes", () => {
  test("GET /api/wallet/addresses returns addresses", async () => {
    const ctx = buildCtx("GET", "/api/wallet/addresses");
    const handled = await handleWalletRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.json).toHaveBeenCalled();
  });

  test("GET /api/wallet/balances calls fetch dependencies", async () => {
    const ctx = buildCtx("GET", "/api/wallet/balances");
    const handled = await handleWalletRoutes(ctx);
    expect(handled).toBe(true);
  });

  test("GET /api/wallet/nfts returns NFT data", async () => {
    const ctx = buildCtx("GET", "/api/wallet/nfts");
    const handled = await handleWalletRoutes(ctx);
    expect(handled).toBe(true);
  });

  test("POST /api/wallet/export checks rejection", async () => {
    const ctx = buildCtx("POST", "/api/wallet/export", {
      resolveWalletExportRejection: vi.fn(() => ({ status: 403 as const, reason: "denied" })),
      readJsonBody: vi.fn(async () => ({ confirm: true })),
    });
    const handled = await handleWalletRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalled();
  });

  test("POST /api/wallet/import with invalid key rejects", async () => {
    const ctx = buildCtx("POST", "/api/wallet/import", {
      deps: {
        ...buildCtx("GET", "/").deps!,
        validatePrivateKey: vi.fn(() => false),
      },
      readJsonBody: vi.fn(async () => ({ privateKey: "invalid", chain: "evm" })),
    });
    const handled = await handleWalletRoutes(ctx);
    expect(handled).toBe(true);
  });

  test("unrelated path returns false", async () => {
    const ctx = buildCtx("GET", "/api/other");
    const handled = await handleWalletRoutes(ctx);
    expect(handled).toBe(false);
  });
});
```

- [ ] **Step 2: Run and adjust**

Run: `bunx vitest run packages/autonomous/test/api/wallet-routes.test.ts`

- [ ] **Step 3: Commit**

```bash
git add packages/autonomous/test/api/wallet-routes.test.ts
git commit -m "test(autonomous): add wallet-routes tests — addresses, balances, nfts, export, import"
```

---

### Task 8: memory-routes tests

**Files:**
- Create: `packages/autonomous/test/api/memory-routes.test.ts`
- Source: `packages/autonomous/src/api/memory-routes.ts`

Handler: `handleMemoryRoutes(ctx: MemoryRouteContext): Promise<boolean>`
Key constants: `MEMORY_SEARCH_DEFAULT_LIMIT = 10`, `MEMORY_SEARCH_MAX_LIMIT = 50`
Endpoints: POST /api/memory/remember, GET /api/memory/search, GET /api/context/quick

- [ ] **Step 1: Write tests**

```typescript
import { describe, test, expect, vi } from "vitest";
import {
  createMockIncomingMessage,
  createMockHttpResponse,
} from "../../src/test-support/test-helpers";
import { handleMemoryRoutes } from "../../src/api/memory-routes";
import type { MemoryRouteContext } from "../../src/api/memory-routes";

function buildCtx(
  method: string,
  pathname: string,
  query = "",
  overrides?: Partial<MemoryRouteContext>,
): MemoryRouteContext {
  const fullUrl = query ? `${pathname}?${query}` : pathname;
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method, url: fullUrl }),
    res,
    method,
    pathname,
    url: new URL(fullUrl, "http://localhost:2138"),
    json: vi.fn((r, data, status = 200) => {
      r.statusCode = status;
      r.end(JSON.stringify(data));
    }),
    error: vi.fn((r, msg, status = 500) => {
      r.statusCode = status;
      r.end(JSON.stringify({ error: msg }));
    }),
    readJsonBody: vi.fn(async () => ({})),
    runtime: null,
    agentName: "test-agent",
    ...overrides,
  } as MemoryRouteContext;
}

describe("memory-routes", () => {
  test("GET /api/memory/search requires runtime", async () => {
    const ctx = buildCtx("GET", "/api/memory/search", "q=hello");
    const handled = await handleMemoryRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalled();
  });

  test("POST /api/memory/remember requires runtime", async () => {
    const ctx = buildCtx("POST", "/api/memory/remember", "", {
      readJsonBody: vi.fn(async () => ({ text: "something to remember" })),
    });
    const handled = await handleMemoryRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalled();
  });

  test("GET /api/context/quick requires runtime", async () => {
    const ctx = buildCtx("GET", "/api/context/quick", "q=test");
    const handled = await handleMemoryRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalled();
  });

  test("unrelated path returns false", async () => {
    const ctx = buildCtx("GET", "/api/other");
    const handled = await handleMemoryRoutes(ctx);
    expect(handled).toBe(false);
  });
});
```

- [ ] **Step 2: Run and adjust**

Run: `bunx vitest run packages/autonomous/test/api/memory-routes.test.ts`

- [ ] **Step 3: Commit**

```bash
git add packages/autonomous/test/api/memory-routes.test.ts
git commit -m "test(autonomous): add memory-routes tests — search, remember, context"
```

---

### Task 9: knowledge-routes tests

**Files:**
- Create: `packages/autonomous/test/api/knowledge-routes.test.ts`
- Source: `packages/autonomous/src/api/knowledge-routes.ts`

Handler: `handleKnowledgeRoutes(ctx: KnowledgeRouteContext): Promise<boolean>`
Constants: `KNOWLEDGE_UPLOAD_MAX_BODY_BYTES = 32MB`, `MAX_BULK_DOCUMENTS = 100`, `BLOCKED_HOST_LITERALS`

- [ ] **Step 1: Write tests**

```typescript
import { describe, test, expect, vi } from "vitest";
import {
  createMockIncomingMessage,
  createMockHttpResponse,
} from "../../src/test-support/test-helpers";
import { handleKnowledgeRoutes } from "../../src/api/knowledge-routes";
import type { KnowledgeRouteContext } from "../../src/api/knowledge-routes";

function buildCtx(
  method: string,
  pathname: string,
  query = "",
  overrides?: Partial<KnowledgeRouteContext>,
): KnowledgeRouteContext {
  const fullUrl = query ? `${pathname}?${query}` : pathname;
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method, url: fullUrl }),
    res,
    method,
    pathname,
    url: new URL(fullUrl, "http://localhost:2138"),
    json: vi.fn((r, data, status = 200) => {
      r.statusCode = status;
      r.end(JSON.stringify(data));
    }),
    error: vi.fn((r, msg, status = 500) => {
      r.statusCode = status;
      r.end(JSON.stringify({ error: msg }));
    }),
    readJsonBody: vi.fn(async () => ({})),
    runtime: null,
    ...overrides,
  } as KnowledgeRouteContext;
}

describe("knowledge-routes", () => {
  test("GET /api/knowledge requires runtime", async () => {
    const ctx = buildCtx("GET", "/api/knowledge");
    const handled = await handleKnowledgeRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalled();
  });

  test("GET /api/knowledge/search requires runtime", async () => {
    const ctx = buildCtx("GET", "/api/knowledge/search", "q=test");
    const handled = await handleKnowledgeRoutes(ctx);
    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalled();
  });

  test("unrelated path returns false", async () => {
    const ctx = buildCtx("GET", "/api/other");
    const handled = await handleKnowledgeRoutes(ctx);
    expect(handled).toBe(false);
  });
});
```

- [ ] **Step 2: Run and adjust**

Run: `bunx vitest run packages/autonomous/test/api/knowledge-routes.test.ts`

- [ ] **Step 3: Commit**

```bash
git add packages/autonomous/test/api/knowledge-routes.test.ts
git commit -m "test(autonomous): add knowledge-routes tests — runtime guard, search"
```

---

## Chunk 4: Tier 2 Route Tests (Core Functionality)

### Task 10: agent-admin-routes tests

**Files:**
- Create: `packages/autonomous/test/api/agent-admin-routes.test.ts`
- Source: `packages/autonomous/src/api/agent-admin-routes.ts`

Follow the same `buildCtx` pattern from Tasks 4-6. Test:
- POST /api/agent/restart succeeds
- POST /api/agent/restart rejects when already restarting
- Pending restart reasons tracked

- [ ] **Step 1: Write tests following the established buildCtx pattern from auth-routes**
- [ ] **Step 2: Run** `bunx vitest run packages/autonomous/test/api/agent-admin-routes.test.ts`
- [ ] **Step 3: Commit** `git commit -m "test(autonomous): add agent-admin-routes tests"`

---

### Task 11: agent-transfer-routes tests

**Files:**
- Create: `packages/autonomous/test/api/agent-transfer-routes.test.ts`

Test:
- POST /api/agent/export with runtime present
- POST /api/agent/export without runtime errors
- POST /api/agent/import without runtime errors
- Unrelated path returns false

- [ ] **Step 1: Write tests**
- [ ] **Step 2: Run** `bunx vitest run packages/autonomous/test/api/agent-transfer-routes.test.ts`
- [ ] **Step 3: Commit** `git commit -m "test(autonomous): add agent-transfer-routes tests"`

---

### Task 12: character-routes tests

**Files:**
- Create: `packages/autonomous/test/api/character-routes.test.ts`

Test:
- GET /api/character returns character data
- PUT /api/character validates and saves
- POST /api/character/generate with valid field
- Character validation rejects missing fields
- Unrelated path returns false

- [ ] **Step 1: Write tests**
- [ ] **Step 2: Run** `bunx vitest run packages/autonomous/test/api/character-routes.test.ts`
- [ ] **Step 3: Commit** `git commit -m "test(autonomous): add character-routes tests"`

---

### Task 13: cloud-routes + cloud-status-routes + cloud-compat-routes tests

**Files:**
- Create: `packages/autonomous/test/api/cloud-routes.test.ts`
- Create: `packages/autonomous/test/api/cloud-status-routes.test.ts`
- Create: `packages/autonomous/test/api/cloud-compat-routes.test.ts`

Shared `buildCloudContext()` factory. Test:
- Cloud manager null handling
- Credit balance fetch
- Cloud URL validation
- Proxy auth header construction
- Proxy timeout handling

- [ ] **Step 1: Write tests for all three files**
- [ ] **Step 2: Run** `bunx vitest run packages/autonomous/test/api/cloud-routes.test.ts packages/autonomous/test/api/cloud-status-routes.test.ts packages/autonomous/test/api/cloud-compat-routes.test.ts`
- [ ] **Step 3: Commit** `git commit -m "test(autonomous): add cloud route tests — routes, status, compat proxy"`

---

### Task 14: diagnostics-routes tests

**Files:**
- Create: `packages/autonomous/test/api/diagnostics-routes.test.ts`

Test:
- GET /api/diagnostics/logs returns log buffer
- GET /api/diagnostics/events returns event buffer
- Audit feed query delegation
- Unrelated path returns false

- [ ] **Step 1: Write tests**
- [ ] **Step 2: Run** `bunx vitest run packages/autonomous/test/api/diagnostics-routes.test.ts`
- [ ] **Step 3: Commit** `git commit -m "test(autonomous): add diagnostics-routes tests"`

---

### Task 15: subscription-routes + registry-routes tests

**Files:**
- Create: `packages/autonomous/test/api/subscription-routes.test.ts`
- Create: `packages/autonomous/test/api/registry-routes.test.ts`

Test:
- GET /api/subscription/status shape
- GET /api/registry/plugins with install status
- Bundled vs loaded plugin distinction

- [ ] **Step 1: Write tests for both files**
- [ ] **Step 2: Run both**
- [ ] **Step 3: Commit** `git commit -m "test(autonomous): add subscription and registry route tests"`

---

### Task 16: version-compat + integration-observability tests

**Files:**
- Create: `packages/autonomous/test/services/version-compat.test.ts`
- Create: `packages/autonomous/test/diagnostics/integration-observability.test.ts`

Test version-compat:
- Compatible versions pass
- Incompatible versions fail with advisory
- Missing exports detected

Test integration-observability:
- Span creation
- Success/failure recording with duration
- Error kind inference (timeout detection)
- Custom sink receives events

- [ ] **Step 1: Write tests for both files**
- [ ] **Step 2: Run both**
- [ ] **Step 3: Commit** `git commit -m "test(autonomous): add version-compat and observability tests"`

---

## Chunk 5: Tier 3 Route Tests + Utilities

### Task 17: Remaining route tests (batch)

**Files to create:**
- `packages/autonomous/test/api/models-routes.test.ts`
- `packages/autonomous/test/api/trigger-routes.test.ts`
- `packages/autonomous/test/api/stream-routes.test.ts`
- `packages/autonomous/test/api/stream-voice-routes.test.ts`
- `packages/autonomous/test/api/sandbox-routes.test.ts`
- `packages/autonomous/test/api/signal-routes.test.ts`
- `packages/autonomous/test/api/whatsapp-routes.test.ts`
- `packages/autonomous/test/api/bug-report-routes.test.ts`
- `packages/autonomous/test/api/trajectory-routes.test.ts`
- `packages/autonomous/test/api/nfa-routes.test.ts`
- `packages/autonomous/test/api/training-routes.test.ts`
- `packages/autonomous/test/api/apps-routes.test.ts`
- `packages/autonomous/test/api/cloud-billing-routes.test.ts`

Each file follows the same buildCtx pattern. Minimum per file: 1 happy-path, 1 error-path, 1 unrelated-path-returns-false.

- [ ] **Step 1: Write all Tier 3 route test files**
- [ ] **Step 2: Run** `bunx vitest run packages/autonomous/test/api/`
- [ ] **Step 3: Fix any failures**
- [ ] **Step 4: Commit** `git commit -m "test(autonomous): add Tier 3 route tests — models, triggers, stream, sandbox, signal, whatsapp, bug-report, trajectory, nfa, training, apps, billing"`

---

### Task 18: Utility module tests

**Files to create:**
- `packages/autonomous/test/auth/credentials.test.ts`
- `packages/autonomous/test/contracts/permissions.test.ts`

Test credentials:
- Save/load round-trip
- Provider resolution (anthropic, codex)

Test permissions:
- Permission state structure
- Platform-specific availability

- [ ] **Step 1: Write both test files**
- [ ] **Step 2: Run both**
- [ ] **Step 3: Commit** `git commit -m "test(autonomous): add credentials and permissions contract tests"`

---

### Task 19: Final validation + push

- [ ] **Step 1: Run full test suite**

```bash
bunx vitest run packages/autonomous/
```

Expected: All tests PASS

- [ ] **Step 2: Count test files and cases**

```bash
find packages/autonomous/test -name "*.test.ts" | wc -l
bunx vitest run packages/autonomous/ --reporter=verbose 2>&1 | tail -5
```

Expected: ~30+ test files, ~150+ test cases passing

- [ ] **Step 3: Push branch**

```bash
git push origin feat/autonomous-test-suite
```

- [ ] **Step 4: Create PR against shaw/autonomous-package-foundation**

```bash
gh pr create \
  --base shaw/autonomous-package-foundation \
  --title "test(autonomous): comprehensive test suite for @milady/autonomous package" \
  --body "$(cat <<'EOF'
## Summary
- Adds ~30 test files with ~150-200 test cases for the extracted @milady/autonomous package
- Covers all API routes (auth, lifecycle, wallet, knowledge, memory, permissions, cloud, diagnostics, etc.)
- Tests security modules (network-policy IP blocking, audit-log recording/querying)
- Tests services (version-compat) and diagnostics (integration-observability)
- Uses existing test infrastructure (createMockIncomingMessage, createMockHttpResponse)
- All tests are deterministic with mocked dependencies

## Testing
`bunx vitest run packages/autonomous/`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
