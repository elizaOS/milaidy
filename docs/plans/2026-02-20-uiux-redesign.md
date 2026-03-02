# Milaidy UI/UX Redesign — Design Document

**Date:** 2026-02-20
**Status:** Approved
**Scope:** Full redesign of navigation, chat, companion ("Her"), onboarding, and mobile responsiveness

---

## Design Principles

1. **Agent first** — Chat is the soul of the app. Every screen either supports or returns the user to the conversation.
2. **She is a person, not a module** — The companion is framed as a relationship, not a stats dashboard.
3. **Crypto-native power user** — The UI respects technical depth but doesn't surface it by default. Advanced tools are one level deeper, always available but never in the way.
4. **Mobile is a first-class citizen** — The app must work well as a responsive web app today, and the architecture must be native-app-ready for tomorrow.
5. **3D avatar is a desktop luxury** — Mobile uses static preview images. WebGL on mobile is a liability (battery, heat, load time), not a feature.

---

## Target User

Crypto-native power user who also wants an AI companion experience. The crypto/power-user tooling (wallets, plugins, triggers, runtime) is important but secondary. The companion relationship is the emotional hook that differentiates this app.

---

## Platform Strategy

| Platform | Now | Future |
|----------|-----|--------|
| Desktop (Electron) | Full 3D VRM, full nav, wide layout | Same |
| Mobile web | Responsive layout, bottom tab bar, static avatar preview | Same |
| Native app (iOS/Android) | — | React Native / Capacitor, same information architecture |

The information architecture (IA) and component responsibilities designed here must be compatible with a future native app. Bottom tab bar navigation on mobile web maps directly to UITabBarController / BottomNavigationView in native.

---

## 1. Information Architecture

### Current Problems
- 9 flat, equal-weight tabs — no visual hierarchy, reads like a dev tool
- "Advanced" hides 10 sub-routes behind a second navigation layer
- Companion/Character/Chat sit alongside Runtime/Database as if equally important

### New Three-Layer IA

```
LAYER 1 — Core Experience (always visible, primary nav)
  💬 Chat     🌸 Her      💰 Wallets    ⋯ More

LAYER 2 — Utility Tools (inside More)
  Character · Knowledge · Social · Apps · Settings

LAYER 3 — Developer Tools (inside Advanced dropdown)
  Plugins · Skills · Actions · Triggers · Fine-Tuning ·
  Trajectories · Runtime · Database · Logs
```

### Tab Renames
| Old | New | Reason |
|-----|-----|--------|
| `Companion` | `Her` | She is a person, not a system module |
| `Advanced` | `⚙ Advanced ▾` (dropdown) | Exposes all 10 sub-routes directly, no second navigation |
| `Social` | `Social` (kept) | Label kept but moved to More |

### Desktop Nav Component

Two-tier horizontal nav bar:
- **Left group (primary):** `💬 Chat` `🌸 Her` `💰 Wallets` — large, icons + labels, active accent underline
- **Right group (secondary):** `Character` `Knowledge` `Social` `Apps` `Settings` `⚙ Advanced ▾` — smaller text, muted, no icons
- Advanced is a dropdown menu that lists all 10 sub-routes directly on click

### Mobile Nav Component

Bottom tab bar, fixed to viewport bottom:
```
💬 Chat   🌸 Her   💰 Wallets   ⋯ More
```
- 4 tabs only, icons + labels
- `More` opens a bottom sheet listing Layer 2 + Layer 3 items
- Tab bar auto-hides when the soft keyboard is visible (chat input focused)

---

## 2. Chat View

### Core Principle
Text-first. The avatar is a presence indicator — it reminds you there is someone on the other side — but it does not dominate the layout. 3D VRM does **not** run inside Chat on any platform.

### Desktop Layout (≥ 1200px)

Three-column layout:
```
┌──────────────┬──────────────────────────────────┬───────────────┐
│ Conversations│                                  │               │
│   sidebar    │  ┌──────────────────────────┐   │  Presence     │
│   (240px,    │  │ [avatar 32px] 她的名字   │   │  Panel        │
│   collapsible│  │ New Friend · ✨ Happy    │   │  (220px)      │
│   )          │  └──────────────────────────┘   │               │
│              │                                  │               │
│              │   message history (scrollable)   │               │
│              │                                  │               │
│              ├──────────────────────────────────┤               │
│              │  [🎤] [textarea, auto-expand]    │               │
│              │                        [Send]    │               │
└──────────────┴──────────────────────────────────┴───────────────┘
```

**Chat header (sticky, inside main column):**
- Left: small circular avatar image (32px, static VRM preview)
- Center: agent name (her name) — prominent
- Right: relationship stage chip + Day N badge (e.g. "New Friend · Day 3")
- Online indicator dot

**Presence Panel (right, 220px):**
- Static VRM preview image (medium, ~160px tall) — NOT a 3D canvas
- Mood chip: `✨ Happy · Streak 3d`
- Relationship stage: "New Friend"
- Three quick-action icon buttons: 🍡 Feed / 😴 Rest / 📢 Share (with cooldown state)
- "⚙ Autonomous Loop" collapse — shows agent workflow state for power users, collapsed by default

> **Decision: No 3D WebGL in Chat.** The right panel uses a static preview image + mood chip. The 3D VRM stage lives exclusively in the Her tab. This keeps Chat fast, lightweight, and mobile-compatible.

### Tablet Layout (768–1200px)

- Conversation sidebar collapses to a `☰` drawer (left swipe or icon in header)
- Right Presence Panel disappears — mood chip and avatar compress into the chat header bar
- Single-column full-width chat

### Mobile Layout (< 768px)

```
┌────────────────────────────────────────┐
│  ☰  [avatar 32px]  她的名字            │  ← top bar (native-style)
│                    New Friend · ✨     │
├────────────────────────────────────────┤
│                                        │
│   message history                      │
│   (fills remaining height)             │
│                                        │
├────────────────────────────────────────┤
│  [🎤]  [textarea]              [Send]  │  ← fixed input row
├────────────────────────────────────────┤
│  💬 Chat  🌸 Her  💰 Wallets  ⋯ More  │  ← bottom tab bar
└────────────────────────────────────────┘
```

- Top bar pattern mirrors native iOS/Android chat apps (WhatsApp / iMessage pattern)
- Tapping avatar or name opens a compact "Her profile" sheet (relationship stage, mood, care actions)
- Keyboard open: bottom tab bar hides, input row sticks to keyboard top
- Voice input: mic button replaces textarea with live transcript view (current behavior kept)

### Removed from Chat
- AutonomousPanel's "Autonomous Loop" section is no longer the primary frame for the right panel. Agent workflow (todos, tasks, triggers) moves to an "Agent" sub-section accessible via ⋯ or collapsed in the Presence Panel.
- No 3D WebGL canvas in Chat on any platform.

---

## 3. Her View (formerly Companion)

### Core Principle
This is the relationship page — where the user checks in, cares for her, and sees how she's doing. It should feel intimate and warm, not like a monitoring dashboard. Raw numbers are hidden by default.

### Desktop / Tablet Layout

```
┌─────────────────────────────────────────────────────────────────┐
│              New Friend  ·  Day 3 together  ·  🔥 Streak 2d     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│              ┌──────────────────────────────────┐               │
│              │                                  │               │
│              │     3D VRM Avatar                │               │
│              │     (desktop only, ~55% height)  │               │
│              │                                  │               │
│              └──────────────────────────────────┘               │
│                                                                  │
│         "She's happy today ✨"        [💬 Chat with her →]      │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  Care                                                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ 🍡 Feed her     │  │ 😴 Let her rest  │  │ 📢 Share        │  │
│  │ She's hungry    │  │ Tired · 4h left  │  │ 0 / 3 today     │  │
│  │ [Feed]          │  │ [on cooldown]    │  │ [Share]         │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│  [▾ Stats]  Mood 74 · Hunger 23 · Energy 61 · Level 2          │  ← collapsed by default
├──────────────────────────────────────────────────────────────────┤
│  [▾ Autopost]                                                    │  ← collapsed by default
└─────────────────────────────────────────────────────────────────┘
```

**Key changes from current Companion view:**
- "Companion Console" header removed — replaced by relationship stage + day count as page title
- "Control Hub" button and side drawer removed — autopost settings become a collapsible section
- "Character Roster" (avatar switcher) removed from this page — moved to **Settings → Appearance**
- KPI stat cards (Mood: 74, Hunger: 52...) hidden by default behind `[▾ Stats]` collapse
- Care actions reframed as full-width cards with human-language descriptions, not icon buttons
- Primary CTA on the page is `[💬 Chat with her →]` — drives the user back to the core experience
- "Social" stat renamed or removed — it currently shows chat count which is semantically confusing

### Mobile Layout (< 768px)

```
┌────────────────────────────────────────┐
│  New Friend · Day 3 · 🔥 2d            │  ← top bar
├────────────────────────────────────────┤
│                                        │
│   [static preview image, ~40% height] │  ← NO 3D on mobile
│                                        │
│   "She's happy today ✨"               │
│   [💬 Chat with her]                   │
├────────────────────────────────────────┤
│  Care                                  │
│  [🍡 Feed]   [😴 Rest]   [📢 Share]   │
├────────────────────────────────────────┤
│  [▾ Stats]   [▾ Autopost]             │
├────────────────────────────────────────┤
│  💬 Chat  🌸 Her  💰 Wallets  ⋯ More  │
└────────────────────────────────────────┘
```

**Mobile-specific decisions:**
- Static VRM preview image replaces 3D canvas entirely on mobile
- Image is the selected avatar's preview thumbnail (already exists: `getVrmPreviewUrl`)
- Care actions are horizontal button row (3 equal-width buttons), not cards
- Stats and Autopost are both collapsed by default — tap to expand

---

## 4. Onboarding Redesign

### Core Principle
Front-load personality and emotional connection. Back-load technical configuration. A new user should be talking to her within 2 minutes on the quick path.

### Quick Setup (5 steps — default)

| Step | Screen | What user does |
|------|--------|----------------|
| 1 | **Her name** | Pick from 5 preset pills or type custom |
| 2 | **Your name** | Pick from 5 preset pills or type custom. Skippable. |
| 3 | **Her look** | Avatar grid (static preview thumbnails) |
| 4 | **Her vibe** | Style personality cards (2–3 options) |
| 5 | **AI power** | ☁️ Eliza Cloud (recommended, 1-click) · 🔑 I have an API key (expands input) · 🔧 Advanced setup |

After Step 5: → directly enters Chat. No theme picker in onboarding (set it later in Settings). No model picker (defaults silently to recommended). No permissions prompt (requested contextually on first use).

### Advanced Setup (appended after Step 5 if user chose "🔧 Advanced setup")

Steps 6–10 (approximately, depending on choices):
- Run mode (Cloud / Local Sandbox / Local Raw)
- Model selection — with recommended labels on each option
- Connectors (Telegram / Discord — both optional, skippable)
- Permissions

### Progress Bar
- Shows `Step 3 of 5` or `Step 7 of 10` — total is known immediately after path is chosen
- No "Step X of ?" states
- Quick path shows 5 dots; Advanced path shows 10 dots; dots before the current one are filled

### Removed from Onboarding
- Theme selection — moved to Settings → Appearance (can always be changed)
- OAuth callback URL copy-paste — replaced with a hosted redirect that auto-closes
- CLI instruction copy-paste (Anthropic setup-token) — replaced with a help link
- modelSelection step in Quick path — defaults applied silently

---

## 5. Responsive Breakpoints

| Breakpoint | Layout | Nav | Avatar in Chat | Avatar in Her |
|------------|--------|-----|----------------|---------------|
| ≥ 1200px (desktop) | 3-column chat | Top horizontal 2-tier | Static image in right panel | 3D VRM canvas |
| 768–1200px (tablet) | 1-column chat + drawer | Top horizontal (compact) | 32px in header bar | 3D VRM canvas |
| < 768px (mobile) | 1-column chat | Bottom tab bar | 32px in top bar | Static preview image |

---

## 6. Native App Readiness

The following design decisions ensure compatibility with a future React Native / Capacitor native build:

- **Bottom tab bar** on mobile web maps 1:1 to native tab navigation
- **Top bar pattern** in Chat (avatar + name + mood) matches native chat app conventions
- **No WebGL on mobile** — static images are universally supported natively
- **Sheet / drawer patterns** (Conversation list, More menu, Stats collapse) map to native bottom sheets and navigation drawers
- **Care action buttons** are simple tap targets, no hover states required
- Push notification hooks: companion proactive messages (morning greeting, absence return) already fire — native notifications are the delivery mechanism to add

---

## 7. Implementation Priority

| Priority | Change | Complexity |
|----------|--------|------------|
| P0 | Bottom tab bar for mobile (responsive, CSS + nav logic) | Medium |
| P0 | Chat top bar with avatar + name + mood chip | Small |
| P1 | Nav restructure: 4 primary + secondary group + Advanced dropdown | Medium |
| P1 | Her page reframe: Care cards + collapsed Stats + collapsed Autopost | Medium |
| P1 | Remove 3D canvas from Chat, replace right panel with static image + mood | Medium |
| P2 | Onboarding 5-step Quick path | Large |
| P2 | Advanced tab → dropdown menu | Small |
| P3 | Mobile Her page: static preview image instead of 3D VRM | Small |
| P3 | Tablet layout (collapsible sidebar + compressed header) | Medium |
