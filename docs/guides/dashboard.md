---
title: Web Dashboard
sidebarTitle: Dashboard
description: Navigate the Milady web dashboard to configure your agent, chat, manage knowledge, and access advanced settings.
---

# Web Dashboard

The Milady web dashboard is the primary interface for interacting with your agent. It provides a full-featured control panel for chatting, configuring your agent's character, managing plugins, and monitoring runtime behavior.

## Accessing the Dashboard

The dashboard runs as a web application served by the Milady agent runtime.

- **Default URL:** `http://localhost:2138`
- **CLI shortcut:** Run `milady dashboard` to open the dashboard in your default browser.
- **Desktop app:** The Electron desktop app embeds the dashboard directly (no browser required).

On first launch you will see the **Onboarding Wizard**, which walks you through initial agent setup. If authentication is required you will see the **Pairing View** before reaching the main dashboard.

## Dashboard Layout

The dashboard uses a tab-based navigation system. On the Chat tab, the layout includes a **Conversations Sidebar** on the left, the **Chat View** in the center, and an **Autonomous Panel** on the right. On mobile viewports (below 1024 px), the sidebar and autonomous panel collapse into overlay buttons.

A **Header** bar sits at the top of every page, and a **Terminal Panel** is available at the bottom. A **Command Palette** (Cmd/Ctrl+K in the desktop app) provides quick access to actions across the dashboard.

## Tabs

The navigation is organized into primary tabs and an Advanced group.

### Chat

The default landing tab. Features include:

- **Message streaming** — agent responses stream in token-by-token with a visible typing indicator.
- **File drops** — drag and drop files into the chat area to share them with the agent.
- **Image attachments** — attach images via a file picker or paste from clipboard.
- **Voice chat** — built-in voice chat powered by ElevenLabs or browser TTS/STT. Includes a microphone toggle and agent voice mute control.
- **VRM 3D avatar** — a live 3D avatar rendered with Three.js and `@pixiv/three-vrm`. The avatar responds to conversation with idle animations and emotes. Select from 8 built-in VRM models.
- **Conversations sidebar** — manage multiple conversations, see unread counts, create new threads.
- **Autonomous panel** — displays real-time agent status, stream events (actions, tools, errors, heartbeats), active triggers, and workbench tasks/todos.
- **Emote picker** — trigger VRM avatar emotes (Cmd/Ctrl+E in the desktop app). 27 emotes across 6 categories: Greeting, Emotion, Dance, Combat, Idle, Movement.
- **Context menu** — right-click messages to save commands or perform custom actions.

### Character

Configure your agent's identity and personality. The view is organized into four sections:

1. **Identity & Personality** — agent name, avatar selection, bio, adjectives, topics, and system prompt.
2. **Style** — three-column style rule textareas for controlling how the agent communicates.
3. **Examples** — collapsible chat examples and post examples to guide the agent's behavior.
4. **Voice** — voice provider selection (ElevenLabs) and preview, with model configuration.

Changes are saved via a save bar at the bottom of the view.

### Wallets

Displays wallet balances and NFTs. Shows token holdings across multiple EVM chains (Ethereum, Base, Arbitrum, Optimism, Polygon) and Solana. Each chain is identified with a color-coded icon.

### Knowledge

Manage your agent's knowledge base:

- **Stats display** — document count and fragment count.
- **Document upload** — file picker and drag-and-drop support.
- **URL upload** — paste a URL; YouTube URLs are auto-transcribed.
- **Search** — full-text search across the knowledge base.
- **Document list** — browse documents with delete functionality.
- **Document detail** — view individual documents and their fragments.

### Social (Connectors)

Configure chat and social connector plugins. This is a filtered view of the Plugins system showing only connector-type plugins (e.g., Discord, Twitter, Telegram).

### Apps

A single-surface app browser with optional full-screen game mode. Browse and launch apps that integrate with your agent, including embedded game viewers.

### Settings

Unified scrollable preferences panel with the following sections:

1. **Appearance** — theme picker with 6 built-in themes (see [Themes & Avatars](/guides/themes)).
2. **AI Model** — provider selection and model configuration.
3. **Media Generation** — image, video, audio, and vision provider selection.
4. **Speech (TTS/STT)** — voice provider and transcription configuration.
5. **Updates** — software update channel selection and manual update check.
6. **Advanced** (collapsible) — Logs, Core Plugins, Database, Secrets, Chrome Extension connection, Export/Import, and Danger Zone.

### Advanced Group

The Advanced section contains specialized sub-tabs, each accessible via a secondary tab bar:

| Sub-tab | Description |
|---------|-------------|
| **Plugins** | Feature and connector plugin management. Searchable/filterable cards with per-plugin settings and a UI Field Showcase reference plugin. |
| **Skills** | Custom agent skills configuration. |
| **Actions** | Custom agent actions — create and edit custom action definitions. |
| **Triggers** | Scheduled and event-based automation management. |
| **Fine-Tuning** | Dataset and model training workflows. |
| **Trajectories** | LLM call history viewer and analysis. Includes a detail view for individual trajectories. |
| **Runtime** | Deep runtime object introspection and load order inspection. |
| **Databases** | Browse database tables, media files, and vector stores. |
| **Logs** | Runtime and service log viewer. |
| **Security** | Sandbox and policy audit feed. |

## Agent Status Indicator

The dashboard displays a color-coded agent status indicator:

- **Green (glowing)** — agent is running.
- **Yellow** — agent is paused, starting, or restarting.
- **Red** — agent has encountered an error.
- **Gray** — agent status is unknown or not connected.

## Action Notices

Transient toast notifications appear at the bottom of the screen for action confirmations, errors, and informational messages, color-coded by tone (success, error, or neutral).

## Restart Banner

When the agent needs a restart (for example, after configuration changes), a banner appears prompting you to restart.
