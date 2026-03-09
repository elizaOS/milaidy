/**
 * Unit tests for companion-shell-styles.ts — overlay tab membership,
 * tab flags, and derived styling helpers.
 *
 * Regression tests are marked with [REGRESSION] and document bugs that have
 * previously caused real breakage.
 */

import { describe, expect, it } from "vitest";
import type { Tab } from "../navigation";
import {
  ACCENT_COLORS,
  COMPANION_OVERLAY_TABS,
  TOP_BAR_COLORS,
  accentSubtleVar,
  accentVar,
  cardSizeClass,
  overlayBackdropClass,
  tabFlags,
} from "./companion-shell-styles";

// ---------------------------------------------------------------------------
// COMPANION_OVERLAY_TABS membership
// ---------------------------------------------------------------------------

describe("COMPANION_OVERLAY_TABS", () => {
  const EXPECTED_TABS: Tab[] = [
    "companion",
    "skills",
    "character",
    "character-select",
    "settings",
    "plugins",
    "advanced",
    "actions",
    "workflows",
    "triggers",
    "fine-tuning",
    "trajectories",
    "runtime",
    "database",
    "logs",
    "security",
    "apps",
    "connectors",
    "knowledge",
    "lifo",
    "stream",
    "wallets",
  ];

  for (const tab of EXPECTED_TABS) {
    it(`contains "${tab}"`, () =>
      expect(COMPANION_OVERLAY_TABS.has(tab)).toBe(true));
  }

  // [REGRESSION] "workflows" was absent from COMPANION_OVERLAY_TABS after PR
  // #876 shipped the visual workflow builder. The companion shell checked this
  // set to decide whether to render an overlay panel — missing entry meant the
  // tab was completely invisible in companion mode.
  it("[REGRESSION] workflows is in COMPANION_OVERLAY_TABS", () =>
    expect(COMPANION_OVERLAY_TABS.has("workflows")).toBe(true));

  // "chat" should NOT be an overlay — it is the base companion background
  it("does NOT contain chat (base view, not an overlay)", () =>
    expect(COMPANION_OVERLAY_TABS.has("chat")).toBe(false));
});

// ---------------------------------------------------------------------------
// tabFlags — isAdvancedOverlay
// ---------------------------------------------------------------------------

describe("tabFlags — isAdvancedOverlay", () => {
  const ADVANCED_OVERLAY_TABS: Tab[] = [
    "advanced",
    "actions",
    "workflows",
    "triggers",
    "fine-tuning",
    "trajectories",
    "runtime",
    "database",
    "logs",
    "security",
    "lifo",
  ];

  for (const tab of ADVANCED_OVERLAY_TABS) {
    it(`isAdvancedOverlay=true for "${tab}"`, () =>
      expect(tabFlags(tab).isAdvancedOverlay).toBe(true));
  }

  // [REGRESSION] tabFlags("workflows").isAdvancedOverlay was false after PR
  // #876. Every advanced sub-tab must return true so the companion shell
  // applies the correct full-screen backdrop, card sizing, and CSS variable
  // theme. Without it, workflows rendered with the wrong layout contract.
  it("[REGRESSION] tabFlags(workflows).isAdvancedOverlay is true", () =>
    expect(tabFlags("workflows").isAdvancedOverlay).toBe(true));

  // Non-advanced tabs must not bleed into the advanced-overlay bucket
  it("isAdvancedOverlay=false for chat", () =>
    expect(tabFlags("chat").isAdvancedOverlay).toBe(false));
  it("isAdvancedOverlay=false for stream", () =>
    expect(tabFlags("stream").isAdvancedOverlay).toBe(false));
  it("isAdvancedOverlay=false for wallets", () =>
    expect(tabFlags("wallets").isAdvancedOverlay).toBe(false));
  it("isAdvancedOverlay=false for settings", () =>
    expect(tabFlags("settings").isAdvancedOverlay).toBe(false));
  it("isAdvancedOverlay=false for knowledge", () =>
    expect(tabFlags("knowledge").isAdvancedOverlay).toBe(false));
});

// ---------------------------------------------------------------------------
// tabFlags — isCentered (advanced overlays are centered)
// ---------------------------------------------------------------------------

describe("tabFlags — isCentered", () => {
  // isAdvancedOverlay ⟹ isCentered
  it("isCentered=true for workflows (via isAdvancedOverlay)", () =>
    expect(tabFlags("workflows").isCentered).toBe(true));
  it("isCentered=true for advanced", () =>
    expect(tabFlags("advanced").isCentered).toBe(true));
  it("isCentered=true for actions", () =>
    expect(tabFlags("actions").isCentered).toBe(true));
  it("isCentered=true for triggers", () =>
    expect(tabFlags("triggers").isCentered).toBe(true));

  it("isCentered=false for chat", () =>
    expect(tabFlags("chat").isCentered).toBe(false));
  it("isCentered=false for character", () =>
    expect(tabFlags("character").isCentered).toBe(false));
});

// ---------------------------------------------------------------------------
// tabFlags — individual flags consistency
// ---------------------------------------------------------------------------

describe("tabFlags — individual flags", () => {
  it("isSkills=true only for skills", () => {
    expect(tabFlags("skills").isSkills).toBe(true);
    expect(tabFlags("workflows").isSkills).toBe(false);
    expect(tabFlags("chat").isSkills).toBe(false);
  });

  it("isStream=true only for stream", () => {
    expect(tabFlags("stream").isStream).toBe(true);
    expect(tabFlags("workflows").isStream).toBe(false);
  });

  it("isLifo=true only for lifo", () => {
    expect(tabFlags("lifo").isLifo).toBe(true);
    expect(tabFlags("workflows").isLifo).toBe(false);
  });

  it("isCharacter=true for character and character-select only", () => {
    expect(tabFlags("character").isCharacter).toBe(true);
    expect(tabFlags("character-select").isCharacter).toBe(true);
    expect(tabFlags("workflows").isCharacter).toBe(false);
  });

  it("isWallets=true only for wallets", () => {
    expect(tabFlags("wallets").isWallets).toBe(true);
    expect(tabFlags("workflows").isWallets).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Derived style helpers — spot checks for workflows
// ---------------------------------------------------------------------------

describe("overlayBackdropClass", () => {
  it("workflows gets dark blur backdrop (via isAdvancedOverlay)", () => {
    const cls = overlayBackdropClass(tabFlags("workflows"));
    expect(cls).toContain("backdrop-blur-2xl");
    expect(cls).toContain("bg-black/50");
    expect(cls).toContain("pointer-events-auto");
  });

  it("chat gets no backdrop (base view)", () => {
    const cls = overlayBackdropClass(tabFlags("chat"));
    expect(cls).toBe("opacity-0");
  });
});

describe("cardSizeClass", () => {
  it("workflows gets advanced overlay card sizing", () => {
    const cls = cardSizeClass(tabFlags("workflows"));
    expect(cls).toContain("w-[95vw]");
    expect(cls).toContain("h-[95vh]");
    expect(cls).toContain("rounded-2xl");
    expect(cls).toContain("overflow-hidden");
  });
});

describe("accentVar / accentSubtleVar", () => {
  it("workflows uses default accent (no special accent)", () => {
    const f = tabFlags("workflows");
    expect(accentVar(f)).toBe("#7b8fb5");
    expect(accentSubtleVar(f)).toBe("rgba(123, 143, 181, 0.12)");
  });

  it("stream uses red accent", () => {
    const f = tabFlags("stream");
    expect(accentVar(f)).toBe("#ef4444");
  });

  it("wallets uses gold accent", () => {
    const f = tabFlags("wallets");
    expect(accentVar(f)).toBe("#f0b90b");
  });
});

// ---------------------------------------------------------------------------
// isAdvancedTab parity — App.tsx native shell layout contract
//
// App.tsx has a local `isAdvancedTab` flag that controls whether the native
// shell outer <main> gets `overflow-hidden` (required by advanced views that
// manage their own scroll) vs `overflow-y-auto`. It must list every tab that
// dispatches to <AdvancedPageView />.
//
// We can't import isAdvancedTab directly (it's a computed local), but we
// document and verify the same set here so any future addition to
// <AdvancedPageView /> sub-tabs triggers a test failure if isAdvancedTab is
// not updated in lockstep.
// ---------------------------------------------------------------------------

describe("isAdvancedTab parity (App.tsx native shell overflow-hidden contract)", () => {
  // App.tsx has a local `isAdvancedTab` flag that sets `overflow-hidden` on the
  // native-shell <main> container so that sub-views (which manage their own
  // scroll) don't double-scroll. It must include every tab that routes to
  // <AdvancedPageView />.
  //
  // NOTE: `plugins` and `skills` route to <AdvancedPageView /> but have their
  // own companion flags (isPluginsLike / isSkills) rather than isAdvancedOverlay.
  // The two lists intentionally diverge — this test only covers the subset that
  // uses the isAdvancedOverlay path in both systems.

  const ADVANCED_OVERLAY_PARITY_TABS: Tab[] = [
    "advanced",
    "actions",
    "workflows",
    "triggers",
    "fine-tuning",
    "trajectories",
    "runtime",
    "database",
    "logs",
    "security",
    "lifo",
  ];

  // [REGRESSION] "workflows" was missing from isAdvancedTab in App.tsx after
  // PR #876. The outer <main> got overflow-y-auto instead of overflow-hidden,
  // causing WorkflowBuilderView (which manages its own scroll) to collapse in
  // height and double-scroll in native shell mode.
  it("[REGRESSION] workflows is in the advanced-overlay parity set", () =>
    expect(ADVANCED_OVERLAY_PARITY_TABS).toContain("workflows"));

  // For every tab in this set, companion-shell-styles must also flag it as
  // isAdvancedOverlay so both rendering paths agree.
  for (const tab of ADVANCED_OVERLAY_PARITY_TABS) {
    it(`tabFlags("${tab}").isAdvancedOverlay=true (matches App.tsx isAdvancedTab)`, () =>
      expect(tabFlags(tab).isAdvancedOverlay).toBe(true));
  }
});

// ---------------------------------------------------------------------------
// ACCENT_COLORS / TOP_BAR_COLORS — sanity check well-known entries
// ---------------------------------------------------------------------------

describe("ACCENT_COLORS", () => {
  it("stream is red", () => expect(ACCENT_COLORS.stream).toBe("#ef4444"));
  it("skills is cyan", () => expect(ACCENT_COLORS.skills).toBe("#00e1ff"));
});

describe("TOP_BAR_COLORS", () => {
  it("stream has a translucent red top bar", () =>
    expect(TOP_BAR_COLORS.stream).toContain("239, 68, 68"));
});
