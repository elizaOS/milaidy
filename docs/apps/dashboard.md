---
title: Web Dashboard
sidebarTitle: Dashboard
description: Navigate the Milady web dashboard to configure your agent, chat, manage knowledge, and access advanced settings.
---

The Milady web dashboard is the primary interface for interacting with your agent. It provides a full-featured control panel for chatting, configuring your agent's character, managing plugins, and monitoring runtime behavior.

## Accessing the Dashboard

The dashboard runs as a web application served by the Milady agent runtime.

| Method | Details |
|--------|---------|
| **Default URL** | `http://localhost:2138` |
| **CLI shortcut** | Run `milady dashboard` to open the dashboard in your default browser |
| **Desktop app** | The Electron desktop app embeds the dashboard directly (no browser required) |

On first launch you will see the **Onboarding Wizard**, which walks you through initial agent setup. If authentication is required you will see the **Pairing View** before reaching the main dashboard.

<Info>
The dashboard port defaults to `2138`. If this port is already in use, the runtime will log the actual port it binds to. Check the startup logs for the exact URL.
</Info>

## Dashboard Layout

The dashboard uses a tab-based navigation system. On the Chat tab, the layout includes a **Conversations Sidebar** on the left, the **Chat View** in the center, and an **Autonomous Panel** on the right. On mobile viewports (below 1024 px), the sidebar and autonomous panel collapse into overlay buttons.

A **Header** bar sits at the top of every page, and a **Terminal Panel** is available at the bottom. A **Command Palette** (Cmd/Ctrl+K in the desktop app) provides quick access to actions across the dashboard.

### Header Bar

The header displays across all tabs and includes:

- **Agent name** -- the name of the currently running agent, pulled from `agentStatus.agentName`.
- **Agent status indicator** -- a color-coded dot showing the agent's runtime state (see [Agent Status Indicator](#agent-status-indicator) below).
- **Wallet addresses** -- truncated EVM and Solana addresses with copy-to-clipboard functionality.
- **Cloud credits** -- if Milady Cloud is enabled, the header shows credit balance with color-coded thresholds (green for OK, yellow for low, red for critical), along with a top-up link.
- **Lifecycle controls** -- Pause/Resume and Restart buttons for the agent runtime. These are disabled during state transitions (starting, restarting).
- **Drop / Mint status** -- when a public mint is active and the user has not yet minted, a mint button appears.

### Responsive Design

The dashboard adapts to viewport width:

| Viewport | Behavior |
|----------|----------|
| **Desktop** (1024 px and above) | Full three-column layout: sidebar, chat, autonomous panel |
| **Tablet** (768-1023 px) | Sidebar and autonomous panel collapse to overlay toggles |
| **Mobile** (below 768 px) | Single-column layout; sidebar and panel open as full-screen overlays |

The `ConversationsSidebar` and `AutonomousPanel` components both accept a `mobile` prop that switches their rendering mode and adds a close button.

## Tabs

The navigation is organized into primary tabs and an Advanced group. Tabs are defined in `apps/app/src/navigation.ts` with the following structure:

| Tab Group | Tabs | URL Path |
|-----------|------|----------|
| **Chat** | chat | `/chat` |
| **Character** | character | `/character` |
| **Wallets** | wallets | `/wallets` |
| **Knowledge** | knowledge | `/knowledge` |
| **Social** | connectors | `/connectors` |
| **Apps** | apps | `/apps` |
| **Settings** | settings | `/settings` |
| **Advanced** | plugins, skills, actions, triggers, fine-tuning, trajectories, runtime, database, logs, security | Various |

Legacy paths are redirected automatically: `/game` maps to Apps, `/agent` to Character, `/inventory` to Wallets, `/features` to Plugins, `/admin` to Advanced, and `/config` to Settings.

### Chat

The default landing tab. The `ChatView` component provides the core messaging interface.

**Message Area**

Messages render through the `MessageContent` component, which supports:

- **Plain text** -- standard chat messages with line breaks preserved.
- **Inline plugin config** -- `[CONFIG:pluginId]` markers in agent responses render as interactive plugin configuration forms using `ConfigRenderer`.
- **UI Spec rendering** -- fenced JSON code blocks containing UiSpec objects render as interactive UI elements via `UiRenderer`.
- **Code blocks** -- syntax-highlighted fenced code blocks.
- **Streaming** -- agent responses stream in token-by-token with a visible typing indicator. The `chatFirstTokenReceived` flag tracks when the first token arrives.

**Input Area**

The chat input area sits at the bottom of the view:

- **Auto-resizing textarea** -- grows from 38 px to a maximum of 200 px as you type.
- **Image attachments** -- attach images via the file picker button, drag-and-drop onto the chat area, or paste from clipboard. Pending images display as thumbnails above the input.
- **File drops** -- drag and drop files into the chat area to share them with the agent. A visual drop zone indicator appears during drag.
- **Send / Stop** -- the send button submits the message; while the agent is responding, a stop button appears to cancel generation.

**Voice Chat**

Built-in voice chat powered by ElevenLabs or browser TTS/STT:

- Voice configuration loads automatically from the agent's config on mount.
- The `useVoiceChat` hook manages the microphone toggle, agent voice playback, and the speaking state that drives avatar lip-sync.
- Voice config changes in Settings or Character views are synchronized in real-time via a `milady:voice-config-updated` custom DOM event.

**VRM 3D Avatar**

A live 3D avatar rendered with Three.js and `@pixiv/three-vrm`:

- The avatar responds to conversation with idle animations and emotes.
- Select from 8 built-in VRM models via the `selectedVrmIndex` state.
- Toggle avatar visibility and agent voice mute via the two control buttons in the Autonomous Panel's Chat Controls section.

**Conversations Sidebar**

The `ConversationsSidebar` component manages multiple conversations:

- **Conversation list** -- sorted by most recently updated. Each entry shows the title, a relative timestamp (e.g., "5m ago", "2d ago"), and an unread indicator for conversations with new messages.
- **Create new** -- a "New Chat" button at the top creates a fresh conversation thread.
- **Rename** -- double-click a conversation title to enter inline edit mode. Press Enter to save or Escape to cancel.
- **Delete** -- each conversation has a delete button that removes the thread permanently.
- **Unread tracking** -- the `unreadConversations` set tracks which conversations have new messages the user has not yet viewed.

**Autonomous Panel**

Displayed on the right side of the Chat tab, the `AutonomousPanel` component provides real-time visibility into autonomous operations:

- **Current state** -- shows the latest "Thought" (from assistant/evaluator streams) and latest "Action" (from action/tool/provider streams).
- **Event Stream** -- a collapsible, reverse-chronological feed of the last 120 events, color-coded by type:

| Event Type | Color |
|------------|-------|
| Heartbeat events | Accent |
| Error events | Red (danger) |
| Action, tool, provider events | Green (success) |
| Assistant thoughts | Accent |
| Other events | Muted gray |

- **Workbench Tasks** -- active tasks the agent is working on, displayed as a checklist.
- **Triggers** -- scheduled triggers (interval, cron, one-time) with their type, enabled status, and run count.
- **Todos** -- task items tracked by the agent, displayed as a checklist.
- **Chat Controls** -- at the bottom, avatar visibility toggle and agent voice mute toggle, plus a VRM avatar preview window (260-420 px tall depending on viewport).

**Emote Picker**

Trigger VRM avatar emotes with the keyboard shortcut **Cmd+E** (macOS) or **Ctrl+E** (Windows/Linux). The picker provides 29 emotes across 6 categories:

| Category | Emotes |
|----------|--------|
| **Greeting** | Wave, Kiss |
| **Emotion** | Crying, Sorrow, Rude Gesture, Looking Around |
| **Dance** | Dance Happy, Dance Breaking, Dance Hip Hop, Dance Popping |
| **Combat** | Hook Punch, Punching, Firing Gun, Sword Swing, Chopping, Spell Cast, Range, Death |
| **Idle** | Idle, Talk, Squat, Fishing |
| **Movement** | Float, Jump, Flip, Run, Walk, Crawling, Fall |

Each emote is represented by a clickable icon button. Categories are displayed as filterable tabs within the picker.

**Context Menu**

Right-click messages to access a context menu for saving commands or performing custom actions.

### Character

Configure your agent's identity and personality. The view is organized into four sections:

1. **Identity & Personality** -- agent name, avatar selection, bio, adjectives, topics, and system prompt.
2. **Style** -- three-column style rule textareas for controlling how the agent communicates.
3. **Examples** -- collapsible chat examples and post examples to guide the agent's behavior.
4. **Voice** -- voice provider selection (ElevenLabs) and preview, with model configuration.

Changes are saved via a save bar at the bottom of the view.

### Wallets

Displays wallet balances and NFTs. Shows token holdings across multiple EVM chains (Ethereum, Base, Arbitrum, Optimism, Polygon) and Solana. Each chain is identified with a color-coded icon.

### Knowledge

Manage your agent's knowledge base:

- **Stats display** -- document count and fragment count.
- **Document upload** -- file picker and drag-and-drop support.
- **URL upload** -- paste a URL; YouTube URLs are auto-transcribed.
- **Search** -- full-text search across the knowledge base.
- **Document list** -- browse documents with delete functionality.
- **Document detail** -- view individual documents and their fragments.

### Social (Connectors)

Configure chat and social connector plugins. This is a filtered view of the Plugins system showing only connector-type plugins (e.g., Discord, Twitter, Telegram).

### Apps

A single-surface app browser with optional full-screen game mode. Browse and launch apps that integrate with your agent, including embedded game viewers.

### Settings

Unified scrollable preferences panel implemented in the `SettingsView` component. The view is organized into the following sections:

#### 1. Appearance

Theme picker with 6 built-in themes displayed as a button grid (3 columns on mobile, 6 on desktop):

| Theme | Description |
|-------|-------------|
| **milady** | Clean black & white |
| **qt3.14** | Soft pastels |
| **web2000** | Green hacker vibes |
| **programmer** | VS Code dark |
| **haxor** | Terminal green |
| **psycho** | Pure chaos |

The active theme is highlighted. Theme selection is persisted to local storage and applied immediately. See [Themes & Avatars](/guides/themes) for details.

#### 2. AI Model

Provider selection and model configuration via the `ProviderSwitcher` component. This section supports:

- **Milady Cloud** -- if cloud is enabled, shows connection status, credit balance (with low/critical thresholds), and a login/disconnect flow.
- **Local/third-party providers** -- toggle AI provider plugins (e.g., Anthropic, OpenAI) and configure their API keys and model settings.
- **Plugin config save** -- each provider plugin's settings can be saved independently.

#### 3. Wallet / RPC / Secrets

Embedded configuration view (`ConfigPageView` with `embedded` prop) for managing wallet addresses, RPC endpoint URLs, and secret values (API keys, tokens). This is the same configuration system available through the Config page, rendered inline within Settings.

#### 4. Media Generation

The `MediaSettingsSection` component provides provider selection for:

- **Image generation** -- select and configure image generation providers.
- **Video generation** -- select and configure video generation providers.
- **Audio generation** -- select and configure audio generation providers.
- **Vision** -- select and configure vision/image understanding providers.

#### 5. Speech (TTS / STT)

The `VoiceConfigView` component configures:

- **Text-to-Speech provider** -- ElevenLabs or browser-native TTS.
- **Speech-to-Text** -- transcription provider configuration.
- **Voice preview** -- test the selected voice configuration.

#### 6. Permissions & Capabilities

The `PermissionsSection` component manages system permission grants for native platforms (Electron desktop app). Controls access to features like file system, microphone, camera, and notifications.

#### 7. Software Updates

- **Current version** display.
- **Release channel** selection via radio buttons: Stable (recommended), Beta (preview), or Nightly (bleeding edge).
- **Check Now** button for manual update checks.
- **Update available** banner showing current and latest version with instructions to run `milady update`.
- **Last checked** timestamp.

#### 8. Chrome Extension

- **Relay server status** -- shows whether the WebSocket relay at `ws://127.0.0.1:{port}/extension` is reachable, with a green/red indicator.
- **Check Connection** button to re-test relay status.
- **Installation instructions** -- step-by-step guide to load the unpacked Chrome extension from `apps/chrome-extension/` in Developer mode.
- **Extension path** display when available.

#### 9. Agent Export / Import

- **Export** -- opens a modal that estimates export size (memories, entities, rooms, worlds, tasks), requires an encryption password (minimum 4 characters), and optionally includes logs. Downloads as a single encrypted file.
- **Import** -- opens a modal to select an `.eliza-agent` file and enter the decryption password used during export.

<Warning>
Exports contain all agent data including secrets and relationships. The encryption password protects the file -- choose a strong password and store it securely.
</Warning>

#### 10. Danger Zone

Visually separated section with red-bordered cards for irreversible actions:

- **Export Private Keys** -- reveals EVM and Solana private keys with copy buttons. Keys are hidden by default and toggled on demand.
- **Reset Agent** -- wipes all config, memory, and data, returning the application to the onboarding wizard. This action is irreversible.

<Warning>
Never share your private keys with anyone. Resetting the agent permanently deletes all data -- there is no undo.
</Warning>

### Advanced Group

The Advanced section contains specialized sub-tabs, each accessible via a secondary tab bar:

| Sub-tab | Path | Description |
|---------|------|-------------|
| **Plugins** | `/plugins` | Feature and connector plugin management. Searchable/filterable cards with per-plugin settings and a UI Field Showcase reference plugin. |
| **Skills** | `/skills` | Custom agent skills configuration. |
| **Actions** | `/actions` | Custom agent actions -- create and edit custom action definitions. |
| **Triggers** | `/triggers` | Scheduled and event-based automation management. |
| **Fine-Tuning** | `/fine-tuning` | Dataset and model training workflows. |
| **Trajectories** | `/trajectories` | LLM call history viewer and analysis. Includes a detail view for individual trajectories. |
| **Runtime** | `/runtime` | Deep runtime object introspection and load order inspection. |
| **Databases** | `/database` | Browse database tables, media files, and vector stores. |
| **Logs** | `/logs` | Runtime and service log viewer. |
| **Security** | `/security` | Sandbox and policy audit feed. |

## Agent Status Indicator

The dashboard displays a color-coded agent status indicator in the header. The state is derived from `agentStatus.state`:

| Color | States | Meaning |
|-------|--------|---------|
| **Green** (`text-ok`) | `running` | Agent is running normally |
| **Yellow** (`text-warn`) | `paused`, `starting`, `restarting` | Agent is in a transitional state |
| **Red** (`text-danger`) | `error` | Agent has encountered an error |
| **Gray** (`text-muted`) | `stopped`, unknown, not connected | Agent status is unknown or not connected |

## Plugin Management

Plugins are managed through the **Plugins** sub-tab under Advanced and the **Social** tab for connector-type plugins:

- **Search and filter** -- plugins are displayed as searchable, filterable cards.
- **Enable/disable** -- toggle individual plugins on or off. Changes may require an agent restart.
- **Per-plugin settings** -- each plugin can expose its own configuration UI, rendered via `ConfigRenderer`.
- **Plugin types** -- plugins are categorized as "feature" or "connector" types. The Social tab shows only connectors.

## Action Notices

Transient toast notifications appear at the bottom of the screen for action confirmations, errors, and informational messages, color-coded by tone (success, error, or neutral).

## Restart Banner

When the agent needs a restart (for example, after configuration changes), a banner appears prompting you to restart. The banner uses the lifecycle control system, which tracks `lifecycleBusy` and `lifecycleAction` to prevent conflicting operations.
