# Onboarding Redesign — Game-Style Activation Experience

## Overview

Redesign the onboarding wizard from a traditional form-based flow to an immersive, game-inspired "AI companion activation" experience. The new design uses a three-column layout with a live 3D VRM model, step navigation, and glassmorphism content panels.

## Design Decisions

- **Narrative**: Simple "activate your AI companion" — no complex dialogue
- **3D Model**: Reuse existing VRM system (same engine, camera profiles, animations as companion mode)
- **Step structure**: 6 core immersive steps; advanced config (run mode, inventory, connectors) moves to post-onboarding Settings
- **Visual language**: Dark theme matching companion mode, game-style HUD elements (diamond markers, decorative corners, gradient dividers), glassmorphism panels
- **Background**: Blurred background image with dark overlay (each VRM has its own background image in `vrms/backgrounds/`)

## Layout

Three-column grid: `220px | 1fr | 400px`

```
┌──────────────────────────────────────────────────────┐
│ [corner]                                    [corner] │
│                                                      │
│  ◆ Wake Up        ┌─────────┐   ┌────────────────┐  │
│  ◆ Language       │         │   │  DESIGNATION   │  │
│  ◇ Identity  ←    │  VRM    │   │  ────◆────     │  │
│  ○ Connection     │  Model  │   │  What should   │  │
│  ○ Senses         │         │   │  I be called?  │  │
│  ○ Activate       │         │   │  [input]       │  │
│                   └─────────┘   │  ← Back  [OK]  │  │
│                                 └────────────────┘  │
│ [corner]                                    [corner] │
└──────────────────────────────────────────────────────┘
```

### Left Column — Step Navigation
- Vertical list with diamond-shaped dot markers
- Connecting vertical line with gold gradient fill showing progress
- States: done (half-gold), active (gold + pulse animation + glow), pending (dim)
- Each item: step name + subtitle

### Center Column — VRM Model
- Full WebGL canvas using existing VrmEngine
- Camera profile: `companion` (FOV 28, position 0/1.34/4.62)
- Scale: 1.78, position: 0/-0.84/0
- OrbitControls (rotate only, no pan)
- Foot shadow disc
- Animations loaded from `/animations/mixamo/` FBX files:
  - Breathing Idle (default)
  - Happy Idle (on step completion)
  - Standing Greeting (on wake up)
  - Thinking (on connection step)
  - Look Around (on permissions step)
  - Cheering (on final activation)

### Right Column — Content Panel
- Glassmorphism: `rgba(255,255,255,0.07)` + `backdrop-blur(40px) saturate(1.4)`
- Border: `rgba(255,255,255,0.12)`, border-radius 8px
- Inset highlight: `inset 0 1px 0 rgba(255,255,255,0.08)`
- Shadow: `0 8px 32px rgba(0,0,0,0.25)`
- Diamond ornament dividers between sections
- Centered text layout

### Background
- Full-screen background image (from `vrms/backgrounds/{avatar}.png`)
- `filter: blur(6px)`, `scale(1.05)` to avoid blur edges
- Dark overlay: `rgba(8,10,16,0.45)`
- Slow parallax drift animation (30s cycle)

### Decorative Elements
- Corner SVG markers (L-shaped lines with gold dots) at all 4 corners
- Opacity breathing animation on corners (staggered)

## Animation Spec

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Active step dot | Pulse (scale 1→1.15, glow intensity) | 2s loop | ease-in-out |
| Progress line fill | Height transition | 0.8s | cubic-bezier(0.25,0.46,0.45,0.94) |
| Panel enter | Slide from right (30px) + fade in | 0.6s | cubic-bezier(0.25,0.46,0.45,0.94) |
| Panel children | Staggered fade + slide up (10px) | 0.5s each, 0.1s delay | ease |
| Confirm button | Ripple expand from click point | 0.6s | ease-out |
| Background | Slow drift + subtle scale | 30s loop | ease-in-out |
| Corner markers | Opacity 0.6→1 breathing | 4s loop, staggered | ease-in-out |
| Step transitions | All states use 0.5s transition | 0.5s | cubic-bezier |

## Step Content

### Step 1: Wake Up
- **Panel title**: "Initialization"
- **Content**: "elizaOS" heading, subtitle about autonomous orchestration
- **Action**: "Activate" button
- **Optional**: "Restore from Backup" link → import dialog (file upload + password)
- **VRM animation**: Standing Greeting on activate

### Step 2: Language
- **Panel title**: "Language"
- **Content**: "What language should I speak?"
- **Options**: Horizontal pill buttons — English, 中文, 한국어, Español, Português
- **Behavior**: Click selects and auto-advances
- **VRM animation**: Breathing Idle

### Step 3: Identity
- **Panel title**: "Designation"
- **Content**: "What should I be called?"
- **Input**: Text input for agent name
- **Helper text**: "Choose a name for your AI companion."
- **VRM animation**: Breathing Idle

### Step 4: Connection
- **Panel title**: "Neural Link"
- **Two sub-screens**:

**Screen A — Provider Selection:**
- "Select a provider" heading
- Provider cards in scrollable grid: Milady Cloud, Claude Subscription, ChatGPT Subscription, Anthropic API, OpenAI API, OpenRouter, Gemini, Grok, Groq, DeepSeek, Ollama, Pi-AI
- Each card: icon + name + description
- Click selects and shows Screen B

**Screen B — Provider Configuration:**
- Selected provider header with "Change" link
- Content varies by provider:
  - **Cloud/Subscription**: OAuth login flow or token input
  - **API providers**: Password input for API key with format validation
  - **Ollama**: "No configuration needed" message
- **VRM animation**: Thinking

### Step 5: Senses
- **Panel title**: "Permissions"
- **Content**: List of system permissions
- **Items**: Accessibility, Screen Recording, Microphone, Camera
  - Each shows: name + description + status badge (Granted/Not Set)
  - "Grant" button per item, or "Allow All" button
- **Skip option**: "Skip for Now" link
- **VRM animation**: Look Around

### Step 6: Activate
- **Panel title**: "Activation Complete"
- **Content**: Success message, companion is ready
- **Action**: "Enter" button → transitions to main app (chat tab)
- **VRM animation**: Cheering / Happy Idle

## Data Flow

The new onboarding submits the same payload to `client.submitOnboarding()`:

```typescript
{
  name: string;
  runMode: "local";          // Default for core onboarding
  sandboxMode: "off";        // Default
  provider: string;          // From Connection step
  providerApiKey: string;    // From Connection step
  // Style fields use defaults from first available style
  bio, systemPrompt, style, adjectives, topics, postExamples, messageExamples
}
```

Advanced fields (cloudProvider, inventoryProviders, connectors) are configured post-onboarding in Settings.

## Mobile Considerations

On mobile/narrow screens:
- Switch to single-column layout
- Left navigation becomes horizontal top bar with small diamond dots
- VRM model shown at reduced height above content panel
- Content panel takes full width

## Files to Modify

| File | Change |
|------|--------|
| `apps/app/src/components/OnboardingWizard.tsx` | Complete rewrite — new three-column layout |
| `apps/app/src/components/onboarding/*.tsx` | Rewrite each step component for new panel design |
| `apps/app/src/AppContext.tsx` | Simplify `handleOnboardingNext/Back` for 6-step flow |
| `packages/app-core/src/state/types.ts` | Update OnboardingStep type to new 6 steps |
| `apps/app/src/styles.css` or new CSS file | New game-style onboarding CSS |

## Out of Scope

- New VRM models or custom animations (use existing assets)
- Sound effects / music
- Advanced config steps (moved to Settings)
- Dynamic particles
