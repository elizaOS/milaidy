---
title: "Onboarding API"
sidebarTitle: "Onboarding"
description: "REST API endpoints for the first-run onboarding flow — checking status, fetching setup options, and submitting the initial agent configuration."
---

The onboarding API drives the first-run setup wizard. It lets you check whether the agent has been configured, retrieve available provider and style options, and submit the initial configuration (agent name, personality, AI provider, connectors, etc.).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/onboarding/status` | Check if onboarding has been completed |
| GET | `/api/onboarding/options` | Retrieve available names, styles, providers, and models |
| POST | `/api/onboarding` | Submit the initial agent configuration |

---

### GET /api/onboarding/status

Returns whether the initial setup has been completed. Onboarding is considered complete when a config file exists and the `agents` section is populated.

**Response**

```json
{
  "complete": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `complete` | boolean | `true` if the config file exists and contains an agents section |

---

### GET /api/onboarding/options

Returns the available options for the onboarding wizard — random name suggestions, style presets, AI provider choices, cloud provider options, model selections, and inventory/RPC provider options.

**Response**

```json
{
  "names": ["Aurora", "Luna", "Nyx", "Selene", "Nova"],
  "styles": [
    {
      "id": "milady",
      "label": "Milady",
      "description": "Classic milady persona"
    }
  ],
  "providers": [
    {
      "id": "openai",
      "label": "OpenAI",
      "envKey": "OPENAI_API_KEY"
    }
  ],
  "cloudProviders": [
    {
      "id": "elizacloud",
      "label": "ElizaOS Cloud"
    }
  ],
  "models": [
    {
      "id": "openai/gpt-5-mini",
      "label": "GPT-5 Mini"
    }
  ],
  "inventoryProviders": [
    {
      "id": "evm",
      "label": "EVM",
      "rpcProviders": [
        {
          "id": "alchemy",
          "label": "Alchemy",
          "envKey": "ALCHEMY_API_KEY"
        }
      ]
    }
  ],
  "sharedStyleRules": "Keep responses brief. Be helpful and concise."
}
```

---

### POST /api/onboarding

Submit the initial agent configuration. Creates or updates the Milady config file with the agent's name, personality, AI provider credentials, connector tokens, and theme preferences. The agent will be restarted with the new configuration.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Agent display name |
| `bio` | string[] | No | Short biography lines |
| `systemPrompt` | string | No | System prompt for the agent |
| `style` | object | No | Style rules — `{ all?: string[], chat?: string[], post?: string[] }` |
| `adjectives` | string[] | No | Personality adjectives |
| `topics` | string[] | No | Topics the agent knows about |
| `postExamples` | string[] | No | Example social media posts |
| `messageExamples` | array | No | Example message conversations |
| `theme` | string | No | UI theme — `milady`, `qt314`, `web2000`, `programmer`, `haxor`, or `psycho` |
| `runMode` | string | No | `local` or `cloud` (defaults to `local`) |
| `provider` | string | No | AI provider ID (e.g. `openai`, `anthropic`, `anthropic-subscription`) |
| `providerApiKey` | string | No | API key for the selected provider |
| `cloudProvider` | string | No | Cloud provider ID when `runMode` is `cloud` |
| `smallModel` | string | No | Small model override (e.g. `openai/gpt-5-mini`) |
| `largeModel` | string | No | Large model override (e.g. `anthropic/claude-sonnet-4.5`) |
| `sandboxMode` | string | No | Sandbox isolation level — `off`, `light`, `standard`, or `max` |
| `telegramToken` | string | No | Telegram bot token |
| `discordToken` | string | No | Discord bot token |
| `whatsappSessionPath` | string | No | WhatsApp session path |
| `twilioAccountSid` | string | No | Twilio account SID |
| `twilioAuthToken` | string | No | Twilio auth token |
| `twilioPhoneNumber` | string | No | Twilio phone number |
| `blooioApiKey` | string | No | Bloo.io API key |
| `blooioPhoneNumber` | string | No | Bloo.io phone number |
| `inventoryProviders` | array | No | RPC/inventory provider configs — `[{ chain, rpcProvider, rpcApiKey }]` |

**Response**

```json
{
  "ok": true
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| 400 | Missing or invalid agent name |
| 400 | Invalid `runMode` value |
| 500 | Failed to save configuration |
