---
title: "Bootstrap Plugin"
sidebarTitle: "Bootstrap"
description: "Core message processing pipeline — message handling, response generation, conversation flow, and built-in actions."
---

The Bootstrap plugin is the foundational message processing layer for every Milaidy agent. It is loaded automatically as part of the ElizaOS core and cannot be disabled.

**Package:** `@elizaos/plugin-bootstrap` (bundled in `@elizaos/core`)

## Overview

Bootstrap registers the core conversation loop — it handles inbound messages, drives the LLM inference cycle, formats responses, and manages the flow between turns. All other plugins layer on top of the infrastructure Bootstrap provides.

## What Bootstrap Provides

### Message Processing Pipeline

Every inbound message passes through Bootstrap's pipeline:

```
Message Received
       ↓
  State Assembly     ← providers run here
       ↓
  Action Selection   ← LLM selects from registered actions
       ↓
  Action Execution   ← action handler runs
       ↓
  Response Formatting
       ↓
  Memory Storage
       ↓
  Message Sent
```

### Built-in Actions

Bootstrap registers the following built-in actions:

| Action | Description |
|--------|-------------|
| `REPLY` | Default action — generates and sends a conversational response |
| `IGNORE` | Suppresses a response (for messages the agent should not react to) |
| `CONTINUE` | Continues generating a multi-part response |
| `WAIT` | Signals the agent is waiting for more input before responding |

### Built-in Providers

| Provider | Description |
|----------|-------------|
| `time` | Injects the current date and time |
| `facts` | Injects character facts and lore |
| `messageHistory` | Injects recent conversation history |
| `entities` | Injects known entity information |
| `actions` | Injects descriptions of available actions |
| `providers` | Injects descriptions of active providers |

### Built-in Evaluators

| Evaluator | Description |
|-----------|-------------|
| `goalEvaluator` | Tracks and updates agent goals |
| `reflectionEvaluator` | Generates periodic self-reflection summaries |

## Conversation Flow

Bootstrap manages two primary flow types:

### Direct Message Flow

```
User → Agent (private message)
Agent responds to every message
```

### Group/Channel Flow

```
Users → Channel
Agent responds only when:
  - Directly mentioned (@agent)
  - Addressed by name
  - The message requires a response (LLM decision)
```

## State Assembly

Before each LLM call, Bootstrap assembles the full state by:

1. Loading conversation history from the SQL plugin
2. Running all registered providers
3. Merging provider values into the state object
4. Formatting the system prompt from the character file
5. Building the message array for the LLM

## Memory Storage

After each response, Bootstrap persists:

- The user message
- The agent response
- Action results and metadata
- Updated entity information

All persistence goes through the SQL plugin's database layer.

## Configuration

Bootstrap reads the following settings from the character file:

| Setting | Description | Default |
|---------|-------------|---------|
| `modelProvider` | LLM provider to use | Auto-detected from API keys |
| `model` | Specific model name | Provider default |
| `maxResponseLength` | Maximum characters per response | `8192` |
| `responseFormat` | `text` or `json` | `text` |

## Message Suppression

Bootstrap will suppress responses for messages that match any of:

- The message is from the agent itself
- The message is in a channel where the agent is not active
- The `IGNORE` action is selected by the LLM
- The message passes through a pre-processing gate that returns `false`

## Related

- [Knowledge Plugin](/plugin-registry/knowledge) — RAG knowledge retrieval
- [SQL Plugin](/plugin-registry/sql) — Database layer Bootstrap writes to
- [Plugin Architecture](/plugins/architecture) — How Bootstrap fits in the system
