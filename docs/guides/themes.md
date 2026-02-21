---
title: Themes & Avatars
sidebarTitle: Themes & Avatars
description: Customize the Milady dashboard appearance with 6 built-in themes and 8 VRM 3D avatars with 29 emotes across 6 categories.
---

Milady ships with 6 visual themes and 8 built-in 3D VRM avatars. Themes control the entire dashboard look and feel -- colors, typography, border radii, shadows, and animations. Avatars provide a live 3D character in the chat view.

## Themes

### How Theme Switching Works

Themes are driven by a `data-theme` attribute on the `<html>` element. The CSS file `apps/app/src/styles/base.css` defines each theme as a `[data-theme="<name>"]` selector block containing CSS custom properties. When the attribute changes, the entire UI re-skins instantly with no page reload.

The theme switching flow:

1. The user selects a theme in **Settings > Appearance** or during onboarding (the "theme" step of the wizard).
2. The `setTheme()` function in `AppContext` calls `document.documentElement.setAttribute("data-theme", name)`.
3. The selected theme name is saved to `localStorage` under the key `milady:theme`.
4. On page load, `loadTheme()` reads `localStorage`, validates the value against the set of known theme names, and falls back to `"milady"` if the stored value is missing or invalid.

The theme can also be set in the Milady configuration file under the `ui.theme` key:

```yaml
ui:
  theme: "programmer"   # milady | qt314 | web2000 | programmer | haxor | psycho
```

### Theme Names and Identifiers

The `ThemeName` type defines the six valid theme identifiers used in code, configuration, and `localStorage`:

| Theme ID | Display Label | Hint | Color Scheme |
|----------|---------------|------|--------------|
| `milady` | milady | clean black & white | Light |
| `qt314` | qt3.14 | soft pastels | Light |
| `web2000` | web2000 | green hacker vibes | Dark |
| `programmer` | programmer | vscode dark | Dark |
| `haxor` | haxor | terminal green | Dark |
| `psycho` | psycho | pure chaos | Dark |

Note that the CSS attribute value and the configuration value use the same identifier (e.g. `qt314`, not `qt3.14`). The display label `qt3.14` is cosmetic only.

### Available Themes

#### milady (default)

The signature theme inspired by miladymaker.net. A light-mode aesthetic with sage greens, warm cream tones, and a Y2K retro-web feel. The `#root` element receives a special green-to-white gradient background (`#b6d4a8` at the top through `#d4e8cc`, `#eaf3e6`, to `#ffffff`).

- **Color scheme:** Light (`color-scheme: light`)
- **Background:** White base (`#ffffff`); gradient overlay on `#root`
- **Accent:** Signature milady green (`#4a7c59`), hover `#3d6b4a`
- **Text:** Forest green (`#2d4a3e`), strong `#1a332b`, muted `#6b8e7a`
- **Header bar:** Rich forest green bg (`#3d5c42`), light text (`#f2f7f0`)
- **Borders:** Bold forest green (`#5b8350`), strong `#3d6b3a`, hover `#2d5228`
- **Links:** Green (`#3d6b4a`), hover turns red (`#c44536`)
- **Typography:** Hiragino Kaku Gothic Pro, Osaka, Meiryo, MS PGothic, sans-serif
- **Monospace:** Courier New, Courier, monospace
- **Corners:** Sharp (0px radius) -- flat retro web aesthetic
- **Shadows:** None (`--shadow-sm/md/lg: none`)
- **Timing:** fast 100ms, normal 150ms, slow 250ms

#### qt3.14

Soft pastels with pink and purple tones. A light, playful aesthetic.

- **Color scheme:** Light (`color-scheme: light`)
- **Background:** Lavender white (`#fef7ff`), elevated pure white
- **Accent:** Fuchsia (`#d946ef`), hover `#c026d3`
- **Text:** Deep plum (`#4a044e`), strong `#3b0764`, muted `#9333ea`
- **Header bar:** Fuchsia bg (`#d946ef`), white text
- **Borders:** Soft purple (`#e9d5ff`), strong `#d8b4fe`, hover `#c084fc`
- **Links:** Purple (`#a855f7`), hover turns rose (`#f43f5e`)
- **Typography:** Hiragino Kaku Gothic Pro, Osaka, Meiryo, MS PGothic, sans-serif
- **Corners:** Rounded (radius: sm 6px, md 8px, lg 12px, xl 16px, full 9999px)
- **Shadows:** Subtle fuchsia-tinted (`rgba(217, 70, 239, 0.06/0.08/0.1)`)
- **Timing:** fast 100ms, normal 200ms, slow 300ms

#### web2000

Dark mode with miladymaker.net-inspired green hues. A moody hacker aesthetic.

- **Color scheme:** Dark (`color-scheme: dark`)
- **Background:** Near-black (`#0a0a0a`), elevated `#141414`
- **Accent:** Matrix green (`#5a9a2a`), hover `#6aaa3a`
- **Text:** Pale green (`#d4e8c4`), strong `#e8f5dc`, muted `#7a9a5a`
- **Header bar:** Dark forest bg (`#1a2a0e`), pale green text (`#d4e8c4`)
- **Borders:** Deep forest green (`#2a3d1a`), strong `#3d5a24`, hover `#4a6e2e`
- **Links:** Bright green (`#6aaa3a`), hover turns red (`#ef4444`)
- **Typography:** Hiragino Kaku Gothic Pro, Osaka, Meiryo, MS PGothic, sans-serif
- **Corners:** Sharp (0px radius)
- **Shadows:** None
- **Timing:** fast 100ms, normal 150ms, slow 250ms

#### programmer

VS Code-inspired dark theme for developers. Familiar, functional, professional.

- **Color scheme:** Dark (`color-scheme: dark`)
- **Background:** VS Code gray (`#1e1e1e`), elevated `#2d2d2d`
- **Accent:** VS Code blue (`#007acc`), hover `#1c97ea`
- **Text:** Light gray (`#d4d4d4`), strong white (`#ffffff`), muted `#808080`
- **Header bar:** VS Code blue bg (`#007acc`), white text
- **Borders:** Medium gray (`#3c3c3c`), strong `#505050`, hover `#606060`
- **Links:** Bright blue (`#3794ff`), hover turns red (`#f44747`)
- **Typography:** -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif
- **Monospace:** Cascadia Code, Fira Code, Consolas, Courier New, monospace
- **Corners:** Slight rounding (radius: sm 2px, md 4px, lg 6px, xl 8px, full 9999px)
- **Shadows:** Subtle dark shadows (`rgba(0,0,0, 0.2/0.3/0.4)`)
- **Timing:** fast 80ms, normal 120ms, slow 200ms

#### haxor

Black terminal with bright green text. Maximum hacker aesthetic.

- **Color scheme:** Dark (`color-scheme: dark`)
- **Background:** Pure black (`#000000`), elevated `#0d0d0d`
- **Accent:** Terminal green (`#00ff41`), hover `#33ff66`
- **Text:** Terminal green (`#00ff41`) for all text -- body, strong, chat
- **Header bar:** Near-black green bg (`#001a00`), green text (`#00ff41`)
- **Borders:** Dark green (`#003b00`), strong `#005500`, hover `#007700`
- **Links:** Terminal green (`#00ff41`), hover turns red (`#ff0000`)
- **Typography:** Courier New, Courier, monospace -- all text is monospace (body, display, and mono all share the same stack)
- **Corners:** Sharp (0px radius)
- **Shadows:** Green glow effect (`rgba(0, 255, 65, 0.15/0.2/0.25)`)
- **Timing:** Fastest -- fast 50ms, normal 100ms, slow 150ms

#### psycho

Neon chaos. A deliberately overwhelming, maximalist theme.

- **Color scheme:** Dark (`color-scheme: dark`)
- **Background:** Deep purple-black (`#0d001a`), elevated `#200040`
- **Accent:** Hot magenta (`#ff00ff`), hover `#ff33ff`
- **Primary:** Electric cyan (`#00ffff`)
- **Chat text:** Cyan (`#00ffff`) -- distinct from body text (`#ff00ff`)
- **Header bar:** Magenta bg (`#ff00ff`), black text (`#000000`)
- **Borders:** Magenta (`#ff00ff`), strong `#ff33ff`, hover `#ff66ff`
- **Links:** Cyan (`#00ffff`), hover turns neon red (`#ff073a`)
- **Typography:** Comic Sans MS, Chalkboard SE (body); Impact, Arial Black (display)
- **Monospace:** Courier New, Courier, monospace
- **Corners:** Sharp (0px) for sm/md/lg/xl, but `9999px` for `--radius-full` (pill shapes)
- **Shadows:** Dual-color neon glow (magenta + cyan at all shadow levels)
- **Timing:** fast 50ms, normal 100ms, slow 200ms

### Dark/Light Mode Handling

Milady does not use the OS-level `prefers-color-scheme` media query. Instead, each theme explicitly sets `color-scheme: light` or `color-scheme: dark` in its CSS block. This tells the browser how to render native form controls, scrollbars, and other UA-styled elements.

- **Light themes:** `milady`, `qt314`
- **Dark themes:** `web2000`, `programmer`, `haxor`, `psycho`

There is no automatic dark/light toggle. Users choose their theme directly, and each theme has a fixed color scheme.

### CSS Architecture

The theme system is split across two CSS files:

1. **`apps/app/src/styles/base.css`** -- Defines all theme CSS custom properties under `[data-theme="..."]` selectors, plus global base styles (reset, scrollbar, focus, typography) inside `@layer base`.
2. **`apps/app/src/styles.css`** -- Imports Tailwind CSS and `base.css`, then bridges theme tokens to Tailwind using `@theme inline`. This lets you use theme-aware classes like `bg-bg`, `text-txt`, `border-border` in Tailwind utility classes.

The `@theme inline` block maps CSS custom properties to Tailwind theme tokens with `var()` references, so Tailwind does not generate duplicate variables -- the `[data-theme]` selectors in `base.css` drive all visual changes at runtime.

### Theme Design Tokens

Every theme defines a consistent set of CSS custom properties. These are the full token categories:

#### Surface Colors

| Token | Purpose |
|-------|---------|
| `--bg` | Main page background |
| `--bg-accent` | Subtle elevated background |
| `--bg-elevated` | Cards and elevated surfaces |
| `--bg-hover` | Hover state background |
| `--bg-muted` | Muted/secondary background |
| `--card` | Card component background |
| `--card-foreground` | Card text color |
| `--surface` | Generic surface color |

#### Text Colors

| Token | Purpose |
|-------|---------|
| `--text` | Body text |
| `--text-strong` | Headings, emphasized text |
| `--chat-text` | Chat message text (can differ from body) |
| `--muted` | De-emphasized text |
| `--muted-strong` | Slightly less muted text |

#### Border and Input Colors

| Token | Purpose |
|-------|---------|
| `--border` | Default border color |
| `--border-strong` | Emphasized borders |
| `--border-hover` | Border color on hover |
| `--input` | Input field border |
| `--ring` | Focus ring color |

#### Accent and Primary Colors

| Token | Purpose |
|-------|---------|
| `--accent` | Primary accent (buttons, links, highlights) |
| `--accent-hover` | Accent on hover |
| `--accent-muted` | Softer accent |
| `--accent-subtle` | Very light accent (backgrounds) |
| `--accent-foreground` | Text on accent background |
| `--primary` | Primary action color |
| `--primary-foreground` | Text on primary background |

#### Status Colors

| Token | Purpose |
|-------|---------|
| `--ok` / `--ok-muted` / `--ok-subtle` | Success states |
| `--warn` / `--warn-muted` / `--warn-subtle` | Warning states |
| `--danger` | Danger/error state |
| `--destructive` / `--destructive-foreground` / `--destructive-subtle` | Destructive actions |
| `--info` | Informational highlight |

#### UI Chrome

| Token | Purpose |
|-------|---------|
| `--header-bar-bg` / `--header-bar-fg` | Top header bar |
| `--section-bar-bg` / `--section-bar-fg` | Section sub-headers |
| `--link-color` / `--link-hover-color` | Anchor links |
| `--focus` / `--focus-ring` | Focus indicator styles |

#### Typography

| Token | Purpose |
|-------|---------|
| `--font-body` | Body text font stack |
| `--font-display` | Display/heading font stack |
| `--mono` | Monospace font stack |

#### Layout and Timing

| Token | Purpose |
|-------|---------|
| `--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-xl` / `--radius-full` | Border radii |
| `--shadow-sm` / `--shadow-md` / `--shadow-lg` | Box shadows |
| `--duration-fast` / `--duration-normal` / `--duration-slow` | Animation/transition speeds |

#### Plugin UI Tokens

Every theme also defines tokens for consistent plugin settings form styling:

| Token | Default Value | Purpose |
|-------|---------------|---------|
| `--plugin-field-gap` | `1rem` | Gap between form fields |
| `--plugin-group-gap` | `1.5rem` | Gap between field groups |
| `--plugin-section-padding` | `1.5rem` | Section padding |
| `--plugin-label-size` | `0.8125rem` (13px) | Label font size |
| `--plugin-help-size` | `0.6875rem` (11px) | Help text font size |
| `--plugin-error-size` | `0.6875rem` (11px) | Error text font size |
| `--plugin-input-height` | `2.25rem` (36px) | Input field height |
| `--plugin-max-field-width` | `32rem` (512px) | Max field width |
| `--plugin-label` | `var(--text)` | Label color |
| `--plugin-help` | `var(--muted)` | Help text color |
| `--plugin-error` | `var(--destructive)` | Error text color |
| `--plugin-border` | `var(--border)` | Plugin input border |
| `--plugin-focus-ring` | `var(--accent)` | Plugin focus ring |

### Animation Timing by Theme

Animation speeds vary by theme to match each theme's personality:

| Theme | `--duration-fast` | `--duration-normal` | `--duration-slow` |
|-------|-------------------|---------------------|---------------------|
| milady | 100ms | 150ms | 250ms |
| qt3.14 | 100ms | 200ms | 300ms |
| web2000 | 100ms | 150ms | 250ms |
| programmer | 80ms | 120ms | 200ms |
| haxor | 50ms | 100ms | 150ms |
| psycho | 50ms | 100ms | 200ms |

### Creating a Custom Theme

To add a custom theme, create a new `[data-theme="yourname"]` block in `base.css` that defines all the CSS custom properties. Use an existing theme as a template:

1. Copy the full `[data-theme="milady"]` block.
2. Change the selector to `[data-theme="mytheme"]`.
3. Modify the color values, fonts, radii, shadows, and timing to taste.
4. Add your theme name to the `ThemeName` union type in `apps/app/src/AppContext.tsx`.
5. Add an entry to the `THEMES` array in the same file with an `id`, `label`, and `hint`.
6. Optionally add it to the `ui.theme` union in `src/config/types.milady.ts`.

Every token listed in the design tokens tables above must be defined. Missing tokens will cause the UI to fall through to whatever the browser inherits, which can produce broken visuals.

### Component-Level Styling

Components use theme tokens through two mechanisms:

- **CSS `var()` references** -- e.g. `background: var(--bg)`, `color: var(--text)`, `border-color: var(--border)`. This is used in the global CSS and in inline styles.
- **Tailwind utility classes** -- The `@theme inline` bridge means classes like `bg-bg`, `text-txt`, `border-border`, `text-accent` reference the active theme's custom properties.

Button base classes (`.btn` and `.theme-btn`) are defined in `styles.css` and automatically adapt to the active theme:

- `.btn` uses `--accent` for background and border, `--accent-foreground` for text.
- `.theme-btn` uses `--bg` for background and `--border` for the border, switching to `--accent` for the active state.

### CLI and TUI Theming

The CLI and TUI have their own separate color palettes, independent of the dashboard themes.

**CLI palette** (defined in `src/terminal/palette.ts`):

| Token | Hex | Purpose |
|-------|-----|---------|
| `accent` | `#FF5A2D` | Primary CLI accent |
| `accentBright` | `#FF7A3D` | Bright accent (commands) |
| `accentDim` | `#D14A22` | Dim accent |
| `info` | `#FF8A5B` | Informational |
| `success` | `#2FBF71` | Success messages |
| `warn` | `#FFB020` | Warnings |
| `error` | `#E23D2D` | Errors |
| `muted` | `#8B7F77` | De-emphasized text |

The CLI respects `NO_COLOR` and `FORCE_COLOR` environment variables for color output control.

**TUI palette** (defined in `src/tui/theme.ts`):

The TUI uses a separate set of brand colors: accent `#E879F9`, dim accent `#A855F7`, muted `#6B7280`, success `#34D399`, error `#F87171`, warning `#FBBF24`, info `#60A5FA`. These drive the select list, editor, and markdown rendering themes within the terminal UI.

## VRM 3D Avatars

### What Are VRM Avatars?

[VRM](https://vrm.dev/) is an open standard for 3D humanoid avatars. Milady uses VRM models to render a live 3D character in the chat view that reacts to conversation with animations and emotes.

### Built-in Avatars

Milady ships with **8 built-in VRM avatars** (indexed 1 through 8). Each avatar has:

- A `.vrm` model file located at `vrms/{index}.vrm`.
- A preview thumbnail at `vrms/previews/milady-{index}.png`.

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

- The **Cmd/Ctrl+E** keyboard shortcut (works in both the desktop app and the web dashboard).
- The emote picker button in the chat UI.

### Available Emotes

There are **29 emotes** across **6 categories**:

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
