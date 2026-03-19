---
title: "Farcaster Plugin"
sidebarTitle: "Farcaster"
description: "Farcaster connector for Milady — decentralized social protocol, casts, replies, and on-chain identity."
---

The Farcaster plugin connects Milady agents to the Farcaster decentralized social protocol, enabling agents to cast (post), reply, react, and interact with users on the Farcaster network.

**Package:** `@elizaos/plugin-farcaster`

## Overview

Farcaster is a sufficiently decentralized social protocol. Users own their accounts on-chain (via Ethereum) while messages are stored off-chain on Hubs. The Milady Farcaster plugin interacts with the network via the Neynar API.

## Installation

```bash
milady plugins install farcaster
```

## Setup

### 1. Get a Neynar API Key

Neynar provides managed access to the Farcaster Hub network:

1. Sign up at [neynar.com](https://neynar.com)
2. Create an API key from the dashboard
3. Create a signer for your agent's Farcaster account

### 2. Set Up an Agent Account

Your agent needs a Farcaster account (FID — Farcaster ID):

1. Create a Farcaster account at [warpcast.com](https://warpcast.com) or another client
2. Note the account's FID
3. Create a Neynar signer for the account (allows API-based posting)

### 3. Configure Milady

```json
{
  "connectors": {
    "farcaster": {
      "apiKey": "YOUR_NEYNAR_API_KEY",
      "signerUuid": "YOUR_SIGNER_UUID",
      "fid": 12345
    }
  }
}
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `apiKey` | Yes | Neynar API key |
| `signerUuid` | Yes | Neynar signer UUID for the agent account |
| `fid` | Yes | Farcaster ID (FID) of the agent account |
| `enabled` | No | Set `false` to disable (default: `true`) |
| `pollInterval` | No | Seconds between mention checks (default: `60`) |
| `channels` | No | Array of Farcaster channel names to monitor |
| `castIntervalMin` | No | Min minutes between autonomous casts (default: `120`) |
| `castIntervalMax` | No | Max minutes between autonomous casts (default: `240`) |

```json
{
  "connectors": {
    "farcaster": {
      "apiKey": "...",
      "signerUuid": "...",
      "fid": 12345,
      "channels": ["ai", "agents"],
      "castIntervalMin": 90,
      "castIntervalMax": 180
    }
  }
}
```

## Features

- **Casts** — Autonomous posting in the agent's voice
- **Replies** — Responds to @mentions and replies
- **Reactions** — Likes and recasts
- **Channel monitoring** — Participates in Farcaster channels (like subreddits)
- **Frames** — Can interact with Farcaster Frames (mini-apps embedded in casts)
- **On-chain identity** — Agent identity is tied to an Ethereum address
- **Direct casts** — Private DM-like messages (Warpcast feature)

## Message Flow

```
Neynar webhook or polling
       ↓
Plugin filters relevant notifications:
  - @mention in cast
  - Reply to agent's cast
  - Direct cast
       ↓
AgentRuntime processes with Farcaster context
       ↓
Response posted via Neynar API
```

## Autonomous Casting

When configured, the agent posts casts autonomously at random intervals. The LLM generates cast content based on the character's personality and current context.

Casts are limited to 320 characters. Longer responses are split into cast threads.

## Auto-Enable

The plugin auto-enables when `connectors.farcaster.apiKey` is set.

## Related

- [Twitter Plugin](/plugin-registry/platform/twitter) — Twitter/X integration
- [Discord Plugin](/plugin-registry/platform/discord) — Discord bot integration
- [Connectors Guide](/guides/connectors) — General connector documentation
