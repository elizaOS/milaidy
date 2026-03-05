# Identity + Wallet Merge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge the standalone Identity tab into the Wallets tab so on-chain agent identity (BAP-578 NFA / ERC-8004) lives alongside wallet assets in one unified view.

**Architecture:** New `IdentityCard` component embedded at the top of `InventoryView`. New POST endpoints in `nfa-routes.ts` allow UI-driven NFA operations (mint, anchor, transfer, upgrade, pause). A "use wallet key" toggle lets users choose between `EVM_PRIVATE_KEY` and `BNB_PRIVATE_KEY`. Standalone `/identity` route removed.

**Tech Stack:** React 19, TypeScript, ethers.js, Vite, existing `wt__` CSS system

---

### Task 1: Add POST endpoints to nfa-routes.ts

**Files:**
- Modify: `src/api/nfa-routes.ts`
- Test: `src/api/nfa-routes.test.ts` (create)

**Step 1: Write the failing test**

Create `src/api/nfa-routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the plugin-bnb-identity imports
vi.mock("../../packages/plugin-bnb-identity/src/index", () => ({
  readIdentity: vi.fn().mockResolvedValue(null),
  readNfa: vi.fn().mockResolvedValue({
    tokenId: "7",
    network: "bsc-testnet",
    owner: "0xAAA",
    learningRoot: "0x000",
    learningCount: 0,
    paused: false,
    freeMint: true,
    mintTxHash: "0xabc",
  }),
  writeNfa: vi.fn().mockResolvedValue(undefined),
  BnbIdentityService: vi.fn().mockImplementation(() => ({
    mintNfa: vi.fn().mockResolvedValue({
      tokenId: "7",
      txHash: "0xmint",
      owner: "0xAAA",
      network: "bsc-testnet",
      freeMint: true,
    }),
    updateLearningRoot: vi.fn().mockResolvedValue({
      txHash: "0xanchor",
      newRoot: "0xroot",
      leafCount: 3,
    }),
    transferNfa: vi.fn().mockResolvedValue({ txHash: "0xtransfer" }),
    upgradeLogic: vi.fn().mockResolvedValue({ txHash: "0xupgrade" }),
    pauseNfa: vi.fn().mockResolvedValue({ txHash: "0xpause" }),
    unpauseNfa: vi.fn().mockResolvedValue({ txHash: "0xunpause" }),
    getNfaInfo: vi.fn().mockResolvedValue(null),
  })),
}));

import { handleNfaRoutes } from "./nfa-routes";

function makeCtx(method: string, pathname: string, body?: unknown) {
  const res = {};
  const jsonFn = vi.fn();
  const errorFn = vi.fn();
  return {
    ctx: {
      req: {} as never,
      res,
      method,
      pathname,
      json: jsonFn,
      error: errorFn,
      nfaContractAddress: "0xCONTRACT",
      workspaceDir: "/tmp/test-workspace",
      readJsonBody: vi.fn().mockResolvedValue(body ?? {}),
    },
    jsonFn,
    errorFn,
  };
}

describe("POST /api/nfa/mint", () => {
  it("returns success with txHash", async () => {
    const { ctx, jsonFn } = makeCtx("POST", "/api/nfa/mint", {
      useWalletKey: false,
    });
    const handled = await handleNfaRoutes(ctx as any);
    expect(handled).toBe(true);
    expect(jsonFn).toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({ success: true, txHash: "0xmint" }),
    );
  });
});

describe("POST /api/nfa/anchor", () => {
  it("returns success with txHash", async () => {
    const { ctx, jsonFn } = makeCtx("POST", "/api/nfa/anchor");
    const handled = await handleNfaRoutes(ctx as any);
    expect(handled).toBe(true);
    expect(jsonFn).toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({ success: true }),
    );
  });
});

describe("POST /api/nfa/pause", () => {
  it("returns success", async () => {
    const { ctx, jsonFn } = makeCtx("POST", "/api/nfa/pause");
    const handled = await handleNfaRoutes(ctx as any);
    expect(handled).toBe(true);
    expect(jsonFn).toHaveBeenCalledWith(
      ctx.res,
      expect.objectContaining({ success: true }),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/cayden0207/Desktop/Cursor/milady && npx vitest run src/api/nfa-routes.test.ts --reporter verbose`
Expected: FAIL — POST routes not handled, `handleNfaRoutes` returns false

**Step 3: Implement the POST endpoints**

Modify `src/api/nfa-routes.ts`:

1. Extend `NfaRouteContext` interface to include `readJsonBody`:
```typescript
export interface NfaRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "json" | "error"> {
  nfaContractAddress?: string;
  workspaceDir: string;
  readJsonBody: () => Promise<Record<string, unknown>>;
}
```

2. Add imports for `writeNfa` from store and `readFile` for learnings:
```typescript
import {
  readIdentity,
  readNfa,
  writeNfa,
  BnbIdentityService,
} from "../../packages/plugin-bnb-identity/src/index";
```

3. Add helper to resolve the private key:
```typescript
function resolvePrivateKey(body: Record<string, unknown>): string | undefined {
  if (body.useWalletKey) {
    return process.env.EVM_PRIVATE_KEY?.trim() || undefined;
  }
  return process.env.BNB_PRIVATE_KEY?.trim() || undefined;
}
```

4. Add a helper to build the service with a resolved key:
```typescript
function buildService(
  privateKey: string | undefined,
  nfaContractAddress: string,
  network = "bsc-testnet",
): BnbIdentityService {
  return new BnbIdentityService(null as never, {
    privateKey,
    network,
    gatewayPort: 0,
    nfaContractAddress,
  });
}
```

5. Add five POST route handlers inside `handleNfaRoutes()`, after the existing GET handlers but before the final `return false`:

```typescript
  // ── POST /api/nfa/mint ──────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/nfa/mint") {
    try {
      const body = await ctx.readJsonBody();
      const privateKey = resolvePrivateKey(body);
      if (!privateKey || !nfaContractAddress) {
        error(ctx.res, "Private key and BAP578_CONTRACT_ADDRESS required", 400);
        return true;
      }
      const nfa = await readNfa();
      const network = nfa?.network || "bsc-testnet";
      const svc = buildService(privateKey, nfaContractAddress, network);

      const result = await svc.mintNfa(
        String(body.agentURI ?? ""),
        {
          persona: String(body.persona ?? ""),
          experience: String(body.experience ?? ""),
          voiceHash: ethers.ZeroHash,
          animationURI: "",
          vaultURI: "",
          vaultHash: ethers.ZeroHash,
        },
      );

      await writeNfa({
        tokenId: result.tokenId,
        network: result.network,
        owner: result.owner,
        learningRoot: ethers.ZeroHash,
        learningCount: 0,
        lastAnchoredAt: "",
        paused: false,
        freeMint: result.freeMint,
        mintTxHash: result.txHash,
      });

      json(ctx.res, { success: true, txHash: result.txHash, tokenId: result.tokenId });
    } catch (err) {
      error(ctx.res, `Mint failed: ${err instanceof Error ? err.message : "unknown"}`, 500);
    }
    return true;
  }

  // ── POST /api/nfa/anchor ────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/nfa/anchor") {
    try {
      const body = await ctx.readJsonBody();
      const privateKey = resolvePrivateKey(body);
      const nfa = await readNfa();
      if (!privateKey || !nfaContractAddress || !nfa) {
        error(ctx.res, "Private key, contract address, and existing NFA required", 400);
        return true;
      }
      const svc = buildService(privateKey, nfaContractAddress, nfa.network);

      // Read and parse LEARNINGS.md
      const learningsPath = join(workspaceDir, "LEARNINGS.md");
      let raw: string;
      try {
        raw = await readFile(learningsPath, "utf8");
      } catch {
        error(ctx.res, "LEARNINGS.md not found in workspace", 400);
        return true;
      }
      const entries = parseLearningsMd(raw);
      if (entries.length === 0) {
        error(ctx.res, "No learning entries found in LEARNINGS.md", 400);
        return true;
      }

      // Build Merkle tree and anchor
      const { buildMerkleRoot } = await import(
        "../../packages/plugin-bnb-identity/src/merkle-learning"
      );
      const newRoot = buildMerkleRoot(entries);

      const result = await svc.updateLearningRoot(nfa.tokenId, newRoot, entries);
      await patchNfa({
        learningRoot: newRoot,
        learningCount: entries.length,
        lastAnchoredAt: new Date().toISOString(),
      });

      json(ctx.res, { success: true, txHash: result.txHash, root: newRoot, count: entries.length });
    } catch (err) {
      error(ctx.res, `Anchor failed: ${err instanceof Error ? err.message : "unknown"}`, 500);
    }
    return true;
  }

  // ── POST /api/nfa/transfer ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/nfa/transfer") {
    try {
      const body = await ctx.readJsonBody();
      const privateKey = resolvePrivateKey(body);
      const nfa = await readNfa();
      const to = String(body.to ?? "");
      if (!privateKey || !nfaContractAddress || !nfa || !to) {
        error(ctx.res, "Private key, contract, NFA, and target address required", 400);
        return true;
      }
      if (nfa.freeMint) {
        error(ctx.res, "Free-minted NFAs cannot be transferred", 400);
        return true;
      }
      const svc = buildService(privateKey, nfaContractAddress, nfa.network);
      const result = await svc.transferNfa(nfa.tokenId, to);
      await patchNfa({ owner: to });
      json(ctx.res, { success: true, txHash: result.txHash });
    } catch (err) {
      error(ctx.res, `Transfer failed: ${err instanceof Error ? err.message : "unknown"}`, 500);
    }
    return true;
  }

  // ── POST /api/nfa/upgrade-logic ─────────────────────────────────────
  if (method === "POST" && pathname === "/api/nfa/upgrade-logic") {
    try {
      const body = await ctx.readJsonBody();
      const privateKey = resolvePrivateKey(body);
      const nfa = await readNfa();
      const logicAddress = String(body.logicAddress ?? "");
      if (!privateKey || !nfaContractAddress || !nfa || !logicAddress) {
        error(ctx.res, "Private key, contract, NFA, and logic address required", 400);
        return true;
      }
      const svc = buildService(privateKey, nfaContractAddress, nfa.network);
      const result = await svc.upgradeLogic(nfa.tokenId, logicAddress);
      await patchNfa({ logicContract: logicAddress });
      json(ctx.res, { success: true, txHash: result.txHash });
    } catch (err) {
      error(ctx.res, `Upgrade failed: ${err instanceof Error ? err.message : "unknown"}`, 500);
    }
    return true;
  }

  // ── POST /api/nfa/pause ─────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/nfa/pause") {
    try {
      const body = await ctx.readJsonBody();
      const privateKey = resolvePrivateKey(body);
      const nfa = await readNfa();
      if (!privateKey || !nfaContractAddress || !nfa) {
        error(ctx.res, "Private key, contract address, and NFA required", 400);
        return true;
      }
      const svc = buildService(privateKey, nfaContractAddress, nfa.network);
      if (nfa.paused) {
        const result = await svc.unpauseNfa(nfa.tokenId);
        await patchNfa({ paused: false });
        json(ctx.res, { success: true, txHash: result.txHash, paused: false });
      } else {
        const result = await svc.pauseNfa(nfa.tokenId);
        await patchNfa({ paused: true });
        json(ctx.res, { success: true, txHash: result.txHash, paused: true });
      }
    } catch (err) {
      error(ctx.res, `Pause toggle failed: ${err instanceof Error ? err.message : "unknown"}`, 500);
    }
    return true;
  }
```

6. Add `ethers` import at the top:
```typescript
import { ethers } from "ethers";
```

7. Add `patchNfa` to the plugin import:
```typescript
import {
  readIdentity,
  readNfa,
  writeNfa,
  patchNfa,
  BnbIdentityService,
} from "../../packages/plugin-bnb-identity/src/index";
```

**Step 4: Update server.ts to pass `readJsonBody`**

In `src/api/server.ts` around line 9445, add `readJsonBody` to the context:

```typescript
await handleNfaRoutes({
  req,
  res,
  method,
  pathname,
  json,
  error,
  readJsonBody: () => readJsonBody(req),  // add this line
  nfaContractAddress: process.env.BAP578_CONTRACT_ADDRESS,
  workspaceDir:
    state.config.agents?.defaults?.workspace ??
    resolveDefaultAgentWorkspaceDir(),
})
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/cayden0207/Desktop/Cursor/milady && npx vitest run src/api/nfa-routes.test.ts --reporter verbose`
Expected: PASS

**Step 6: Commit**

```bash
git add src/api/nfa-routes.ts src/api/nfa-routes.test.ts src/api/server.ts
git commit -m "feat(api): add POST endpoints for NFA operations (mint, anchor, transfer, upgrade, pause)"
```

---

### Task 2: Add NFA POST methods to api-client.ts

**Files:**
- Modify: `apps/app/src/api-client.ts` (around line 3147)

**Step 1: Add response types and client methods**

After the existing `getNfaLearnings()` method (line ~3147), add:

```typescript
  /** Mint a new NFA. */
  async mintNfa(opts: {
    useWalletKey?: boolean;
    persona?: string;
    experience?: string;
    agentURI?: string;
  }): Promise<{ success: boolean; txHash?: string; tokenId?: string; error?: string }> {
    return this.fetchJson("/api/nfa/mint", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  /** Anchor learnings on-chain. */
  async anchorLearnings(opts: {
    useWalletKey?: boolean;
  }): Promise<{ success: boolean; txHash?: string; root?: string; count?: number; error?: string }> {
    return this.fetchJson("/api/nfa/anchor", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  /** Transfer NFA to another address. */
  async transferNfa(opts: {
    to: string;
    useWalletKey?: boolean;
  }): Promise<{ success: boolean; txHash?: string; error?: string }> {
    return this.fetchJson("/api/nfa/transfer", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  /** Upgrade NFA logic contract. */
  async upgradeNfaLogic(opts: {
    logicAddress: string;
    useWalletKey?: boolean;
  }): Promise<{ success: boolean; txHash?: string; error?: string }> {
    return this.fetchJson("/api/nfa/upgrade-logic", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  /** Toggle NFA pause state. */
  async toggleNfaPause(opts: {
    useWalletKey?: boolean;
  }): Promise<{ success: boolean; txHash?: string; paused?: boolean; error?: string }> {
    return this.fetchJson("/api/nfa/pause", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }
```

**Step 2: Commit**

```bash
git add apps/app/src/api-client.ts
git commit -m "feat(app): add NFA POST client methods (mint, anchor, transfer, upgrade, pause)"
```

---

### Task 3: Create NfaConfirmDialog component

**Files:**
- Create: `apps/app/src/components/NfaConfirmDialog.tsx`

**Step 1: Create the confirm dialog component**

This reuses the existing modal patterns from the app. It is a simple confirm/cancel dialog.

```typescript
/**
 * NfaConfirmDialog — confirmation modal for NFA operations.
 * Uses the same visual language as wallet trade confirmation.
 */

import { useState } from "react";

export type NfaOperation =
  | "mint"
  | "anchor"
  | "transfer"
  | "upgrade-logic"
  | "pause"
  | "unpause";

interface NfaConfirmDialogProps {
  operation: NfaOperation;
  /** Extra detail lines shown in the dialog body. */
  details?: string[];
  /** Called with true on confirm, false on cancel. */
  onResult: (confirmed: boolean) => void;
}

const OP_LABELS: Record<NfaOperation, { title: string; warning?: string }> = {
  mint: { title: "Mint NFA" },
  anchor: { title: "Anchor Learnings" },
  transfer: {
    title: "Transfer NFA",
    warning: "IRREVERSIBLE. The new owner will control your on-chain identity.",
  },
  "upgrade-logic": {
    title: "Upgrade Logic Contract",
    warning: "This changes the on-chain behavior of your NFA.",
  },
  pause: { title: "Pause NFA" },
  unpause: { title: "Unpause NFA" },
};

export function NfaConfirmDialog({
  operation,
  details,
  onResult,
}: NfaConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const label = OP_LABELS[operation];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="border border-border bg-bg p-5 max-w-sm w-full space-y-3">
        <div className="text-sm font-bold">{label.title}</div>
        {label.warning && (
          <div className="px-3 py-2 border border-danger bg-danger/5 text-[11px] text-danger">
            {label.warning}
          </div>
        )}
        {details?.map((d) => (
          <div key={d} className="text-xs text-muted font-mono truncate">
            {d}
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            className="wt__btn flex-1"
            disabled={busy}
            onClick={() => onResult(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="wt__btn is-buy flex-1"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onResult(true);
            }}
          >
            {busy ? "Sending..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/app/src/components/NfaConfirmDialog.tsx
git commit -m "feat(app): add NfaConfirmDialog component"
```

---

### Task 4: Create IdentityCard component

**Files:**
- Create: `apps/app/src/components/IdentityCard.tsx`

**Step 1: Create the IdentityCard component**

This is the core UI component. It fetches NFA status itself (no dependency on AppContext NFA state) and renders inline with the wallet's `wt__` visual system.

```typescript
/**
 * IdentityCard — on-chain NFA identity card for the Wallets tab.
 *
 * Renders at the top of InventoryView. Shows onboarding CTA when no NFA,
 * or full NFA status + action buttons when registered.
 */

import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useApp } from "../AppContext";
import type { NfaStatusResponse } from "../api-client";
import { NfaConfirmDialog, type NfaOperation } from "./NfaConfirmDialog";

const BSCSCAN = "https://bscscan.com";
const BSCSCAN_TESTNET = "https://testnet.bscscan.com";

function explorer(network: string): string {
  return network === "bsc" ? BSCSCAN : BSCSCAN_TESTNET;
}

export function IdentityCard() {
  const { client } = useApp();
  const [status, setStatus] = useState<NfaStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useWalletKey, setUseWalletKey] = useState(true);
  const [pendingOp, setPendingOp] = useState<{
    op: NfaOperation;
    details?: string[];
  } | null>(null);
  const [txResult, setTxResult] = useState<{
    success: boolean;
    txHash?: string;
    error?: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const s = await client.getNfaStatus();
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load identity");
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const nfa = status?.nfa;
  const identity = status?.identity;
  const onChain = status?.onChain;
  const isActive = onChain ? onChain.active : nfa ? !nfa.paused : null;

  // ── Action handlers ────────────────────────────────────────────────

  async function handleConfirm(confirmed: boolean) {
    if (!confirmed || !pendingOp) {
      setPendingOp(null);
      return;
    }
    const op = pendingOp.op;
    setPendingOp(null);
    setTxResult(null);

    try {
      let result: { success: boolean; txHash?: string; error?: string };
      switch (op) {
        case "mint":
          result = await client.mintNfa({ useWalletKey });
          break;
        case "anchor":
          result = await client.anchorLearnings({ useWalletKey });
          break;
        case "transfer":
          // Transfer target is stored in pendingOp.details
          result = await client.transferNfa({
            to: pendingOp.details?.[0]?.replace("To: ", "") ?? "",
            useWalletKey,
          });
          break;
        case "upgrade-logic":
          result = await client.upgradeNfaLogic({
            logicAddress: pendingOp.details?.[0]?.replace("Address: ", "") ?? "",
            useWalletKey,
          });
          break;
        case "pause":
        case "unpause":
          result = await client.toggleNfaPause({ useWalletKey });
          break;
        default:
          return;
      }
      setTxResult(result);
      if (result.success) refresh();
    } catch (err) {
      setTxResult({
        success: false,
        error: err instanceof Error ? err.message : "Operation failed",
      });
    }
  }

  // ── Prompt helpers (for transfer/upgrade that need input) ──────────

  function promptTransfer() {
    const to = window.prompt("Enter target address (0x...):");
    if (!to?.match(/^0x[a-fA-F0-9]{40}$/)) return;
    setPendingOp({ op: "transfer", details: [`To: ${to}`] });
  }

  function promptUpgrade() {
    const addr = window.prompt("Enter new logic contract address (0x...):");
    if (!addr?.match(/^0x[a-fA-F0-9]{40}$/)) return;
    setPendingOp({ op: "upgrade-logic", details: [`Address: ${addr}`] });
  }

  // ── Loading / Error states ─────────────────────────────────────────

  if (loading && !status) {
    return (
      <div className="wt__portfolio">
        <div className="text-xs text-muted italic">Loading identity...</div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="wt__portfolio">
        <div className="text-xs text-danger">{error}</div>
      </div>
    );
  }

  // ── Unregistered state ─────────────────────────────────────────────

  if (!nfa) {
    return (
      <div className="wt__portfolio">
        <div className="wt__portfolio-label">On-Chain Agent Identity</div>
        <p className="text-xs text-muted mt-1 mb-2 leading-relaxed">
          Mint an NFA to get a verifiable on-chain identity (ERC-8004 + BAP-578).
        </p>
        <label className="flex items-center gap-1.5 text-[11px] font-mono text-muted mb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useWalletKey}
            onChange={(e) => setUseWalletKey(e.target.checked)}
          />
          Use wallet key as NFA owner
        </label>
        <button
          type="button"
          className="wt__btn is-buy"
          onClick={() => setPendingOp({ op: "mint" })}
        >
          Mint NFA
        </button>
        {txResult && (
          <TxResultBanner result={txResult} onDismiss={() => setTxResult(null)} />
        )}
        {pendingOp && (
          <NfaConfirmDialog
            operation={pendingOp.op}
            details={pendingOp.details}
            onResult={handleConfirm}
          />
        )}
      </div>
    );
  }

  // ── Registered state ───────────────────────────────────────────────

  const net = nfa.network || "bsc-testnet";
  const base = explorer(net);

  return (
    <div className="wt__portfolio">
      {/* Header row */}
      <div className="flex items-center gap-2 mb-1">
        <div className="wt__portfolio-label">NFA #{nfa.tokenId}</div>
        {isActive !== null && (
          <span
            className={`px-1.5 py-0.5 text-[10px] font-mono border ${
              isActive
                ? "border-[rgba(46,204,113,0.4)] text-[rgb(46,204,113)] bg-[rgba(46,204,113,0.08)]"
                : "border-danger text-danger bg-danger/5"
            }`}
          >
            {isActive ? "Active" : "Paused"}
          </span>
        )}
        {nfa.freeMint && (
          <span className="px-1.5 py-0.5 text-[10px] font-mono border border-accent text-accent bg-accent/5">
            Free Mint
          </span>
        )}
      </div>

      {/* Owner address */}
      <div className="flex items-center gap-1.5 text-xs font-mono text-muted">
        <span className="truncate">{nfa.owner}</span>
        <a
          href={`${base}/address/${nfa.owner}`}
          target="_blank"
          rel="noopener noreferrer"
          className="wt__quote-link shrink-0"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* ERC-8004 ID if registered */}
      {identity && (
        <div className="text-[11px] text-muted mt-1">
          ERC-8004 Agent #{identity.agentId}
        </div>
      )}

      {/* Learning summary */}
      <div className="wt__bnb-sub mt-1">
        {nfa.learningCount > 0
          ? `${nfa.learningCount} learnings anchored`
          : "No learnings anchored yet"}
        {nfa.lastAnchoredAt && (
          <span className="text-muted">
            {" "}· {new Date(nfa.lastAnchoredAt).toLocaleDateString()}
          </span>
        )}
      </div>
      {nfa.learningRoot && nfa.learningRoot !== "0x" + "0".repeat(64) && (
        <div className="text-[10px] font-mono text-muted truncate mt-0.5">
          root {nfa.learningRoot}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          className="wt__btn is-buy"
          onClick={() => setPendingOp({ op: "anchor" })}
        >
          Anchor Learnings
        </button>
        <OverflowMenu
          nfa={nfa}
          onPause={() =>
            setPendingOp({ op: nfa.paused ? "unpause" : "pause" })
          }
          onTransfer={promptTransfer}
          onUpgrade={promptUpgrade}
        />
      </div>

      {/* Tx result banner */}
      {txResult && (
        <TxResultBanner result={txResult} onDismiss={() => setTxResult(null)} />
      )}

      {/* Confirm dialog */}
      {pendingOp && (
        <NfaConfirmDialog
          operation={pendingOp.op}
          details={pendingOp.details}
          onResult={handleConfirm}
        />
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function TxResultBanner({
  result,
  onDismiss,
}: {
  result: { success: boolean; txHash?: string; error?: string };
  onDismiss: () => void;
}) {
  return (
    <div
      className={`mt-2 px-3 py-2 text-[11px] border ${
        result.success
          ? "border-[rgba(46,204,113,0.4)] bg-[rgba(46,204,113,0.06)] text-[rgb(46,204,113)]"
          : "border-danger bg-danger/5 text-danger"
      }`}
    >
      <div className="flex items-center justify-between">
        <span>
          {result.success
            ? `Tx sent: ${result.txHash?.slice(0, 10)}...`
            : result.error || "Operation failed"}
        </span>
        <button
          type="button"
          className="text-muted hover:text-txt text-[10px] cursor-pointer"
          onClick={onDismiss}
        >
          dismiss
        </button>
      </div>
    </div>
  );
}

function OverflowMenu({
  nfa,
  onPause,
  onTransfer,
  onUpgrade,
}: {
  nfa: { paused: boolean; freeMint: boolean };
  onPause: () => void;
  onTransfer: () => void;
  onUpgrade: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        className="wt__btn"
        onClick={() => setOpen(!open)}
      >
        ...
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-10 border border-border bg-bg min-w-[140px]">
          <button
            type="button"
            className="block w-full text-left px-3 py-1.5 text-[11px] font-mono hover:bg-bg-hover cursor-pointer"
            onClick={() => {
              setOpen(false);
              onPause();
            }}
          >
            {nfa.paused ? "Unpause" : "Pause"}
          </button>
          {!nfa.freeMint && (
            <button
              type="button"
              className="block w-full text-left px-3 py-1.5 text-[11px] font-mono hover:bg-bg-hover cursor-pointer"
              onClick={() => {
                setOpen(false);
                onTransfer();
              }}
            >
              Transfer
            </button>
          )}
          <button
            type="button"
            className="block w-full text-left px-3 py-1.5 text-[11px] font-mono hover:bg-bg-hover cursor-pointer"
            onClick={() => {
              setOpen(false);
              onUpgrade();
            }}
          >
            Upgrade Logic
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/app/src/components/IdentityCard.tsx
git commit -m "feat(app): add IdentityCard component with NFA status and action buttons"
```

---

### Task 5: Embed IdentityCard in InventoryView

**Files:**
- Modify: `apps/app/src/components/InventoryView.tsx` (lines 1-7, 1150-1151)

**Step 1: Add import**

At the top of `InventoryView.tsx`, after the existing imports (around line 6), add:

```typescript
import { IdentityCard } from "./IdentityCard";
```

**Step 2: Insert IdentityCard in renderContent()**

In the `renderContent()` function (line 1150), insert `<IdentityCard />` as the first child of the `space-y-2 mt-3` div:

```diff
     return (
       <div className="space-y-2 mt-3">
+        <IdentityCard />
         {/* ── Block 1: Portfolio header ─────────────────────────── */}
         <div className="wt__portfolio">
```

**Step 3: Verify the app compiles**

Run: `cd /Users/cayden0207/Desktop/Cursor/milady/apps/app && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/app/src/components/InventoryView.tsx
git commit -m "feat(app): embed IdentityCard at top of Wallets view"
```

---

### Task 6: Remove standalone Identity tab and route

**Files:**
- Modify: `apps/app/src/navigation.ts` (lines 29-53, 148-173, 241-294)
- Modify: `apps/app/src/App.tsx` (lines 22, 77-78)
- Delete: `apps/app/src/components/IdentityView.tsx`
- Modify: `apps/app/src/AppContext.tsx` (lines 64, 945-948, 1204, 1527-1530, 2299-2311, 5885-5887, 6074)

**Step 1: Remove from navigation.ts**

1. Remove `"identity"` from the `Tab` union type (line 36)
2. Remove `identity: "/identity"` from `TAB_PATHS` (line 155)
3. Remove `case "identity"` from `titleForTab()` (lines 253-254)

**Step 2: Remove from App.tsx**

1. Remove the `IdentityView` import (line 22)
2. Remove the `case "identity": return <IdentityView />;` block (lines 77-78)

**Step 3: Remove NFA state from AppContext.tsx**

1. Remove `NfaStatusResponse` from the import (line 64)
2. Remove `nfaStatus`, `nfaStatusLoading`, `nfaStatusError` from the context interface (lines 945-948)
3. Remove `loadNfaStatus` from the context interface (line 1204)
4. Remove the three `useState` calls for NFA state (lines 1527-1530)
5. Remove the `loadNfaStatus` useCallback (lines 2299-2311)
6. Remove nfaStatus/nfaStatusLoading/nfaStatusError/loadNfaStatus from the context value object (lines 5885-5887, 6074)

**Step 4: Delete IdentityView.tsx**

```bash
rm apps/app/src/components/IdentityView.tsx
```

**Step 5: Verify the app compiles**

Run: `cd /Users/cayden0207/Desktop/Cursor/milady/apps/app && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds with no errors

**Step 6: Commit**

```bash
git add -A apps/app/src/navigation.ts apps/app/src/App.tsx apps/app/src/AppContext.tsx
git rm apps/app/src/components/IdentityView.tsx
git commit -m "refactor(app): remove standalone Identity tab, merge into Wallets"
```

---

### Task 7: Verify end-to-end and clean up

**Files:**
- Check: all modified files

**Step 1: Run the full app build**

Run: `cd /Users/cayden0207/Desktop/Cursor/milady/apps/app && npx vite build --mode development`
Expected: Build succeeds

**Step 2: Run existing tests**

Run: `cd /Users/cayden0207/Desktop/Cursor/milady && npx vitest run --reporter verbose 2>&1 | tail -20`
Expected: All tests pass (or pre-existing failures only)

**Step 3: Run the new nfa-routes test**

Run: `cd /Users/cayden0207/Desktop/Cursor/milady && npx vitest run src/api/nfa-routes.test.ts --reporter verbose`
Expected: All tests pass

**Step 4: Manual verification checklist**

- [ ] `/wallets` shows IdentityCard at top
- [ ] When no NFA: shows onboarding CTA with "Mint NFA" button and toggle
- [ ] When NFA exists: shows token ID, status badges, owner, learning summary
- [ ] "Anchor Learnings" button triggers confirm dialog
- [ ] Overflow menu shows Pause/Transfer/Upgrade
- [ ] `/identity` route returns 404 or falls through to default
- [ ] Chat NFA actions still work independently

**Step 5: Final commit if any cleanup needed**

```bash
git add -A && git commit -m "chore: clean up identity-wallet merge"
```
