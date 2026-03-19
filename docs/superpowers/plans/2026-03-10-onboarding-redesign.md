# Onboarding Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current form-based onboarding wizard with a game-inspired three-column layout featuring live VRM model, step navigation with animations, and glassmorphism content panels.

**Architecture:** New `OnboardingWizard` component renders a 3-column CSS grid (step nav | VRM canvas | content panel). Reuses existing VRM engine (`VrmStage`), simplifies the step flow from 11 steps to 6, and moves advanced config to post-onboarding Settings. All state management stays in `AppContext` via `useApp()`.

**Tech Stack:** React, Three.js/@pixiv/three-vrm (existing VrmStage), Tailwind CSS + custom onboarding CSS, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-03-10-onboarding-redesign-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `apps/app/src/styles/onboarding-game.css` | All game-style onboarding CSS (layout, glass panels, animations, step nav) |
| `apps/app/src/components/onboarding/OnboardingStepNav.tsx` | Left column — vertical diamond step navigation with progress line |
| `apps/app/src/components/onboarding/OnboardingPanel.tsx` | Right column — glassmorphism panel wrapper with entry animation |
| `apps/app/src/components/onboarding/WakeUpStep.tsx` | Step 1 — activation screen |
| `apps/app/src/components/onboarding/ConnectionStep.tsx` | Step 4 — LLM provider selection + config (merges LlmProviderStep logic) |
| `apps/app/src/components/onboarding/ActivateStep.tsx` | Step 6 — completion celebration |

### Modified Files
| File | Change |
|------|--------|
| `packages/app-core/src/state/types.ts` | Update `OnboardingStep` type to 6 new steps |
| `apps/app/src/components/OnboardingWizard.tsx` | Complete rewrite — 3-column grid with VRM |
| `apps/app/src/components/onboarding/LanguageStep.tsx` | Rewrite for new panel design (pill buttons) |
| `apps/app/src/components/onboarding/PermissionsStep.tsx` | Rewrite for new panel design (permission cards) |
| `apps/app/src/AppContext.tsx` | Simplify `handleOnboardingNext/Back` for 6-step linear flow |
| `apps/app/src/styles.css` | Add `@import "./styles/onboarding-game.css"` |
| `apps/app/test/app/onboarding-language.test.tsx` | Update for new step names |
| `apps/app/test/app/startup-onboarding.e2e.test.ts` | Update for new 6-step flow |

### Removed / Deprecated
| File | Reason |
|------|--------|
| `apps/app/src/components/onboarding/SetupModeStep.tsx` | No longer needed — no quick/advanced split |
| `apps/app/src/components/onboarding/RunModeStep.tsx` | Moved to post-onboarding Settings |
| `apps/app/src/components/onboarding/CloudProviderStep.tsx` | Moved to post-onboarding Settings |
| `apps/app/src/components/onboarding/ModelSelectionStep.tsx` | Moved to post-onboarding Settings |
| `apps/app/src/components/onboarding/CloudLoginStep.tsx` | Moved to post-onboarding Settings |
| `apps/app/src/components/onboarding/InventorySetupStep.tsx` | Moved to post-onboarding Settings |
| `apps/app/src/components/onboarding/ConnectorsStep.tsx` | Moved to post-onboarding Settings |
| `apps/app/src/components/onboarding/OnboardingVrmAvatar.tsx` | Replaced by VrmStage in center column |

---

## Chunk 1: Foundation — Types, CSS, and Shell Components

### Task 1: Update OnboardingStep type

**Files:**
- Modify: `packages/app-core/src/state/types.ts:62-75`

- [ ] **Step 1: Update the OnboardingStep type**

Replace the existing type at lines 62-75:

```typescript
export type OnboardingStep =
  | "wakeUp"
  | "language"
  | "identity"
  | "connection"
  | "senses"
  | "activate";
```

- [ ] **Step 2: Add new onboarding step metadata type**

Below the OnboardingStep type, add:

```typescript
export interface OnboardingStepMeta {
  id: OnboardingStep;
  name: string;
  subtitle: string;
}

export const ONBOARDING_STEPS: OnboardingStepMeta[] = [
  { id: "wakeUp", name: "Wake Up", subtitle: "Activation" },
  { id: "language", name: "Language", subtitle: "Communication" },
  { id: "identity", name: "Identity", subtitle: "Designation" },
  { id: "connection", name: "Connection", subtitle: "Neural Link" },
  { id: "senses", name: "Senses", subtitle: "Permissions" },
  { id: "activate", name: "Activate", subtitle: "Complete" },
];
```

- [ ] **Step 3: Update default onboardingStep in state**

Find where the default `onboardingStep` is set (in `types.ts` or the state initializer) and change from `"welcome"` to `"wakeUp"`.

- [ ] **Step 4: Remove onboardingSetupMode field**

The `onboardingSetupMode` field in AppState is no longer needed since there's no quick/advanced split. Remove:
```
onboardingSetupMode: "" | "quick" | "advanced"
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project apps/app/tsconfig.json 2>&1 | head -30`

This will show type errors in files that reference old step names — that's expected and will be fixed in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add packages/app-core/src/state/types.ts
git commit -m "refactor: update OnboardingStep type to 6-step game flow"
```

---

### Task 2: Create onboarding game CSS

**Files:**
- Create: `apps/app/src/styles/onboarding-game.css`
- Modify: `apps/app/src/styles.css`

- [ ] **Step 1: Create the CSS file**

Create `apps/app/src/styles/onboarding-game.css` with all game-style onboarding styles. Reference the mockup at `.superpowers/brainstorm/27892-1773148199/layout-animated.html` for exact values.

Key classes to define:
- `.onboarding-screen` — root grid container (3-column)
- `.onboarding-bg` — background image layer (blur + overlay + drift animation)
- `.onboarding-corner` — decorative corner SVG markers
- `.onboarding-left` — left panel positioning
- `.onboarding-step-list` — vertical step list with connecting line
- `.onboarding-step-item`, `.onboarding-step-item--done`, `.onboarding-step-item--active` — step states
- `.onboarding-step-dot` — diamond dot with pulse animation
- `.onboarding-center` — center VRM panel
- `.onboarding-right` — right panel positioning
- `.onboarding-panel` — glassmorphism panel with entry animation
- `.onboarding-panel-enter` — slide-from-right animation
- `.onboarding-content-stagger` — staggered children fade-in
- `.onboarding-divider` — diamond ornament divider
- `.onboarding-section-title` — uppercase label
- `.onboarding-question` — large question text
- `.onboarding-input` — game-style text input
- `.onboarding-pill` / `.onboarding-pill--selected` — horizontal option buttons
- `.onboarding-confirm-btn` — confirm button with ripple
- `.onboarding-back-link` — back navigation

Animations:
- `@keyframes onboarding-bg-drift` (30s background parallax)
- `@keyframes onboarding-dot-pulse` (2s step dot breathing)
- `@keyframes onboarding-panel-enter` (0.6s slide-in-from-right)
- `@keyframes onboarding-content-fade-in` (0.5s staggered children)
- `@keyframes onboarding-corner-breathe` (4s opacity breathing)
- `@keyframes onboarding-ripple` (0.6s button ripple)

Responsive breakpoint `@media (max-width: 768px)`:
- Switch to single column
- Left nav becomes horizontal top bar
- VRM gets reduced height
- Panel takes full width

```css
/* === Onboarding Game Screen === */
.onboarding-screen {
  width: 100vw;
  height: 100vh;
  display: grid;
  grid-template-columns: 220px 1fr 400px;
  position: relative;
  overflow: hidden;
  background: #0c0e14;
}

/* Background */
.onboarding-bg {
  position: absolute;
  inset: -20px;
  background-size: cover;
  background-position: center;
  filter: blur(6px);
  z-index: 0;
  animation: onboarding-bg-drift 30s ease-in-out infinite alternate;
}
.onboarding-bg-overlay {
  position: absolute;
  inset: 0;
  background: rgba(8, 10, 16, 0.45);
  z-index: 1;
}

@keyframes onboarding-bg-drift {
  0%   { transform: scale(1.08) translate(0, 0); }
  50%  { transform: scale(1.10) translate(-8px, 4px); }
  100% { transform: scale(1.08) translate(4px, -3px); }
}

/* ... (full CSS from mockup — see layout-animated.html for exact values) */

@media (max-width: 768px) {
  .onboarding-screen {
    grid-template-columns: 1fr;
    grid-template-rows: auto 200px 1fr;
  }
  .onboarding-left {
    flex-direction: row;
    justify-content: center;
    padding: 16px;
  }
  .onboarding-step-list {
    flex-direction: row;
    gap: 16px;
  }
  .onboarding-step-list::before { display: none; }
  .onboarding-step-name { display: none; }
  .onboarding-step-sub { display: none; }
}
```

- [ ] **Step 2: Import in main styles**

In `apps/app/src/styles.css`, add after existing imports:

```css
@import "./styles/onboarding-game.css";
```

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/styles/onboarding-game.css apps/app/src/styles.css
git commit -m "feat: add game-style onboarding CSS with animations"
```

---

### Task 3: Create OnboardingStepNav component

**Files:**
- Create: `apps/app/src/components/onboarding/OnboardingStepNav.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { ONBOARDING_STEPS, type OnboardingStep } from "@elizaos/app-core/state/types";
import { useApp } from "../../AppContext";

export function OnboardingStepNav() {
  const { onboardingStep } = useApp();

  const currentIndex = ONBOARDING_STEPS.findIndex((s) => s.id === onboardingStep);

  return (
    <div className="onboarding-left">
      <div className={`onboarding-step-list step-${currentIndex}`}>
        {ONBOARDING_STEPS.map((step, i) => {
          let state = "";
          if (i < currentIndex) state = "onboarding-step-item--done";
          else if (i === currentIndex) state = "onboarding-step-item--active";

          return (
            <div key={step.id} className={`onboarding-step-item ${state}`}>
              <div className="onboarding-step-dot" />
              <div className="onboarding-step-info">
                <span className="onboarding-step-name">{step.name}</span>
                <span className="onboarding-step-sub">{step.subtitle}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/components/onboarding/OnboardingStepNav.tsx
git commit -m "feat: add OnboardingStepNav component"
```

---

### Task 4: Create OnboardingPanel wrapper component

**Files:**
- Create: `apps/app/src/components/onboarding/OnboardingPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { type ReactNode, useRef, useEffect } from "react";
import { type OnboardingStep } from "@elizaos/app-core/state/types";

interface OnboardingPanelProps {
  step: OnboardingStep;
  children: ReactNode;
}

export function OnboardingPanel({ step, children }: OnboardingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevStepRef = useRef(step);

  // Re-trigger entry animation on step change
  useEffect(() => {
    if (prevStepRef.current !== step && panelRef.current) {
      const panel = panelRef.current;
      panel.style.animation = "none";
      // Force reflow
      void panel.offsetHeight;
      panel.style.animation = "";

      // Re-trigger children stagger
      panel.querySelectorAll<HTMLElement>(":scope > *").forEach((child) => {
        child.style.animation = "none";
        void child.offsetHeight;
        child.style.animation = "";
      });
    }
    prevStepRef.current = step;
  }, [step]);

  return (
    <div className="onboarding-right">
      <div className="onboarding-panel" ref={panelRef}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/components/onboarding/OnboardingPanel.tsx
git commit -m "feat: add OnboardingPanel glassmorphism wrapper"
```

---

### Task 5: Rewrite OnboardingWizard shell

**Files:**
- Modify: `apps/app/src/components/OnboardingWizard.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file. The new wizard renders the 3-column layout with VRM in the center. It imports VrmStage for the 3D model and delegates to step components for the right panel content.

```tsx
import { useApp } from "../AppContext";
import { getVrmUrl, getVrmPreviewUrl, getVrmBackgroundUrl } from "@elizaos/app-core/state/vrm";
import { VrmStage } from "./companion/VrmStage";
import { OnboardingStepNav } from "./onboarding/OnboardingStepNav";
import { OnboardingPanel } from "./onboarding/OnboardingPanel";
import { WakeUpStep } from "./onboarding/WakeUpStep";
import { LanguageStep } from "./onboarding/LanguageStep";
import { IdentityStep } from "./onboarding/IdentityStep";
import { ConnectionStep } from "./onboarding/ConnectionStep";
import { PermissionsStep } from "./onboarding/PermissionsStep";
import { ActivateStep } from "./onboarding/ActivateStep";

export function OnboardingWizard() {
  const { onboardingStep, onboardingAvatar, customVrmUrl, t } = useApp();

  const vrmPath = customVrmUrl || getVrmUrl(onboardingAvatar);
  const fallbackPreview = getVrmPreviewUrl(onboardingAvatar);
  const bgUrl = getVrmBackgroundUrl(onboardingAvatar);

  function renderStep() {
    switch (onboardingStep) {
      case "wakeUp":
        return <WakeUpStep />;
      case "language":
        return <LanguageStep />;
      case "identity":
        return <IdentityStep />;
      case "connection":
        return <ConnectionStep />;
      case "senses":
        return <PermissionsStep />;
      case "activate":
        return <ActivateStep />;
      default:
        return null;
    }
  }

  return (
    <div className="onboarding-screen">
      {/* Background */}
      <div className="onboarding-bg" style={{ backgroundImage: `url(${bgUrl})` }} />
      <div className="onboarding-bg-overlay" />

      {/* Corner decorations */}
      <svg className="onboarding-corner onboarding-corner--tl" viewBox="0 0 36 36" fill="none" stroke="rgba(240,185,11,0.18)" strokeWidth="1">
        <path d="M0 18 L0 0 L18 0" />
        <circle cx="0" cy="0" r="2" fill="rgba(240,185,11,0.25)" stroke="none" />
      </svg>
      <svg className="onboarding-corner onboarding-corner--tr" viewBox="0 0 36 36" fill="none" stroke="rgba(240,185,11,0.18)" strokeWidth="1">
        <path d="M0 18 L0 0 L18 0" />
        <circle cx="0" cy="0" r="2" fill="rgba(240,185,11,0.25)" stroke="none" />
      </svg>
      <svg className="onboarding-corner onboarding-corner--bl" viewBox="0 0 36 36" fill="none" stroke="rgba(240,185,11,0.18)" strokeWidth="1">
        <path d="M0 18 L0 0 L18 0" />
        <circle cx="0" cy="0" r="2" fill="rgba(240,185,11,0.25)" stroke="none" />
      </svg>
      <svg className="onboarding-corner onboarding-corner--br" viewBox="0 0 36 36" fill="none" stroke="rgba(240,185,11,0.18)" strokeWidth="1">
        <path d="M0 18 L0 0 L18 0" />
        <circle cx="0" cy="0" r="2" fill="rgba(240,185,11,0.25)" stroke="none" />
      </svg>

      {/* Left: Step Navigation */}
      <OnboardingStepNav />

      {/* Center: VRM Model */}
      <div className="onboarding-center">
        <VrmStage
          vrmPath={vrmPath}
          fallbackPreviewUrl={fallbackPreview}
          needsFlip={false}
          cameraProfile="companion"
          t={t}
        />
      </div>

      {/* Right: Content Panel */}
      <OnboardingPanel step={onboardingStep}>
        {renderStep()}
      </OnboardingPanel>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/components/OnboardingWizard.tsx
git commit -m "feat: rewrite OnboardingWizard with 3-column game layout"
```

---

## Chunk 2: Step Components

### Task 6: Create WakeUpStep

**Files:**
- Create: `apps/app/src/components/onboarding/WakeUpStep.tsx`

- [ ] **Step 1: Write the component**

Port the import/restore functionality from old `WelcomeStep.tsx`. The panel shows "elizaOS" title + activate button + optional import link.

```tsx
import { useState } from "react";
import { useApp } from "../../AppContext";

export function WakeUpStep() {
  const { handleOnboardingNext, t } = useApp();
  const [showImport, setShowImport] = useState(false);
  // Port the import logic from old WelcomeStep.tsx (file upload, password, etc.)

  return (
    <>
      <div className="onboarding-section-title">Initialization</div>
      <div className="onboarding-divider"><div className="onboarding-divider-diamond" /></div>

      <h1 className="onboarding-question" style={{ fontSize: "32px", fontWeight: 400 }}>
        elizaOS
      </h1>
      <p className="onboarding-desc">
        {t("onboardingwizard.experienceTheNextG") || "Experience the next generation of autonomous orchestration."}
      </p>

      <div className="onboarding-panel-footer">
        <button
          className="onboarding-back-link"
          onClick={() => setShowImport(true)}
          type="button"
        >
          {t("onboardingwizard.restoreFromBackup") || "Restore from Backup"}
        </button>
        <button
          className="onboarding-confirm-btn"
          onClick={() => handleOnboardingNext()}
          type="button"
        >
          Activate
        </button>
      </div>

      {/* Import dialog — port from old WelcomeStep.tsx */}
      {showImport && (
        <div>{/* Import UI from old WelcomeStep */}</div>
      )}
    </>
  );
}
```

Ensure the import agent dialog is ported from `WelcomeStep.tsx` lines 40-170 (file upload, password input, decrypt logic).

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/components/onboarding/WakeUpStep.tsx
git commit -m "feat: add WakeUpStep component"
```

---

### Task 7: Create IdentityStep (rename from name input)

**Files:**
- Create: `apps/app/src/components/onboarding/IdentityStep.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useApp } from "../../AppContext";

export function IdentityStep() {
  const { onboardingName, handleOnboardingNext, handleOnboardingBack, setState, t } = useApp();

  return (
    <>
      <div className="onboarding-section-title">
        {t("onboarding.identityTitle") || "Designation"}
      </div>
      <div className="onboarding-divider"><div className="onboarding-divider-diamond" /></div>
      <div className="onboarding-question">
        {t("onboarding.identityQuestion") || "What should I be called?"}
      </div>
      <input
        className="onboarding-input"
        type="text"
        placeholder={t("onboarding.enterAgentName") || "Enter agent name..."}
        value={onboardingName}
        onChange={(e) => setState("onboardingName", e.target.value)}
        autoFocus
      />
      <p className="onboarding-desc">
        {t("onboarding.identityDesc") || "Choose a name for your AI companion. You can change this later in settings."}
      </p>
      <div className="onboarding-panel-footer">
        <button className="onboarding-back-link" onClick={handleOnboardingBack} type="button">
          ← Back
        </button>
        <button
          className="onboarding-confirm-btn"
          onClick={() => handleOnboardingNext()}
          disabled={!onboardingName.trim()}
          type="button"
        >
          Confirm
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/components/onboarding/IdentityStep.tsx
git commit -m "feat: add IdentityStep component"
```

---

### Task 8: Rewrite LanguageStep for panel design

**Files:**
- Modify: `apps/app/src/components/onboarding/LanguageStep.tsx`

- [ ] **Step 1: Rewrite with pill buttons**

Replace the file content. Use pill-style horizontal buttons instead of the old grid cards. Keep the same language list and auto-advance behavior.

```tsx
import { useApp } from "../../AppContext";
import { normalizedLanguage } from "@elizaos/app-core";

const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "zh-CN", label: "中文" },
  { id: "ko", label: "한국어" },
  { id: "es", label: "Español" },
  { id: "pt", label: "Português" },
];

export function LanguageStep() {
  const { uiLanguage, handleOnboardingNext, handleOnboardingBack, setState, t } = useApp();

  function selectLanguage(langId: string) {
    setState("uiLanguage", normalizedLanguage(langId));
    handleOnboardingNext();
  }

  return (
    <>
      <div className="onboarding-section-title">
        {t("onboarding.languageTitle") || "Language"}
      </div>
      <div className="onboarding-divider"><div className="onboarding-divider-diamond" /></div>
      <div className="onboarding-question">
        {t("onboarding.languageQuestion") || "What language should I speak?"}
      </div>
      <div className="onboarding-pill-row">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.id}
            className={`onboarding-pill ${normalizedLanguage(lang.id) === uiLanguage ? "onboarding-pill--selected" : ""}`}
            onClick={() => selectLanguage(lang.id)}
            type="button"
          >
            {lang.label}
          </button>
        ))}
      </div>
      <div className="onboarding-panel-footer">
        <button className="onboarding-back-link" onClick={handleOnboardingBack} type="button">
          ← Back
        </button>
        <span />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/components/onboarding/LanguageStep.tsx
git commit -m "feat: rewrite LanguageStep with pill buttons"
```

---

### Task 9: Create ConnectionStep (LLM provider)

**Files:**
- Create: `apps/app/src/components/onboarding/ConnectionStep.tsx`

- [ ] **Step 1: Write the component**

This is the most complex step. It has two sub-screens:
- **Screen A**: Provider selection grid (reuse provider list from old `LlmProviderStep.tsx`)
- **Screen B**: Provider configuration (API key input, OAuth, etc.)

Port the core logic from `apps/app/src/components/onboarding/LlmProviderStep.tsx`. Key pieces to port:
- Provider list with logos and descriptions (lines ~30-80)
- Provider card rendering
- API key input with format validation
- OAuth flows for Claude Subscription and ChatGPT Subscription
- Milady Cloud login/API key tabs
- Ollama "no config needed" message

Adapt the layout to use `onboarding-*` CSS classes instead of Tailwind cards.

Structure:
```tsx
import { useState } from "react";
import { useApp } from "../../AppContext";

export function ConnectionStep() {
  const {
    onboardingProvider,
    onboardingApiKey,
    onboardingOptions,
    handleOnboardingNext,
    handleOnboardingBack,
    setState,
    t,
  } = useApp();

  const [showConfig, setShowConfig] = useState(!!onboardingProvider);

  if (!showConfig) {
    return <ProviderSelection onSelect={(id) => { setState("onboardingProvider", id); setShowConfig(true); }} />;
  }

  return <ProviderConfig onBack={() => { setState("onboardingProvider", ""); setState("onboardingApiKey", ""); setShowConfig(false); }} />;
}
```

Port provider-specific config UIs from `LlmProviderStep.tsx`. Keep the same state fields (`onboardingProvider`, `onboardingApiKey`, `onboardingSubscriptionTab`, `onboardingMiladyCloudTab`, etc.).

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/components/onboarding/ConnectionStep.tsx
git commit -m "feat: add ConnectionStep with provider selection and config"
```

---

### Task 10: Rewrite PermissionsStep for panel design

**Files:**
- Modify: `apps/app/src/components/onboarding/PermissionsStep.tsx`

- [ ] **Step 1: Rewrite with game panel layout**

Port the permission checking logic from `PermissionsSection.tsx` but render in the onboarding panel style. Show each permission as a row with name + status + grant button.

```tsx
import { useApp } from "../../AppContext";
import {
  REQUIRED_ONBOARDING_PERMISSION_IDS,
  hasRequiredOnboardingPermissions,
} from "../../onboarding-permissions";

export function PermissionsStep() {
  const { permissions, handleOnboardingNext, handleOnboardingBack, t } = useApp();

  const allGranted = hasRequiredOnboardingPermissions(permissions);

  return (
    <>
      <div className="onboarding-section-title">
        {t("onboarding.sensesTitle") || "Permissions"}
      </div>
      <div className="onboarding-divider"><div className="onboarding-divider-diamond" /></div>
      <div className="onboarding-question">
        {t("onboarding.sensesQuestion") || "Can I see and hear?"}
      </div>

      {/* Permission list — render each required permission */}
      <div className="onboarding-permission-list">
        {REQUIRED_ONBOARDING_PERMISSION_IDS.map((id) => {
          const status = permissions?.[id];
          const granted = status === "granted";
          return (
            <div key={id} className={`onboarding-permission-item ${granted ? "onboarding-permission-item--granted" : ""}`}>
              <span className="onboarding-permission-name">{id}</span>
              <span className="onboarding-permission-status">
                {granted ? "✓" : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="onboarding-panel-footer">
        <button className="onboarding-back-link" onClick={handleOnboardingBack} type="button">
          ← Back
        </button>
        {allGranted ? (
          <button className="onboarding-confirm-btn" onClick={() => handleOnboardingNext()} type="button">
            Continue
          </button>
        ) : (
          <>
            <button
              className="onboarding-back-link"
              onClick={() => handleOnboardingNext({ allowPermissionBypass: true })}
              type="button"
            >
              Skip for Now
            </button>
            <button className="onboarding-confirm-btn" onClick={() => {/* request all permissions */}} type="button">
              Allow All
            </button>
          </>
        )}
      </div>
    </>
  );
}
```

Integrate with the existing permission request system from `PermissionsSection.tsx` for the "Grant" / "Allow All" functionality.

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/components/onboarding/PermissionsStep.tsx
git commit -m "feat: rewrite PermissionsStep for game panel design"
```

---

### Task 11: Create ActivateStep

**Files:**
- Create: `apps/app/src/components/onboarding/ActivateStep.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useApp } from "../../AppContext";

export function ActivateStep() {
  const { onboardingName, handleOnboardingNext, t } = useApp();

  return (
    <>
      <div className="onboarding-section-title">
        {t("onboarding.activateTitle") || "Activation Complete"}
      </div>
      <div className="onboarding-divider"><div className="onboarding-divider-diamond" /></div>
      <div className="onboarding-question">
        {onboardingName || "Your companion"} {t("onboarding.activateReady") || "is ready."}
      </div>
      <p className="onboarding-desc">
        {t("onboarding.activateDesc") || "Your AI companion has been configured and is ready to go. You can adjust advanced settings anytime."}
      </p>
      <div className="onboarding-panel-footer">
        <span />
        <button
          className="onboarding-confirm-btn"
          onClick={() => handleOnboardingNext()}
          type="button"
        >
          Enter
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/components/onboarding/ActivateStep.tsx
git commit -m "feat: add ActivateStep completion component"
```

---

## Chunk 3: State Management and Integration

### Task 12: Simplify AppContext onboarding handlers

**Files:**
- Modify: `apps/app/src/AppContext.tsx:3299-3501`

- [ ] **Step 1: Rewrite handleOnboardingNext**

Replace the complex switch statement (lines 3299-3423) with a simple linear flow:

```typescript
const handleOnboardingNext = useCallback(
  async (options?: OnboardingNextOptions) => {
    const STEP_ORDER: OnboardingStep[] = [
      "wakeUp", "language", "identity", "connection", "senses", "activate"
    ];

    // Auto-select first style if none chosen (on wakeUp or language step)
    if (
      (onboardingStep === "wakeUp" || onboardingStep === "language") &&
      !onboardingStyle &&
      onboardingOptions?.styles?.length
    ) {
      const first = onboardingOptions.styles[0];
      setState("onboardingStyle", first.catchphrase);
    }

    // At activate step, finish onboarding
    if (onboardingStep === "activate") {
      return handleOnboardingFinish();
    }

    // At senses step, check permissions (unless bypass)
    if (onboardingStep === "senses" && !options?.allowPermissionBypass) {
      const perms = await client.getPermissions();
      if (!hasRequiredOnboardingPermissions(perms)) {
        setActionNotice({ type: "error", message: "Please grant required permissions." });
        return;
      }
    }

    // Advance to next step
    const currentIndex = STEP_ORDER.indexOf(onboardingStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      setState("onboardingStep", STEP_ORDER[currentIndex + 1]);
    }
  },
  [onboardingStep, onboardingStyle, onboardingOptions, handleOnboardingFinish, setState, client, setActionNotice]
);
```

- [ ] **Step 2: Rewrite handleOnboardingBack**

Replace the complex switch (lines 3425-3501) with simple linear back:

```typescript
const handleOnboardingBack = useCallback(() => {
  const STEP_ORDER: OnboardingStep[] = [
    "wakeUp", "language", "identity", "connection", "senses", "activate"
  ];

  const currentIndex = STEP_ORDER.indexOf(onboardingStep);
  if (currentIndex > 0) {
    setState("onboardingStep", STEP_ORDER[currentIndex - 1]);
  }
}, [onboardingStep, setState]);
```

- [ ] **Step 3: Update handleOnboardingFinish**

In `handleOnboardingFinish` (lines 3177-3296), set defaults for fields that are no longer collected during onboarding:

```typescript
// Default to local-rawdog mode since runMode step is removed
const runMode = "local";
const sandboxMode = "off";
```

Remove references to `onboardingSetupMode`. The finish handler still uses `onboardingProvider`, `onboardingApiKey`, `onboardingName`, `onboardingStyle` which are collected in the new flow.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/AppContext.tsx
git commit -m "refactor: simplify onboarding handlers for 6-step linear flow"
```

---

### Task 13: Remove deprecated step components

**Files:**
- Delete: `apps/app/src/components/onboarding/SetupModeStep.tsx`
- Delete: `apps/app/src/components/onboarding/RunModeStep.tsx`
- Delete: `apps/app/src/components/onboarding/CloudProviderStep.tsx`
- Delete: `apps/app/src/components/onboarding/ModelSelectionStep.tsx`
- Delete: `apps/app/src/components/onboarding/CloudLoginStep.tsx`
- Delete: `apps/app/src/components/onboarding/InventorySetupStep.tsx`
- Delete: `apps/app/src/components/onboarding/ConnectorsStep.tsx`
- Delete: `apps/app/src/components/onboarding/OnboardingVrmAvatar.tsx`
- Delete: `apps/app/src/components/onboarding/WelcomeStep.tsx`

- [ ] **Step 1: Remove the files**

```bash
rm apps/app/src/components/onboarding/SetupModeStep.tsx
rm apps/app/src/components/onboarding/RunModeStep.tsx
rm apps/app/src/components/onboarding/CloudProviderStep.tsx
rm apps/app/src/components/onboarding/ModelSelectionStep.tsx
rm apps/app/src/components/onboarding/CloudLoginStep.tsx
rm apps/app/src/components/onboarding/InventorySetupStep.tsx
rm apps/app/src/components/onboarding/ConnectorsStep.tsx
rm apps/app/src/components/onboarding/OnboardingVrmAvatar.tsx
rm apps/app/src/components/onboarding/WelcomeStep.tsx
```

- [ ] **Step 2: Remove any remaining imports referencing these files**

Search for imports of deleted files in `OnboardingWizard.tsx` and `AppContext.tsx` — these should already be gone from the rewrite, but verify.

Run: `grep -r "SetupModeStep\|RunModeStep\|CloudProviderStep\|ModelSelectionStep\|CloudLoginStep\|InventorySetupStep\|ConnectorsStep\|OnboardingVrmAvatar\|WelcomeStep" apps/app/src/ --include="*.tsx" --include="*.ts" -l`

Fix any remaining references.

- [ ] **Step 3: Commit**

```bash
git add -A apps/app/src/components/onboarding/
git commit -m "refactor: remove deprecated onboarding step components"
```

---

## Chunk 4: Tests and Verification

### Task 14: Update onboarding tests

**Files:**
- Modify: `apps/app/test/app/onboarding-language.test.tsx`
- Modify: `apps/app/test/app/startup-onboarding.e2e.test.ts`
- Modify: `apps/app/test/app/onboarding-finish-lock.test.ts`

- [ ] **Step 1: Update onboarding-language.test.tsx**

Update the `createOnboardingContext` factory function to use the new step name `"language"` (same name, but `onboardingStep` default should be `"wakeUp"`). Remove any references to `onboardingSetupMode`. Ensure the test still verifies language selection behavior.

- [ ] **Step 2: Update startup-onboarding.e2e.test.ts**

Update the mock `getOnboardingStatus` and step flow assertions to use the new 6-step sequence. Change step name strings from `"welcome"` to `"wakeUp"`, from `"permissions"` to `"senses"`, etc.

- [ ] **Step 3: Update onboarding-finish-lock.test.ts**

Ensure the finish lock test still works — it should test that `handleOnboardingFinish` can't be called twice simultaneously. Update any step name references.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run apps/app/test/app/onboarding --reporter verbose 2>&1`

Fix any failures.

- [ ] **Step 5: Commit**

```bash
git add apps/app/test/app/
git commit -m "test: update onboarding tests for 6-step game flow"
```

---

### Task 15: TypeScript compilation check and fix

**Files:**
- Various (fix any remaining type errors)

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit --project apps/app/tsconfig.json 2>&1 | head -50`

- [ ] **Step 2: Fix any type errors**

Common expected issues:
- Old step names referenced somewhere
- `onboardingSetupMode` references
- Import paths for deleted files
- Missing exports

- [ ] **Step 3: Run the dev server to visual check**

Run: `npm run dev` (or the project's dev command) and verify:
1. Onboarding loads with the 3-column layout
2. VRM model renders in center
3. Background image shows (blurred)
4. Step navigation highlights correctly
5. Can click through all 6 steps
6. Panel animates on step change
7. Can complete onboarding and enter main app

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve remaining type errors from onboarding redesign"
```

---

### Task 16: Final cleanup

- [ ] **Step 1: Remove old game styles from anime.css**

The old onboarding game styles in `apps/app/src/styles/anime.css` (lines ~5787-6000) can be removed since they're replaced by `onboarding-game.css`.

- [ ] **Step 2: Verify no dead imports remain**

Run: `grep -r "from.*onboarding/" apps/app/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules`

Ensure all imports point to files that exist.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: clean up old onboarding styles and dead imports"
```
