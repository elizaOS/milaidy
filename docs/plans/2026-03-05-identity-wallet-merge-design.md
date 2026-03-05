# Identity + Wallet Merge Design

**Date:** 2026-03-05
**Branch:** feat/bsc-adoption
**Status:** Approved

## Goal

Merge the standalone Identity tab (BAP-578 NFA / ERC-8004) into the Wallets tab so that on-chain agent identity and wallet assets live in one unified view. Remove the standalone `/identity` route.

## Decisions

| Decision | Choice |
|----------|--------|
| NFA operation trigger | UI buttons with confirm dialog (chat actions also preserved) |
| Key management | UI toggle "Use wallet key as NFA owner" — user chooses per-session |
| Route handling | Delete `/identity` entirely (no redirect) |
| Card position | Top of wallet, above portfolio header |
| Unregistered state | Onboarding CTA card with [Mint NFA] button |
| Action button layout | Dynamic by state: unregistered = Mint; registered = Anchor Learnings + overflow menu (Transfer, Upgrade Logic, Pause) |
| Visual style | Reuse existing `wt__` terminal/degen CSS system, no new design language |

## Architecture

### Approach: IdentityCard embedded in InventoryView

```
InventoryView.tsx renderContent()
  <div className="space-y-2 mt-3">
    <IdentityCard />              <-- new component, top position
    <div className="wt__portfolio"> ... existing portfolio ...
    <div className="wt__quick"> ... existing swap panel ...
```

### New Components

| File | Responsibility |
|------|----------------|
| `IdentityCard.tsx` | NFA identity card: status display, action buttons, key toggle. Uses `wt__` CSS classes. |
| `NfaConfirmDialog.tsx` | Confirmation modal for NFA operations (mint, anchor, transfer, upgrade, pause). |

### New API Endpoints

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| POST | `/api/nfa/mint` | `{ useWalletKey?: boolean }` | Mint NFA |
| POST | `/api/nfa/anchor` | `{ useWalletKey?: boolean }` | Anchor learnings |
| POST | `/api/nfa/transfer` | `{ to: string, useWalletKey?: boolean }` | Transfer NFA |
| POST | `/api/nfa/upgrade-logic` | `{ logicAddress: string, useWalletKey?: boolean }` | Upgrade logic contract |
| POST | `/api/nfa/pause` | `{ useWalletKey?: boolean }` | Toggle pause |
| GET | `/api/nfa/status` | -- | Already exists, no change |

All POST endpoints:
- Resolve private key: if `useWalletKey` true, use `EVM_PRIVATE_KEY`; else use `BNB_PRIVATE_KEY`
- Persist `keySource` preference in `~/.milady/bnb-nfa.json`
- Reuse `BnbIdentityService` methods (no duplication of chain logic)
- Return `{ success: boolean, txHash?: string, error?: string }`

### Key Toggle Logic

```
User toggles "Use wallet key as NFA owner":
  -> Frontend sends useWalletKey: true/false with each NFA POST
  -> Backend resolves: useWalletKey ? EVM_PRIVATE_KEY : BNB_PRIVATE_KEY
  -> Preference stored in ~/.milady/bnb-nfa.json as keySource field
  -> Toggle only shown when NFA not yet minted (key binding fixed after mint)
```

### BnbIdentityService Change

Add a `fromKey(privateKey: string)` factory method so `nfa-routes.ts` can instantiate the service with the resolved key, rather than always reading from plugin settings.

### Route Cleanup

| File | Change |
|------|--------|
| `navigation.ts` | Remove `"identity"` from Tab union, remove `/identity` path |
| `App.tsx` | Remove `case "identity"` and `IdentityView` import |
| `AppContext.tsx` | Remove standalone `nfaStatus` state (IdentityCard manages its own fetch) |
| `IdentityView.tsx` | Delete file |

### IdentityCard Visual Design

Uses existing `wt__` terminal aesthetic:

**Unregistered:**
- Container: same as `wallets-bsc__setup` style (border, bg-card, text-center)
- Title: `wt__portfolio-label` typography
- Description: `text-xs text-muted`
- Toggle: `text-[11px] font-mono`
- Button: `wt__btn` style

**Registered:**
- Container: `wt__portfolio` style block
- Token ID + badges: `wt__portfolio-label` + existing StatusBadge/FreeMintBadge
- Address: `font-mono text-xs` + `wt__quote-link` for bscscan links
- Learning summary: `wt__bnb-sub` style
- Merkle root: `font-mono text-[10px] text-muted`
- Action buttons: `wt__btn` for primary, dropdown for overflow

### Chat Actions

Existing chat-triggered NFA actions in `nfa-actions.ts` remain unchanged. Two entry points (UI + Chat) share the same `BnbIdentityService` layer.

## Non-Goals

- No BalanceSection/SwapSection extraction from InventoryView (avoid large refactor)
- No sub-tab navigation within Wallets
- No changes to streaming, social, or other tabs
- No changes to ERC-8004 MCP integration path
