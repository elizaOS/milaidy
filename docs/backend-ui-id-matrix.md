# Backend -> UI Integration Matrix

Generated for strict ID-level alignment between backend plugin IDs and the current skin UI mapping.

Legend:
- **Icon Source** reflects `/apps/ui/src/ui/app.ts` `appIconPath()` behavior.
- **Connect Action** reflects current UI flow (`AI Settings` vs `Markets & Apps` vs hidden/not-mapped).

## Core Plugin IDs (`plugins.json`)

| Backend ID | Category | UI Label | Icon Source | Connect Action |
|---|---|---|---|---|
| `acp` | `connector` | Acp | generated monogram icon | Markets & Apps: Connect (save required params, then enable) |
| `agent-orchestrator` | `feature` | Agent Orchestrator | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `agent-skills` | `feature` | Agent Skills | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `anthropic` | `ai-provider` | Anthropic | favicon: anthropic.com | AI Settings: Manage -> save settings -> enable provider |
| `auto-trader` | `feature` | Auto Trader | generated monogram icon | Shown in Markets & Apps only when detected as user-facing integration |
| `babylon` | `app` | Babylon | generated monogram icon | Not mapped to Markets & Apps by default (backend app plugin) |
| `blooio` | `connector` | Blooio | favicon: bloo.io | Markets & Apps: Connect (save required params, then enable) |
| `bluebubbles` | `connector` | Bluebubbles | favicon: bluebubbles.app | Markets & Apps: Connect (save required params, then enable) |
| `bluesky` | `connector` | Bluesky | favicon: bsky.app | Markets & Apps: Connect (save required params, then enable) |
| `browser` | `feature` | Browser | favicon: google.com | Shown in Markets & Apps only when detected as user-facing integration |
| `clawbal` | `app` | Clawbal | generated monogram icon | Not mapped to Markets & Apps by default (backend app plugin) |
| `cli` | `feature` | Cli | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `code` | `feature` | Code | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `coding-agent` | `feature` | Coding Agent | generated monogram icon | Shown in Markets & Apps only when detected as user-facing integration |
| `commands` | `feature` | Commands | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `computeruse` | `feature` | Computeruse | favicon: openai.com | Shown in Markets & Apps only when detected as user-facing integration |
| `copilot-proxy` | `feature` | Copilot Proxy | favicon: github.com | Shown in Markets & Apps only when detected as user-facing integration |
| `cron` | `feature` | Cron | favicon: cron.com | Shown in Markets & Apps only when detected as user-facing integration |
| `custom-rtmp` | `streaming` | Custom Rtmp | generated monogram icon | Not mapped to Markets & Apps by default (streaming module) |
| `directives` | `feature` | Directives | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `discord` | `connector` | Discord | favicon: discord.com | Markets & Apps: Connect (save required params, then enable) |
| `edge-tts` | `feature` | Edge Tts | favicon: elevenlabs.io | Not user-facing in UI (hidden system/runtime module) |
| `elevenlabs` | `feature` | Elevenlabs | favicon: elevenlabs.io | Shown in Markets & Apps only when detected as user-facing integration |
| `eliza-classic` | `feature` | Eliza Classic | generated monogram icon | Shown in Markets & Apps only when detected as user-facing integration |
| `elizacloud` | `feature` | Eliza Cloud | favicon: elizacloud.ai | Shown in Markets & Apps only when detected as user-facing integration |
| `evm` | `feature` | Evm | favicon: ethereum.org | Infra module; configured from Wallet/Runtime flows |
| `experience` | `feature` | Experience | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `farcaster` | `connector` | Farcaster | favicon: farcaster.xyz | Markets & Apps: Connect (save required params, then enable) |
| `feishu` | `connector` | Feishu | favicon: feishu.cn | Markets & Apps: Connect (save required params, then enable) |
| `form` | `feature` | Form | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `github` | `connector` | Github | favicon: github.com | Markets & Apps: Connect (save required params, then enable) |
| `gmail-watch` | `connector` | Gmail Watch | favicon: gmail.com | Markets & Apps: Connect (save required params, then enable) |
| `goals` | `feature` | Goals | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `google-chat` | `connector` | Google Chat | favicon: chat.google.com | Markets & Apps: Connect (save required params, then enable) |
| `google-genai` | `ai-provider` | Gemini | favicon: ai.google.dev | AI Settings: Manage -> save settings -> enable provider |
| `groq` | `ai-provider` | Groq | favicon: groq.com | AI Settings: Manage -> save settings -> enable provider |
| `imessage` | `connector` | Imessage | favicon: apple.com | Markets & Apps: Connect (save required params, then enable) |
| `inmemorydb` | `database` | Inmemorydb | asset: /brands/inmemorydb.svg | AI Settings: Manage memory backend -> save/toggle |
| `instagram` | `connector` | Instagram | favicon: instagram.com | Markets & Apps: Connect (save required params, then enable) |
| `iq` | `connector` | Iq | generated monogram icon | Markets & Apps: Connect (save required params, then enable) |
| `knowledge` | `feature` | Knowledge | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `line` | `connector` | Line | favicon: line.me | Markets & Apps: Connect (save required params, then enable) |
| `linear` | `feature` | Linear | favicon: line.me | Shown in Markets & Apps only when detected as user-facing integration |
| `local-ai` | `ai-provider` | Local AI | asset: /brands/local-ai.svg | AI Settings: Manage -> save settings -> enable provider |
| `local-embedding` | `feature` | Local Embedding | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `localdb` | `database` | Localdb | asset: /brands/localdb.svg | AI Settings: Manage memory backend -> save/toggle |
| `lp-manager` | `feature` | Lp Manager | generated monogram icon | Shown in Markets & Apps only when detected as user-facing integration |
| `matrix` | `connector` | Matrix | favicon: matrix.org | Markets & Apps: Connect (save required params, then enable) |
| `mattermost` | `connector` | Mattermost | asset: /brands/mattermost.svg | Markets & Apps: Connect (save required params, then enable) |
| `mcp` | `connector` | Mcp | favicon: modelcontextprotocol.io | Not user-facing in UI (hidden system/runtime module) |
| `memory` | `feature` | Memory | generated monogram icon | Infra module; configured from Wallet/Runtime flows |
| `minecraft` | `app` | Minecraft | generated monogram icon | Not mapped to Markets & Apps by default (backend app plugin) |
| `moltbook` | `feature` | Moltbook | favicon: moltbook.com | Shown in Markets & Apps only when detected as user-facing integration |
| `msteams` | `connector` | Msteams | favicon: microsoft.com | Markets & Apps: Connect (save required params, then enable) |
| `mysticism` | `feature` | Mysticism | generated monogram icon | Shown in Markets & Apps only when detected as user-facing integration |
| `n8n` | `feature` | N8n | favicon: n8n.io | Shown in Markets & Apps only when detected as user-facing integration |
| `nextcloud-talk` | `connector` | Nextcloud Talk | favicon: nextcloud.com | Markets & Apps: Connect (save required params, then enable) |
| `nostr` | `connector` | Nostr | favicon: nostr.com | Markets & Apps: Connect (save required params, then enable) |
| `ollama` | `ai-provider` | Ollama (local) | favicon: ollama.com | AI Settings: Manage -> save settings -> enable provider |
| `openai` | `ai-provider` | OpenAI | favicon: openai.com | AI Settings: Manage -> save settings -> enable provider |
| `openrouter` | `ai-provider` | OpenRouter | favicon: openrouter.ai | AI Settings: Manage -> save settings -> enable provider |
| `pdf` | `feature` | Pdf | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `personality` | `feature` | Personality | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `plugin-manager` | `feature` | Plugin Manager | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `polymarket` | `feature` | Polymarket | favicon: polymarket.com | Markets & Apps: Connect (save required params, then enable) |
| `prose` | `feature` | Prose | generated monogram icon | Shown in Markets & Apps only when detected as user-facing integration |
| `retake` | `connector` | Retake | favicon: retake.tv | Markets & Apps: Connect (save required params, then enable) |
| `rlm` | `feature` | Rlm | generated monogram icon | Shown in Markets & Apps only when detected as user-facing integration |
| `roblox` | `app` | Roblox | generated monogram icon | Not mapped to Markets & Apps by default (backend app plugin) |
| `robot-voice` | `feature` | Robot Voice | favicon: elevenlabs.io | Shown in Markets & Apps only when detected as user-facing integration |
| `rolodex` | `feature` | Rolodex | generated monogram icon | Shown in Markets & Apps only when detected as user-facing integration |
| `rss` | `feature` | Rss | favicon: rss.com | Shown in Markets & Apps only when detected as user-facing integration |
| `s3-storage` | `feature` | S3 Storage | favicon: aws.amazon.com | Shown in Markets & Apps only when detected as user-facing integration |
| `scheduling` | `feature` | Scheduling | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `scratchpad` | `feature` | Scratchpad | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `secrets-manager` | `feature` | Secrets Manager | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `shell` | `feature` | Shell | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `signal` | `connector` | Signal | favicon: signal.org | Markets & Apps: Connect (save required params, then enable) |
| `simple-voice` | `feature` | Simple Voice | favicon: elevenlabs.io | Shown in Markets & Apps only when detected as user-facing integration |
| `slack` | `connector` | Slack | favicon: slack.com | Markets & Apps: Connect (save required params, then enable) |
| `social-alpha` | `feature` | Social Alpha | generated monogram icon | Shown in Markets & Apps only when detected as user-facing integration |
| `solana` | `feature` | Solana | favicon: solana.com | Infra module; configured from Wallet/Runtime flows |
| `sql` | `database` | Sql | favicon: sqlite.org | AI Settings: Manage memory backend -> save/toggle |
| `streaming-base` | `streaming` | Streaming Base | generated monogram icon | Not mapped to Markets & Apps by default (streaming module) |
| `tee` | `feature` | Tee | generated monogram icon | Shown in Markets & Apps only when detected as user-facing integration |
| `telegram` | `connector` | Telegram | favicon: telegram.org | Markets & Apps: Connect (save required params, then enable) |
| `tlon` | `connector` | Tlon | favicon: tlon.io | Markets & Apps: Connect (save required params, then enable) |
| `todo` | `feature` | Todo | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `trajectory-logger` | `feature` | Trajectory Logger | generated monogram icon | Shown in Markets & Apps only when detected as user-facing integration |
| `trust` | `feature` | Trust | generated monogram icon | Not user-facing in UI (hidden system/runtime module) |
| `tts` | `feature` | Tts | favicon: elevenlabs.io | Shown in Markets & Apps only when detected as user-facing integration |
| `twilio` | `connector` | Twilio | favicon: twilio.com | Markets & Apps: Connect (save required params, then enable) |
| `twitch` | `connector` | Twitch | favicon: twitch.tv | Markets & Apps: Connect (save required params, then enable) |
| `twitch-streaming` | `streaming` | Twitch Streaming | favicon: twitch.tv | Not mapped to Markets & Apps by default (streaming module) |
| `twitter` | `connector` | X | favicon: x.com | Markets & Apps: Connect (save required params, then enable) |
| `vercel-ai-gateway` | `ai-provider` | Vercel AI Gateway | favicon: vercel.com | AI Settings: Manage -> save settings -> enable provider |
| `vision` | `feature` | Vision | generated monogram icon | Shown in Markets & Apps only when detected as user-facing integration |
| `webhooks` | `feature` | Webhooks | favicon: webhook.site | Shown in Markets & Apps only when detected as user-facing integration |
| `whatsapp` | `connector` | Whatsapp | favicon: whatsapp.com | Markets & Apps: Connect (save required params, then enable) |
| `x402` | `feature` | X402 | favicon: x402.org | Shown in Markets & Apps only when detected as user-facing integration |
| `xai` | `ai-provider` | xAI (Grok) | favicon: x.ai | AI Settings: Manage -> save settings -> enable provider |
| `youtube-streaming` | `streaming` | Youtube Streaming | generated monogram icon | Not mapped to Markets & Apps by default (streaming module) |
| `zalo` | `connector` | Zalo | asset: /brands/zalo.svg | Markets & Apps: Connect (save required params, then enable) |
| `zalouser` | `connector` | Zalouser | asset: /brands/zalo.svg | Markets & Apps: Connect (save required params, then enable) |

## Virtual / Alias Provider IDs (from onboarding/subscription flows)

| Backend ID | Category | UI Label | Icon Source | Connect Action |
|---|---|---|---|---|
| `anthropic-subscription` | `virtual-ai-provider` | Anthropic Subscription | favicon: anthropic.com | AI Settings: Start login / Finish login / Save setup token |
| `openai-subscription` | `virtual-ai-provider` | OpenAI Subscription | favicon: openai.com | AI Settings: Start login / Finish login (maps backend openai-codex) |
| `openai-codex` | `backend-subscription-id` | OpenAI Subscription | favicon: openai.com | Backend auth/status id; canonically mapped to openai-subscription in UI |
| `pi-ai` | `virtual-ai-provider` | Pi Credentials (pi-ai) | favicon: pi.ai | AI Settings: enable + local ~/.pi credentials |
| `deepseek` | `virtual-ai-provider` | DeepSeek | favicon: deepseek.com | AI Settings: Manage -> set DEEPSEEK_API_KEY |
| `mistral` | `virtual-ai-provider` | Mistral | favicon: mistral.ai | AI Settings: Manage -> set MISTRAL_API_KEY |
| `together` | `virtual-ai-provider` | Together AI | favicon: together.ai | AI Settings: Manage -> set TOGETHER_API_KEY |
| `zai` | `virtual-ai-provider` | z.ai (GLM Coding Plan) | favicon: z.ai | AI Settings: Manage -> set ZAI_API_KEY |

## Notes for mismatch triage

- `twitter` is labeled **X** in Markets & Apps.
- `openai-codex` is backend subscription ID; UI canonicalizes it to `openai-subscription`.
- Unknown/unmapped connectors intentionally render as generated monogram icons (no cross-brand fallback).
