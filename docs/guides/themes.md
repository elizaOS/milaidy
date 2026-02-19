---
title: Themes & Avatars
sidebarTitle: Themes & Avatars
description: Customize the Milaidy dashboard appearance with 6 built-in themes and 8 VRM 3D avatars with 27 emotes.
---

# Themes & Avatars

Milaidy ships with 6 visual themes and 8 built-in 3D VRM avatars. Themes control the entire dashboard look and feel — colors, typography, border radii, shadows, and animations. Avatars provide a live 3D character in the chat view.

## Themes

### How to Switch Themes

Navigate to **Settings** and look for the **Appearance** section at the top. The theme picker displays all available themes. Your selection is saved to `localStorage` under the key `milaidy:theme` and persists across sessions.

### Available Themes

#### milaidy (default)

The signature theme inspired by miladymaker.net. A light-mode aesthetic with sage greens, warm cream tones, and a Y2K retro-web feel.

- **Color scheme:** Light
- **Background:** White base with a green-to-white gradient (`#b6d4a8` to `#ffffff`)
- **Accent:** Signature milaidy green (`#4a7c59`)
- **Text:** Forest green (`#2d4a3e`)
- **Header bar:** Rich forest green (`#3d5c42`)
- **Borders:** Bold forest green, not pastel (`#5b8350`)
- **Typography:** Hiragino Kaku Gothic Pro, Osaka, Meiryo, MS PGothic, sans-serif
- **Corners:** Sharp (0px radius) — flat retro web aesthetic
- **Shadows:** None

#### qt3.14

Soft pastels with pink and purple tones. A light, playful aesthetic.

- **Color scheme:** Light
- **Background:** Lavender white (`#fef7ff`)
- **Accent:** Fuchsia (`#d946ef`)
- **Text:** Deep plum (`#4a044e`)
- **Header bar:** Fuchsia (`#d946ef`)
- **Borders:** Soft purple (`#e9d5ff`)
- **Typography:** Hiragino Kaku Gothic Pro, Osaka, sans-serif
- **Corners:** Rounded (8px radius)
- **Shadows:** Subtle fuchsia-tinted

#### web2000

Dark mode with miladymaker.net-inspired green hues. A moody hacker aesthetic.

- **Color scheme:** Dark
- **Background:** Near-black (`#0a0a0a`)
- **Accent:** Matrix green (`#5a9a2a`)
- **Text:** Pale green (`#d4e8c4`)
- **Header bar:** Dark forest (`#1a2a0e`)
- **Borders:** Deep forest green (`#2a3d1a`)
- **Typography:** Hiragino Kaku Gothic Pro, Osaka, sans-serif
- **Corners:** Sharp (0px radius)
- **Shadows:** None

#### programmer

VS Code-inspired dark theme for developers. Familiar, functional, professional.

- **Color scheme:** Dark
- **Background:** VS Code gray (`#1e1e1e`)
- **Accent:** VS Code blue (`#007acc`)
- **Text:** Light gray (`#d4d4d4`)
- **Header bar:** VS Code blue (`#007acc`)
- **Borders:** Medium gray (`#3c3c3c`)
- **Typography:** system-ui, Segoe UI, Roboto, sans-serif
- **Monospace:** Cascadia Code, Fira Code, Consolas
- **Corners:** Slight rounding (4px radius)
- **Shadows:** Subtle dark shadows

#### haxor

Black terminal with bright green text. Maximum hacker aesthetic.

- **Color scheme:** Dark
- **Background:** Pure black (`#000000`)
- **Accent:** Terminal green (`#00ff41`)
- **Text:** Terminal green (`#00ff41`)
- **Header bar:** Near-black green (`#001a00`)
- **Borders:** Dark green (`#003b00`)
- **Typography:** Courier New, Courier, monospace (all text is monospace)
- **Corners:** Sharp (0px radius)
- **Shadows:** Green glow effect

#### psycho

Neon chaos. A deliberately overwhelming, maximalist theme.

- **Color scheme:** Dark
- **Background:** Deep purple-black (`#0d001a`)
- **Accent:** Hot magenta (`#ff00ff`)
- **Primary:** Electric cyan (`#00ffff`)
- **Chat text:** Cyan (`#00ffff`)
- **Header bar:** Magenta (`#ff00ff`) with black text
- **Borders:** Magenta (`#ff00ff`)
- **Typography:** Comic Sans MS, Chalkboard SE (body); Impact, Arial Black (display)
- **Corners:** Sharp (0px) but with `9999px` for full-round elements
- **Shadows:** Dual-color neon glow (magenta + cyan)

### Theme Design Tokens

Every theme defines a consistent set of CSS custom properties, including:

- **Plugin UI tokens** — `--plugin-field-gap`, `--plugin-group-gap`, `--plugin-section-padding`, `--plugin-label-size`, `--plugin-input-height`, `--plugin-max-field-width` — ensuring plugin settings forms are styled consistently across themes.
- **Timing tokens** — `--duration-fast`, `--duration-normal`, `--duration-slow` — animation speeds that vary by theme (haxor is fastest at 50/100/150ms; psycho/qt314 are 50-100/100-200/200-300ms).

## VRM 3D Avatars

### What Are VRM Avatars?

[VRM](https://vrm.dev/) is an open standard for 3D humanoid avatars. Milaidy uses VRM models to render a live 3D character in the chat view that reacts to conversation with animations and emotes.

### Built-in Avatars

Milaidy ships with **8 built-in VRM avatars** (indexed 1 through 8). Each avatar has:

- A `.vrm` model file located at `vrms/{index}.vrm`.
- A preview thumbnail at `vrms/previews/milaidy-{index}.png`.

Select an avatar index of 0 to disable the 3D avatar entirely.

### Avatar Selection

Avatars are selected in the **Character** tab via the **Avatar Selector** component. The selected VRM index is stored in the app state and persists with the agent configuration.

### Rendering

The VRM rendering engine is built on:

- **Three.js** — the 3D rendering library.
- **@pixiv/three-vrm** — VRM model loading and VRM-specific features (blendshapes, bone structure, look-at targeting).
- **GLTFLoader** — loads the VRM files (which are glTF-based).

The `VrmEngine` manages:

- Model loading via `VRMLoaderPlugin` and `VRMUtils`.
- An idle animation system with configurable tracks and timing.
- Camera animation with gentle sway, bob, and rotation for a living feel (configurable amplitude and speed).
- Emote playback triggered from the chat interface.

## Emote System

### Emote Picker

The emote picker is accessible via:

- The **Cmd/Ctrl+E** keyboard shortcut (desktop app only).
- The emote picker button in the chat UI.

### Available Emotes

There are **27 emotes** across **6 categories**:

#### Greeting (2)

| Emote | ID |
|-------|----|
| Wave | `wave` |
| Kiss | `kiss` |

#### Emotion (4)

| Emote | ID |
|-------|----|
| Crying | `crying` |
| Sorrow | `sorrow` |
| Rude Gesture | `rude-gesture` |
| Looking Around | `looking-around` |

#### Dance (4)

| Emote | ID |
|-------|----|
| Dance Happy | `dance-happy` |
| Dance Breaking | `dance-breaking` |
| Dance Hip Hop | `dance-hiphop` |
| Dance Popping | `dance-popping` |

#### Combat (8)

| Emote | ID |
|-------|----|
| Hook Punch | `hook-punch` |
| Punching | `punching` |
| Firing Gun | `firing-gun` |
| Sword Swing | `sword-swing` |
| Chopping | `chopping` |
| Spell Cast | `spell-cast` |
| Range | `range` |
| Death | `death` |

#### Idle (4)

| Emote | ID |
|-------|----|
| Idle | `idle` |
| Talk | `talk` |
| Squat | `squat` |
| Fishing | `fishing` |

#### Movement (7)

| Emote | ID |
|-------|----|
| Float | `float` |
| Jump | `jump` |
| Flip | `flip` |
| Run | `run` |
| Walk | `walk` |
| Crawling | `crawling` |
| Fall | `fall` |

Emotes play as animations on the current VRM avatar. If no avatar is loaded (index 0), emotes have no visible effect.
