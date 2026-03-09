---
title: Plugin Setup Guide
description: Comprehensive setup instructions for Milady connector, AI provider, and streaming plugins.
---

# Plugin Setup Guide — Milady AI

Comprehensive setup instructions for all connector, AI provider, and streaming plugins.
When users ask how to set up a plugin, use this guide: give them the exact env var names,
where to get the credentials, minimum required fields, and tips for optional fields.

---

## AI Providers

### OpenAI
**Get credentials:** https://platform.openai.com/api-keys
**Minimum required:** `OPENAI_API_KEY` (starts with `sk-`)
**Variables:**
- `OPENAI_API_KEY` — Your secret API key from platform.openai.com
- `OPENAI_BASE_URL` — Leave blank for OpenAI default; set to a proxy URL if using a custom endpoint
- `OPENAI_SMALL_MODEL` — e.g. `gpt-4o-mini` (used for fast/cheap tasks)
- `OPENAI_LARGE_MODEL` — e.g. `gpt-4o` (used for complex reasoning)
- `OPENAI_EMBEDDING_MODEL` — e.g. `text-embedding-3-small` (for semantic search)
- `OPENAI_TTS_MODEL` / `OPENAI_TTS_VOICE` — e.g. `tts-1` / `alloy` (for voice synthesis)
- `OPENAI_IMAGE_DESCRIPTION_MODEL` — e.g. `gpt-4o` (for image understanding)
**Tips:** OpenAI is the default fallback for most features. If you have credits, set this first. Use `gpt-4o-mini` as small model to save costs.

### Anthropic
**Get credentials:** https://console.anthropic.com/settings/keys
**Minimum required:** `ANTHROPIC_API_KEY` (starts with `sk-ant-`)
**Variables:**
- `ANTHROPIC_API_KEY` — Your secret key from console.anthropic.com
- `ANTHROPIC_SMALL_MODEL` — e.g. `claude-haiku-4-5-20251001`
- `ANTHROPIC_LARGE_MODEL` — e.g. `claude-sonnet-4-6`
- `ANTHROPIC_BROWSER_BASE_URL` — (Advanced) Proxy URL for browser-side requests
**Tips:** Best for complex reasoning and long context. Claude Haiku is very fast for the small model slot.

### Google Gemini
**Get credentials:** https://aistudio.google.com/app/apikey
**Minimum required:** `GOOGLE_GENERATIVE_AI_API_KEY`
**Variables:**
- `GOOGLE_GENERATIVE_AI_API_KEY` — From AI Studio or Google Cloud
- `GOOGLE_SMALL_MODEL` — e.g. `gemini-2.0-flash`
- `GOOGLE_LARGE_MODEL` — e.g. `gemini-2.0-pro`
- `GOOGLE_EMBEDDING_MODEL` — e.g. `text-embedding-004`
- `GOOGLE_IMAGE_MODEL` — e.g. `imagen-3.0-generate-002`
**Tips:** Gemini Flash is fast and cheap; great for small model. The free tier is generous.

### Groq
**Get credentials:** https://console.groq.com/keys
**Minimum required:** `GROQ_API_KEY`
**Variables:**
- `GROQ_API_KEY` — From console.groq.com
- `GROQ_SMALL_MODEL` — e.g. `llama-3.1-8b-instant`
- `GROQ_LARGE_MODEL` — e.g. `llama-3.3-70b-versatile`
- `GROQ_TTS_MODEL` / `GROQ_TTS_VOICE` — e.g. `playai-tts` / `Fritz-PlayAI`
**Tips:** Groq is extremely fast inference — great for latency-sensitive use cases. Free tier available. Supports TTS via PlayAI voices.

### OpenRouter
**Get credentials:** https://openrouter.ai/keys
**Minimum required:** `OPENROUTER_API_KEY`
**Variables:**
- `OPENROUTER_API_KEY` — From openrouter.ai/keys
- `OPENROUTER_SMALL_MODEL` — e.g. `openai/gpt-4o-mini` or `meta-llama/llama-3.3-70b`
- `OPENROUTER_LARGE_MODEL` — e.g. `anthropic/claude-3.5-sonnet`
- `OPENROUTER_IMAGE_MODEL` — e.g. `openai/gpt-4o` (for vision tasks)
- `OPENROUTER_IMAGE_GENERATION_MODEL` — e.g. `openai/dall-e-3`
- `OPENROUTER_EMBEDDING_MODEL` — e.g. `openai/text-embedding-3-small`
- `OPENROUTER_TOOL_EXECUTION_MAX_STEPS` — Max tool call steps per turn (default: 5)
**Tips:** OpenRouter gives you access to 200+ models through one API key. Great if you want to switch models without managing multiple accounts. Use model IDs in `provider/model-name` format.

### xAI (Grok)
**Get credentials:** https://console.x.ai/
**Minimum required:** `XAI_API_KEY`
**Variables:**
- `XAI_API_KEY` — From console.x.ai
- `XAI_MODEL` — e.g. `grok-2-1212` (overrides small/large)
- `XAI_SMALL_MODEL` / `XAI_LARGE_MODEL` — Specific model slots
- `XAI_EMBEDDING_MODEL` — e.g. `v1`
- `X_AUTH_MODE` — `api_key` (default) or `oauth`
- `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` — Twitter OAuth keys (for the X connector side of xAI)
- `X_ENABLE_POST`, `X_ENABLE_REPLIES`, `X_ENABLE_ACTIONS` — Toggle X/Twitter behaviors
**Tips:** xAI = Grok models. The `X_*` vars are for the Twitter integration bundled with xAI. Keep auth mode as `api_key` unless you need OAuth.

### Ollama (Local Models)
**Get credentials:** No API key needed — install Ollama locally
**Setup:** https://ollama.ai — run `ollama pull llama3.2` to download a model
**Minimum required:** `OLLAMA_API_ENDPOINT` = `http://localhost:11434/api`
**Variables:**
- `OLLAMA_API_ENDPOINT` — Default: `http://localhost:11434/api`
- `OLLAMA_SMALL_MODEL` — e.g. `llama3.2:3b`
- `OLLAMA_MEDIUM_MODEL` — e.g. `llama3.2`
- `OLLAMA_LARGE_MODEL` — e.g. `llama3.3:70b`
- `OLLAMA_EMBEDDING_MODEL` — e.g. `nomic-embed-text`
**Tips:** Completely free and private. Requires Ollama running on your machine or a server. Pull models with `ollama pull <model>`. For embeddings use `nomic-embed-text`.

### Local AI
**Get credentials:** No API key — uses local model files
**Variables:**
- `MODELS_DIR` — Path to your local model files (e.g. `/Users/you/models`)
- `CACHE_DIR` — Path for caching (e.g. `/tmp/ai-cache`)
- `LOCAL_SMALL_MODEL` / `LOCAL_LARGE_MODEL` — Model filenames in MODELS_DIR
- `LOCAL_EMBEDDING_MODEL` / `LOCAL_EMBEDDING_DIMENSIONS` — Embedding model and its dimension count
- `CUDA_VISIBLE_DEVICES` — GPU selection, e.g. `0` for first GPU
**Tips:** Use when you have .gguf or similar model files and want full offline operation.

### Vercel AI Gateway
**Get credentials:** https://vercel.com/docs/ai/ai-gateway
**Minimum required:** `AI_GATEWAY_API_KEY` and `AI_GATEWAY_BASE_URL`
**Variables:**
- `AI_GATEWAY_API_KEY` / `AIGATEWAY_API_KEY` — Your gateway key (either works)
- `VERCEL_OIDC_TOKEN` — For Vercel-hosted deployments only
- `AI_GATEWAY_BASE_URL` — Your gateway endpoint URL
- `AI_GATEWAY_SMALL_MODEL` / `AI_GATEWAY_LARGE_MODEL` / `AI_GATEWAY_EMBEDDING_MODEL` — Model IDs
- `AI_GATEWAY_IMAGE_MODEL` — For image generation
- `AI_GATEWAY_TIMEOUT_MS` — Request timeout, default 30000ms
**Tips:** Routes model calls through Vercel's AI gateway for caching, rate limiting, and observability. Useful if you're already on Vercel.

---

## Connectors

### Discord
**Get credentials:** https://discord.com/developers/applications → New Application → Bot → Reset Token
**Minimum required:** `DISCORD_API_TOKEN` + `DISCORD_APPLICATION_ID`
**Variables:**
- `DISCORD_API_TOKEN` — Bot token (from Bot section, click Reset Token)
- `DISCORD_APPLICATION_ID` — Application ID (from General Information)
- `CHANNEL_IDS` — Comma-separated channel IDs to listen in
- `DISCORD_VOICE_CHANNEL_ID` — For voice channel support
- `DISCORD_SHOULD_IGNORE_BOT_MESSAGES` — `true` to prevent bot-to-bot loops
- `DISCORD_SHOULD_IGNORE_DIRECT_MESSAGES` — `true` to disable DM responses
- `DISCORD_SHOULD_RESPOND_ONLY_TO_MENTIONS` — `true` to only respond when @mentioned
- `DISCORD_LISTEN_CHANNEL_IDS` — Channel IDs to listen but not post unsolicited
**Setup steps:**
1. Create app at discord.com/developers/applications
2. Go to Bot tab → Reset Token (copy immediately)
3. Get Application ID from General Information tab
4. Under OAuth2 → URL Generator → Bot → select permissions: Send Messages, Read Messages, Use Slash Commands
5. Invite bot using generated URL
6. Enable Message Content Intent under Bot → Privileged Gateway Intents
**Tips:** You need BOTH the Bot Token AND Application ID — without Application ID slash commands won't register. Right-click a channel and Copy ID to get channel IDs (enable Developer Mode in Discord settings first).

### Telegram
**Get credentials:** Message @BotFather on Telegram
**Minimum required:** `TELEGRAM_BOT_TOKEN`
**Variables:**
- `TELEGRAM_BOT_TOKEN` — From @BotFather after `/newbot`
- `TELEGRAM_ALLOWED_CHATS` — JSON array of allowed chat IDs, e.g. `["123456789", "-100987654321"]`
- `TELEGRAM_API_ROOT` — Leave blank for default; set if using a Telegram proxy
- `TELEGRAM_TEST_CHAT_ID` — For testing (advanced)
**Setup steps:**
1. Message @BotFather: `/newbot`
2. Give it a name and username
3. Copy the token it gives you
4. To get your chat ID: message @userinfobot
**Tips:** Use negative IDs for groups (they start with -100). Use `TELEGRAM_ALLOWED_CHATS` to restrict who can talk to the bot for safety.

### Twitter / X
**Get credentials:** https://developer.twitter.com/en/portal/dashboard
**Minimum required:** All 4 OAuth keys: `TWITTER_API_KEY`, `TWITTER_API_SECRET_KEY`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`
**Variables:**
- `TWITTER_API_KEY` — Consumer API Key
- `TWITTER_API_SECRET_KEY` — Consumer API Secret
- `TWITTER_ACCESS_TOKEN` — Access Token (from "Keys and Tokens" tab)
- `TWITTER_ACCESS_TOKEN_SECRET` — Access Token Secret
- `TWITTER_DRY_RUN` — `true` to test without actually posting
- `TWITTER_POST_ENABLE` — `true` to enable autonomous posting
- `TWITTER_POST_INTERVAL_MIN` / `TWITTER_POST_INTERVAL_MAX` — Minutes between posts (e.g. 90/180)
- `TWITTER_POST_IMMEDIATELY` — `true` to post on startup
- `TWITTER_AUTO_RESPOND_MENTIONS` — `true` to reply to @mentions
- `TWITTER_POLL_INTERVAL` — Seconds between mention checks (e.g. 120)
- `TWITTER_SEARCH_ENABLE` / `TWITTER_ENABLE_TIMELINE` / `TWITTER_ENABLE_DISCOVERY` — Advanced engagement modes
**Setup steps:**
1. Apply for developer account at developer.twitter.com (instant for basic tier)
2. Create a Project and App
3. Generate all 4 keys from "Keys and Tokens" tab
4. Set app permissions to Read and Write
5. Regenerate tokens AFTER setting permissions
**Tips:** Start with `TWITTER_DRY_RUN=true` to verify without posting. Free API tier has 500 posts/month. You need ALL 4 OAuth keys — missing any one will cause auth failure.

### Slack
**Get credentials:** https://api.slack.com/apps → Create New App
**Minimum required:** `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN`
**Variables:**
- `SLACK_BOT_TOKEN` — Starts with `xoxb-` (from OAuth & Permissions → Bot Token)
- `SLACK_APP_TOKEN` — Starts with `xapp-` (from Basic Information → App-Level Tokens; scope: `connections:write`)
- `SLACK_SIGNING_SECRET` — From Basic Information (for webhook verification)
- `SLACK_USER_TOKEN` — Starts with `xoxp-` (optional, for user-level actions)
- `SLACK_CHANNEL_IDS` — Comma-separated channel IDs, e.g. `C01ABCDEF,C02GHIJKL`
- `SLACK_SHOULD_IGNORE_BOT_MESSAGES` — Prevent bot loops
- `SLACK_SHOULD_RESPOND_ONLY_TO_MENTIONS` — Only reply when @mentioned
**Setup steps:**
1. Create app at api.slack.com/apps (From Scratch → choose workspace)
2. Socket Mode: Enable Socket Mode → generate App-Level Token with `connections:write` scope
3. Bot Token Scopes (OAuth & Permissions): `chat:write`, `channels:read`, `channels:history`, `groups:history`, `im:history`, `app_mentions:read`
4. Install app to workspace → copy Bot Token
5. Enable Event Subscriptions → Subscribe to bot events: `message.channels`, `message.im`, `app_mention`
**Tips:** Socket Mode means you DON'T need a public webhook URL. Both Bot Token (xoxb-) AND App Token (xapp-) are required for Socket Mode. To get channel IDs: right-click channel in Slack → Copy link, the ID is in the URL.

### WhatsApp
**Two modes — choose one:**

**Mode 1: Cloud API (Business, recommended)**
**Get credentials:** https://developers.facebook.com/apps → WhatsApp → API Setup
- `WHATSAPP_ACCESS_TOKEN` — Permanent system user token from Meta Business
- `WHATSAPP_PHONE_NUMBER_ID` — From WhatsApp → API Setup
- `WHATSAPP_BUSINESS_ACCOUNT_ID` — From WhatsApp Business settings
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — Any string you choose (used to verify webhook)
- `WHATSAPP_API_VERSION` — e.g. `v18.0` (use latest)
**Setup:** Need Meta Business account, verified phone number, approved WhatsApp Business App

**Mode 2: Baileys (Personal, QR code)**
- `WHATSAPP_AUTH_DIR` — Directory to store session files, e.g. `/data/whatsapp-auth`
- No other credentials needed — it scans a QR code on first run
**Tips:** Baileys mode works with your personal WhatsApp number but violates ToS. Use Cloud API for production. Cloud API requires a real business and Meta app approval.

### Instagram
**Get credentials:** Use your Instagram account credentials
**Minimum required:** `INSTAGRAM_USERNAME` + `INSTAGRAM_PASSWORD`
**Variables:**
- `INSTAGRAM_USERNAME` — Your Instagram username
- `INSTAGRAM_PASSWORD` — Your Instagram password
- `INSTAGRAM_VERIFICATION_CODE` — Your 2FA code if enabled
- `INSTAGRAM_PROXY` — Proxy URL if rate limited or blocked
**Tips:** ⚠️ Uses unofficial API. Instagram frequently blocks automated access. Use a dedicated account, not your personal one. A proxy reduces bans. 2FA users must supply the code on startup.

### Bluesky
**Get credentials:** https://bsky.app → Settings → App Passwords
**Minimum required:** `BLUESKY_HANDLE` + `BLUESKY_PASSWORD` (app password, not your real password)
**Variables:**
- `BLUESKY_HANDLE` — Your handle e.g. `yourname.bsky.social`
- `BLUESKY_PASSWORD` — App password (not your login password — create one in Settings)
- `BLUESKY_ENABLED` — `true` to enable
- `BLUESKY_SERVICE` — Default: `https://bsky.social` (only change for self-hosted PDS)
- `BLUESKY_ENABLE_POSTING` — `true` for autonomous posts
- `BLUESKY_POST_INTERVAL_MIN` / `BLUESKY_POST_INTERVAL_MAX` — Seconds between posts
- `BLUESKY_MAX_POST_LENGTH` — Max characters per post (default: 300)
- `BLUESKY_POLL_INTERVAL` — Seconds between checking mentions/DMs
- `BLUESKY_ENABLE_DMS` — `true` to respond to direct messages
**Tips:** Create an App Password at bsky.app → Settings → App Passwords. Never use your main login password.

### Farcaster
**Get credentials:** https://warpcast.com → Settings, then https://neynar.com for API
**Minimum required:** `FARCASTER_FID` + `FARCASTER_SIGNER_UUID` + `FARCASTER_NEYNAR_API_KEY`
**Variables:**
- `FARCASTER_FID` — Your Farcaster ID (number shown in profile URL)
- `FARCASTER_SIGNER_UUID` — Signer UUID from Neynar dashboard
- `FARCASTER_NEYNAR_API_KEY` — From neynar.com (needed for read/write)
- `ENABLE_CAST` — `true` to enable autonomous casting
- `CAST_INTERVAL_MIN` / `CAST_INTERVAL_MAX` — Minutes between casts
- `MAX_CAST_LENGTH` — Default 320 characters
- `FARCASTER_POLL_INTERVAL` — Seconds between notification checks
- `FARCASTER_HUB_URL` — Custom Farcaster hub (advanced, leave blank for default)
**Setup steps:**
1. Create Warpcast account, get your FID from your profile URL
2. Sign up at neynar.com, create a signer for your FID
3. Get your API key from Neynar dashboard
**Tips:** Neynar is required — it's the indexer that makes Farcaster data accessible via API.

### GitHub
**Get credentials:** https://github.com/settings/tokens → Fine-grained or Classic
**Minimum required:** `GITHUB_API_TOKEN`
**Variables:**
- `GITHUB_API_TOKEN` — Personal access token or GitHub App token
- `GITHUB_OWNER` — Repository owner (username or org)
- `GITHUB_REPO` — Repository name
- `GITHUB_BRANCH` — Default branch (e.g. `main`)
- `GITHUB_WEBHOOK_SECRET` — For GitHub App webhook verification
- `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_INSTALLATION_ID` — For GitHub Apps
**Tips:** Fine-grained tokens are more secure — scope only to the repos you need. For org repos, you may need to request access from the org.

### Twitch
**Get credentials:** https://dev.twitch.tv/console/apps → Register Your Application
**Minimum required:** `TWITCH_USERNAME` + `TWITCH_CLIENT_ID` + `TWITCH_ACCESS_TOKEN` + `TWITCH_CLIENT_SECRET`
**Variables:**
- `TWITCH_USERNAME` — Your Twitch bot username
- `TWITCH_CLIENT_ID` — From Twitch Developer Console
- `TWITCH_CLIENT_SECRET` — From Twitch Developer Console
- `TWITCH_ACCESS_TOKEN` — OAuth token (get via https://twitchapps.com/tmi/ or Twitch OAuth flow)
- `TWITCH_REFRESH_TOKEN` — For long-lived sessions
- `TWITCH_CHANNEL` — Primary channel to join (e.g. `mychannel`)
- `TWITCH_CHANNELS` — Additional channels (comma-separated)
- `TWITCH_REQUIRE_MENTION` — `true` to only respond when bot username is mentioned
- `TWITCH_ALLOWED_ROLES` — `broadcaster`, `moderator`, `vip`, `subscriber`, `viewer`
**Tips:** Create a separate Twitch account for the bot. Use https://twitchapps.com/tmi/ to get an access token for chat bots quickly.

### Twilio (SMS + Voice)
**Get credentials:** https://console.twilio.com
**Minimum required:** `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_PHONE_NUMBER`
**Variables:**
- `TWILIO_ACCOUNT_SID` — From Twilio Console dashboard (starts with `AC`)
- `TWILIO_AUTH_TOKEN` — From Twilio Console dashboard
- `TWILIO_PHONE_NUMBER` — Your Twilio number in E.164 format (e.g. `+15551234567`)
- `TWILIO_WEBHOOK_URL` — Your publicly accessible URL for incoming messages
- `TWILIO_WEBHOOK_PORT` — Port to listen on (if self-hosting, default 3000)
- `VOICE_CALL_PROVIDER` — e.g. `twilio`
- `VOICE_CALL_FROM_NUMBER` — Outbound caller ID
- `VOICE_CALL_TO_NUMBER` — Default number to call
- `VOICE_CALL_PUBLIC_URL` — Publicly accessible URL for voice webhooks
- `VOICE_CALL_MAX_DURATION_SECONDS` — Max call length (default 3600)
- `VOICE_CALL_INBOUND_POLICY` — `allow-all`, `allow-from`, or `deny-all`
- `VOICE_CALL_INBOUND_GREETING` — Text spoken when call is answered
**Tips:** For webhooks to work, Twilio needs a public URL. Use ngrok during development. Get a phone number in Console → Phone Numbers → Buy a Number. Free trial gives ~$15 credit.

### Matrix
**Get credentials:** Your Matrix homeserver account
**Minimum required:** `MATRIX_HOMESERVER` + `MATRIX_USER_ID` + `MATRIX_ACCESS_TOKEN`
**Variables:**
- `MATRIX_HOMESERVER` — e.g. `https://matrix.org` or your own homeserver
- `MATRIX_USER_ID` — e.g. `@yourbot:matrix.org`
- `MATRIX_ACCESS_TOKEN` — From Element: Settings → Help & About → Advanced → Access Token
- `MATRIX_DEVICE_ID` — Leave blank to auto-assign
- `MATRIX_ROOMS` — Comma-separated room IDs (e.g. `!abc123:matrix.org`)
- `MATRIX_AUTO_JOIN` — `true` to auto-join invite rooms
- `MATRIX_ENCRYPTION` — `true` to enable E2E encryption (requires more setup)
- `MATRIX_REQUIRE_MENTION` — `true` to only respond when @mentioned
**Tips:** Get your access token in Element → Settings → Help & About → Advanced. Matrix IDs use format `@user:server`.

### Microsoft Teams
**Get credentials:** https://portal.azure.com → Azure Active Directory → App Registrations
**Minimum required:** `MSTEAMS_APP_ID` + `MSTEAMS_APP_PASSWORD` + `MSTEAMS_TENANT_ID`
**Variables:**
- `MSTEAMS_APP_ID` — Application (client) ID from Azure portal
- `MSTEAMS_APP_PASSWORD` — Client secret value from Azure portal
- `MSTEAMS_TENANT_ID` — Your Azure AD tenant ID
- `MSTEAMS_WEBHOOK_PORT` / `MSTEAMS_WEBHOOK_PATH` — Where Bot Framework sends messages
- `MSTEAMS_ALLOWED_TENANTS` — Restrict to specific tenants (comma-separated)
- `MSTEAMS_SHAREPOINT_SITE_ID` — For SharePoint integration (advanced)
- `MSTEAMS_MEDIA_MAX_MB` — Max file upload size (default 25MB)
**Setup steps:**
1. Register app in Azure portal → App Registrations → New Registration
2. Add a client secret under Certificates & Secrets
3. Register bot via https://dev.botframework.com → Create a bot
4. Connect bot to Microsoft Teams channel in Bot Framework portal
**Tips:** Requires Microsoft 365 admin access or an org that allows app registrations.

### Google Chat
**Get credentials:** https://console.cloud.google.com → APIs → Google Chat API
**Minimum required:** Service account JSON or `GOOGLE_APPLICATION_CREDENTIALS` path
**Variables:**
- `GOOGLE_CHAT_SERVICE_ACCOUNT` — Full service account JSON (paste the entire JSON)
- `GOOGLE_CHAT_SERVICE_ACCOUNT_FILE` — Path to service account JSON file
- `GOOGLE_APPLICATION_CREDENTIALS` — Alternative: path to credentials file
- `GOOGLE_CHAT_SPACES` — Comma-separated space names (e.g. `spaces/AAAA_space_id`)
- `GOOGLE_CHAT_AUDIENCE_TYPE` — `PUBLISHED` or `DOMAIN_INSTALL`
- `GOOGLE_CHAT_AUDIENCE` — Your app's audience URL
- `GOOGLE_CHAT_WEBHOOK_PATH` — Webhook path for incoming messages
- `GOOGLE_CHAT_REQUIRE_MENTION` — `true` to require @mention
- `GOOGLE_CHAT_BOT_USER` — Bot user ID
**Tips:** Enable Google Chat API in Cloud Console. Create a service account with Chat-scope permissions. Workspace admin must approve the Chat app.

### Signal
**Get credentials:** Your own phone number + signal-cli or signal-api-rest-api
**Minimum required:** `SIGNAL_ACCOUNT_NUMBER` + `SIGNAL_HTTP_URL`
**Variables:**
- `SIGNAL_ACCOUNT_NUMBER` — Your phone number in E.164 format (e.g. `+15551234567`)
- `SIGNAL_HTTP_URL` — REST API URL, e.g. `http://localhost:8080`
- `SIGNAL_CLI_PATH` — Path to signal-cli binary (optional, for direct CLI mode)
- `SIGNAL_SHOULD_IGNORE_GROUP_MESSAGES` — `true` to ignore group chats
**Setup:** Run signal-api-rest-api server: https://github.com/bbernhard/signal-cli-rest-api
**Tips:** Signal doesn't have an official API. Use bbernhard/signal-cli-rest-api Docker image — it handles the signal-cli connection and exposes a REST API.

### iMessage (macOS only)
**Get credentials:** macOS only — no credentials needed, uses local Messages.app
**Variables:**
- `IMESSAGE_CLI_PATH` — Path to imessage-reader CLI (install from GitHub)
- `IMESSAGE_DB_PATH` — Path to Messages chat.db (default: `~/Library/Messages/chat.db`)
- `IMESSAGE_POLL_INTERVAL_MS` — How often to check for new messages (default: 5000ms)
- `IMESSAGE_DM_POLICY` — `allow-all` or `allow-from`
- `IMESSAGE_GROUP_POLICY` — `allow-all`, `allow-from`, or `deny-all`
- `IMESSAGE_ALLOW_FROM` — Comma-separated allowed senders
- `IMESSAGE_ENABLED` — `true` to enable
**Tips:** macOS only. Requires Full Disk Access permission for the app to read the Messages database. Only works on the machine that has iMessage configured.

### BlueBubbles (iMessage from any platform)
**Get credentials:** Install BlueBubbles server on a Mac: https://bluebubbles.app
**Minimum required:** `BLUEBUBBLES_SERVER_URL` + `BLUEBUBBLES_PASSWORD`
**Variables:**
- `BLUEBUBBLES_SERVER_URL` — Your BlueBubbles server URL (e.g. `http://your-mac:1234`)
- `BLUEBUBBLES_PASSWORD` — Password set in BlueBubbles server settings
- `BLUEBUBBLES_WEBHOOK_PATH` — Path for incoming webhooks
- `BLUEBUBBLES_DM_POLICY` / `BLUEBUBBLES_GROUP_POLICY` — `allow-all` or `allow-from`
- `BLUEBUBBLES_ALLOW_FROM` / `BLUEBUBBLES_GROUP_ALLOW_FROM` — Allowed contacts (comma-separated)
- `BLUEBUBBLES_SEND_READ_RECEIPTS` — Whether to mark messages as read
**Tips:** BlueBubbles requires a Mac with iMessage set up acting as the server. You access it from any device. Install the server app from bluebubbles.app.

### Blooio (SMS via API)
**Get credentials:** https://bloo.io
**Minimum required:** `BLOOIO_API_KEY`
**Variables:**
- `BLOOIO_API_KEY` — From bloo.io dashboard
- `BLOOIO_WEBHOOK_URL` — Your public URL for incoming SMS webhooks
- `BLOOIO_WEBHOOK_SECRET` — Secret for webhook signature verification
- `BLOOIO_BASE_URL` — bloo.io API base URL (leave as default)
- `BLOOIO_FROM_NUMBER` — Phone number to send from
- `BLOOIO_WEBHOOK_PORT` — Port for webhook listener
**Tips:** Blooio bridges iMessage/SMS. Requires a Mac running the Blooio app.

### Nostr
**Get credentials:** Generate your own keypair using any Nostr client
**Minimum required:** `NOSTR_PRIVATE_KEY`
**Variables:**
- `NOSTR_PRIVATE_KEY` — Your nsec private key (hex format)
- `NOSTR_RELAYS` — Comma-separated relay URLs, e.g. `wss://relay.damus.io,wss://relay.nostr.band`
- `NOSTR_DM_POLICY` — `allow-all` or `allow-from`
- `NOSTR_ALLOW_FROM` — Allowed public keys (npub format)
- `NOSTR_ENABLED` — `true` to enable
**Tips:** Generate keys with any Nostr app (Damus, Primal, Amethyst). Keep private key secret — it's your identity. Use multiple relays for reliability.

### LINE
**Get credentials:** https://developers.line.biz/console
**Minimum required:** `LINE_CHANNEL_ACCESS_TOKEN` + `LINE_CHANNEL_SECRET`
**Variables:**
- `LINE_CHANNEL_ACCESS_TOKEN` — From LINE Developers console → Messaging API → Channel Access Token
- `LINE_CHANNEL_SECRET` — From Basic Settings tab
- `LINE_WEBHOOK_PATH` — Webhook URL path (configure in LINE console too)
- `LINE_DM_POLICY` / `LINE_GROUP_POLICY` — `allow-all` or `allow-from`
- `LINE_ALLOW_FROM` — Allowed user IDs
- `LINE_ENABLED` — `true` to enable
**Setup steps:**
1. Create a channel at developers.line.biz
2. Issue a channel access token (long-lived, in Messaging API tab)
3. Set your webhook URL in the console
**Tips:** LINE requires your webhook to be HTTPS with a valid certificate. Use ngrok or deploy to a server for development.

### Feishu (Lark)
**Get credentials:** https://open.feishu.cn (or open.larksuite.com for Lark)
**Minimum required:** `FEISHU_APP_ID` + `FEISHU_APP_SECRET`
**Variables:**
- `FEISHU_APP_ID` — From Feishu/Lark Developer Console → App Credentials
- `FEISHU_APP_SECRET` — From App Credentials section
- `FEISHU_DOMAIN` — `feishu.cn` (default) or `larksuite.com`
- `FEISHU_ALLOWED_CHATS` — Allowed chat IDs (comma-separated)
- `FEISHU_TEST_CHAT_ID` — For testing

### Mattermost
**Get credentials:** Your Mattermost instance → System Console → Integrations → Bot Accounts
**Minimum required:** `MATTERMOST_SERVER_URL` + `MATTERMOST_BOT_TOKEN`
**Variables:**
- `MATTERMOST_SERVER_URL` — e.g. `https://mattermost.yourcompany.com`
- `MATTERMOST_BOT_TOKEN` — From System Console → Bot Accounts → Add Bot Account
- `MATTERMOST_TEAM_ID` — Your team ID (from team URL or API)
- `MATTERMOST_DM_POLICY` / `MATTERMOST_GROUP_POLICY` — `allow-all` or `allow-from`
- `MATTERMOST_ALLOWED_USERS` / `MATTERMOST_ALLOWED_CHANNELS` — Restrict access
- `MATTERMOST_REQUIRE_MENTION` — `true` to require @mention
**Tips:** Enable Bot Accounts in System Console → Authentication → Bot Accounts. Self-hosted Mattermost is free.

### Nextcloud Talk
**Get credentials:** Your Nextcloud instance → Settings → Security → App Passwords
**Minimum required:** `NEXTCLOUD_URL` + `NEXTCLOUD_BOT_SECRET`
**Variables:**
- `NEXTCLOUD_URL` — Your Nextcloud URL (e.g. `https://cloud.yourserver.com`)
- `NEXTCLOUD_BOT_SECRET` — Set when registering bot via Nextcloud Talk API
- `NEXTCLOUD_WEBHOOK_PUBLIC_URL` — Publicly accessible URL for Talk webhooks
- `NEXTCLOUD_WEBHOOK_PORT` / `NEXTCLOUD_WEBHOOK_PATH` — Webhook server settings
- `NEXTCLOUD_ALLOWED_ROOMS` — Room tokens to allow

### Tlon (Urbit)
**Get credentials:** Your Urbit ship access
**Minimum required:** `TLON_SHIP` + `TLON_URL` + `TLON_CODE`
**Variables:**
- `TLON_SHIP` — Your ship name (e.g. `~sampel-palnet`)
- `TLON_URL` — URL to your ship (e.g. `http://localhost:8080`)
- `TLON_CODE` — Your ship's access code (from `+code` in Dojo)
- `TLON_GROUP_CHANNELS` — Channels to listen in (group path format)
- `TLON_DM_ALLOWLIST` — Allowed DM senders
- `TLON_AUTO_DISCOVER_CHANNELS` — Auto-join channels

### Zalo (Vietnam messaging)
**Get credentials:** https://developers.zalo.me
**Minimum required:** `ZALO_APP_ID` + `ZALO_SECRET_KEY` + `ZALO_ACCESS_TOKEN`
**Variables:**
- `ZALO_APP_ID` / `ZALO_SECRET_KEY` — From Zalo Developer portal
- `ZALO_ACCESS_TOKEN` / `ZALO_REFRESH_TOKEN` — OAuth tokens from Zalo
- `ZALO_WEBHOOK_URL` / `ZALO_WEBHOOK_PATH` / `ZALO_WEBHOOK_PORT` — Webhook config

### Zalo User (Personal)
Personal Zalo account connector (unofficial, no API key needed).
**Variables:**
- `ZALOUSER_COOKIE_PATH` — Path to exported Zalo session cookies
- `ZALOUSER_IMEI` — Device IMEI for session (from official Zalo app)
- `ZALOUSER_USER_AGENT` — Browser user agent string
- `ZALOUSER_PROFILES` — Multiple account profiles (JSON)
- `ZALOUSER_ALLOWED_THREADS` — Allowed conversation threads
- `ZALOUSER_DM_POLICY` / `ZALOUSER_GROUP_POLICY` — Message policies

### ACP (Agent Communication Protocol)
Internal agent-to-agent protocol for connecting multiple AI agents.
**Variables:**
- `ACP_GATEWAY_URL` — Gateway URL for the ACP hub
- `ACP_GATEWAY_TOKEN` / `ACP_GATEWAY_PASSWORD` — Authentication credentials
- `ACP_DEFAULT_SESSION_KEY` / `ACP_DEFAULT_SESSION_LABEL` — Session identification
- `ACP_CLIENT_NAME` / `ACP_CLIENT_DISPLAY_NAME` — This agent's identity
- `ACP_AGENT_ID` — Unique agent ID
- `ACP_PERSIST_SESSIONS` — `true` to save sessions across restarts
- `ACP_SESSION_STORE_PATH` — Where to save sessions

### MCP (Model Context Protocol)
Connect to any MCP server for extended tool capabilities.
**Variables:**
- `mcp` — JSON configuration object for MCP servers
**Tips:** MCP servers can provide tools (web search, code execution, file access, databases, etc.) directly to the AI. See https://modelcontextprotocol.io for available servers.

### IQ (Solana On-chain)
On-chain chat via Solana blockchain.
**Minimum required:** `SOLANA_PRIVATE_KEY` + `IQ_GATEWAY_URL`
**Variables:**
- `SOLANA_PRIVATE_KEY` — Solana wallet private key (base58 encoded)
- `SOLANA_KEYPAIR_PATH` — Alternative: path to keypair JSON file
- `SOLANA_RPC_URL` — e.g. `https://api.mainnet-beta.solana.com`
- `IQ_GATEWAY_URL` — IQ protocol gateway URL
- `IQ_AGENT_NAME` — Display name for your agent
- `IQ_DEFAULT_CHATROOM` — Default chatroom to join
- `IQ_CHATROOMS` — Additional chatrooms (comma-separated)

### Gmail Watch
Monitors Gmail via Google Pub/Sub push notifications.
**Setup:** Requires Google Cloud service account with Gmail API access.
**Tips:** Uses `gog gmail watch serve` internally. Requires Google Cloud project with Gmail API enabled and Pub/Sub configured.

### Retake.tv
Live video streaming connector.
**Minimum required:** `RETAKE_ACCESS_TOKEN`
**Variables:**
- `RETAKE_ACCESS_TOKEN` — From your retake.tv account
- `RETAKE_API_URL` — API endpoint (default provided)
- `RETAKE_CAPTURE_URL` — Screen capture endpoint

---

## Streaming (Live Broadcasting)

### Enable Streaming (streaming-base)
Adds the Stream tab to the UI with RTMP destination management.
**No configuration needed** — just enable the plugin. Then add destination plugins below.

### Twitch Streaming
**Get credentials:** https://dashboard.twitch.tv → Settings → Stream
**Variable:** `TWITCH_STREAM_KEY` — Your stream key (keep secret!)
**Tips:** Never share your stream key — it lets anyone stream to your channel. Regenerate if leaked.

### YouTube Streaming
**Get credentials:** https://studio.youtube.com → Go Live → Stream settings
**Variables:**
- `YOUTUBE_STREAM_KEY` — From YouTube Studio → Stream key
- `YOUTUBE_RTMP_URL` — Default: `rtmp://a.rtmp.youtube.com/live2` (rarely needs changing)
**Tips:** You need a YouTube channel with Live streaming enabled (may require phone verification).

### X Streaming
Live stream to X using RTMP credentials generated for the active broadcast.
**Get credentials:** From X Live Producer / Media Studio when you create a live stream
**Variables:**
- `X_STREAM_KEY` — Stream key for the broadcast
- `X_RTMP_URL` — RTMP ingest URL for the broadcast session
**Tips:** X RTMP credentials are often per-broadcast. Create the stream first, then copy both values directly into the plugin.

### pump.fun Streaming
Stream to pump.fun using the platform's RTMP ingest credentials.
**Get credentials:** From the pump.fun live streaming flow when you create a stream
**Variables:**
- `PUMPFUN_STREAM_KEY` — Stream key for pump.fun ingest
- `PUMPFUN_RTMP_URL` — RTMP ingest URL for the current stream
**Tips:** Treat both values as session credentials. If the stream refuses to start, re-create the broadcast and paste fresh values.

### Custom RTMP
Stream to any platform (Facebook, TikTok, Kick, self-hosted RTMP, etc.)
**Variables:**
- `CUSTOM_RTMP_URL` — RTMP endpoint URL, e.g. `rtmp://live.kick.com/app`
- `CUSTOM_RTMP_KEY` — Stream key from the platform
**Common RTMP URLs:**
- Facebook Live: `rtmps://live-api-s.facebook.com:443/rtmp/`
- TikTok: `rtmp://push.tiktokcdn.com/third/` (need TikTok Live access)
- Kick: `rtmp://ingest.global-contribute.live-video.net/app`

---

## Feature Plugins

### Agent Orchestrator
Orchestrates multiple AI agents for complex multi-step tasks.
**No credentials required.**
**Variables:**
- `ORCHESTRATOR_ACTIVE_PROVIDER` — Provider selection for orchestration (optional)
**Tips:** This plugin coordinates agent-to-agent workflows. Enable it when you want agents to delegate sub-tasks to other agents.

### Agent Skills
Manages and loads skill modules for your agent.
**No credentials required.**
**Variables:**
- `SKILLS_DIR` — Directory to install and load skills from (default: `./skills`)
- `SKILLS_AUTO_LOAD` — `true` to automatically load installed skills on startup
- `SKILLS_REGISTRY` — Skill registry URL (default: `https://clawhub.ai`)
- `BUNDLED_SKILLS_DIRS` — Comma-separated list of directories containing bundled (read-only) skills
- `OTTO_BUNDLED_SKILLS_DIR` — Legacy: single directory for Otto bundled skills
**Tips:** Skills extend your agent's capabilities. Use `SKILLS_AUTO_LOAD=true` for automatic loading. Browse available skills at the registry URL.

### Auto Trader
Automated crypto trading on Solana and EVM chains.
**Get credentials:** https://birdeyeapi.com (Birdeye), https://0x.org (0x API)
**Minimum required:** `BIRDEYE_API_KEY` + `SOLANA_PRIVATE_KEY`
**Variables:**
- `BIRDEYE_API_KEY` — API key from Birdeye for market data (required)
- `SOLANA_PRIVATE_KEY` — Solana wallet private key for executing trades (required)
- `ZEROEX_API_KEY` — 0x API key for EVM swaps (required for EVM trading)
- `SOLANA_RPC_URL` — RPC endpoint (default: mainnet)
- `SOLANA_ADDRESS` — Wallet address
- `TRADING_MODE` — Operating mode
- `MAX_PORTFOLIO_ALLOCATION` — Maximum allocation percentage per trade
- `MIN_LIQUIDITY_USD` / `MIN_VOLUME_24H_USD` / `MIN_SELL_COUNT_24H` — Minimum thresholds for token quality
- `MAX_BUY_SELL_RATIO` — Ratio limit for buy/sell activity
- `RUGCHECK_ENABLED` — `true` to enable rug-pull detection
- `STOP_LOSS_PERCENT` / `TAKE_PROFIT_PERCENT` — Risk management percentages
- `TRADING_INTERVAL_MS` — Polling interval in milliseconds
- `MAX_DAILY_LOSS_USD` / `MAX_POSITION_SIZE_USD` — Loss limits
- `SLIPPAGE_BPS` — Slippage tolerance in basis points
- `EVM_PROVIDER_URL` — EVM RPC provider URL (for EVM trading)
**Tips:** Start with conservative settings. Use `RUGCHECK_ENABLED=true` and low `MAX_PORTFOLIO_ALLOCATION`. Requires the Solana plugin as a dependency.

### Browser
Web scraping and content extraction powered by Playwright.
**Get credentials (optional):** https://browserbase.com (for cloud browser), https://capsolver.com (for CAPTCHA solving)
**Variables:**
- `BROWSERBASE_API_KEY` — API key for Browserbase cloud browser service (optional — falls back to local Playwright)
- `BROWSERBASE_PROJECT_ID` — Project ID for Browserbase
- `OPENAI_API_KEY` — OpenAI API key for AI-powered browser interactions
- `ANTHROPIC_API_KEY` — Anthropic API key for Claude-powered interactions
- `BROWSER_HEADLESS` — `true` to run browser in headless mode (default: true)
- `CAPSOLVER_API_KEY` — CapSolver API key for automated CAPTCHA solving
**Tips:** Works locally without any API keys using Playwright. Add Browserbase for cloud-hosted sessions or CapSolver for automated CAPTCHA handling.

### CLI
Command-line interface capabilities for agent interaction.
**No credentials required.**
**Variables:**
- `CLI_NAME` — CLI command name
- `CLI_VERSION` — CLI version string

### Code
Filesystem, shell, and git operations in a restricted sandboxed environment.
**No credentials required.**
**Variables:**
- `CODER_ENABLED` — `true` to enable code operations
- `CODER_ALLOWED_DIRECTORY` — Restrict file operations to this directory
- `CODER_TIMEOUT` — Timeout for operations (in ms)
- `CODER_FORBIDDEN_COMMANDS` — Comma-separated list of forbidden commands
**Tips:** Use `CODER_ALLOWED_DIRECTORY` to sandbox file access. The Code plugin is safer than the Shell plugin as it enforces restrictions.

### Coding Agent Swarms
Orchestrate CLI coding agents such as Claude Code, Gemini CLI, and others.
**No credentials required.** Uses the locally installed CLI tools.
**Tips:** Ensure you have the desired CLI coding tools installed (e.g., `claude`, `gemini`) before enabling this plugin.

### Commands
Built-in command system for agent interaction.
**No credentials required.**
**Variables:**
- `COMMANDS_ENABLED` — `true` to enable the command system
- `COMMANDS_CONFIG_ENABLED` — `true` to enable the `/config` command
- `COMMANDS_DEBUG_ENABLED` — `true` to enable the `/debug` command
- `COMMANDS_BASH_ENABLED` — `true` to enable the `/bash` command (elevated permissions)
- `COMMANDS_RESTART_ENABLED` — `true` to enable the `/restart` command
**Tips:** Disable elevated commands like `/bash` in production. Use `/config` for runtime configuration changes.

### Computer Use
Automate computer interactions using screen capture and mouse/keyboard control.
**No credentials required.**
**Variables:**
- `COMPUTERUSE_ENABLED` — `true` to enable ComputerUse actions (default: false)
- `COMPUTERUSE_MODE` — Execution mode: `auto`, `local`, or `mcp` (default: auto)
- `COMPUTERUSE_MCP_SERVER` — MCP server name for remote control (default: `computeruse`)
**Tips:** Requires an AI provider that supports vision (e.g., Anthropic Claude). Use `mcp` mode for remote desktop control via an MCP server.

### Copilot Proxy
Proxy to route requests through GitHub Copilot infrastructure.
**No credentials required for basic use.**
**Variables:**
- `COPILOT_PROXY_ENABLED` — `true` to enable
- `COPILOT_PROXY_BASE_URL` — Base URL for API requests
- `COPILOT_PROXY_MODEL` — Model identifier
- `COPILOT_PROXY_SMALL_MODEL` / `COPILOT_PROXY_LARGE_MODEL` — Specific model slots
- `COPILOT_PROXY_TIMEOUT_SECONDS` — Timeout in seconds
- `COPILOT_PROXY_MAX_TOKENS` — Maximum tokens per request
- `COPILOT_PROXY_CONTEXT_WINDOW` — Context window size
**Tips:** Routes LLM requests through the Copilot API. Useful if you have a Copilot subscription and want to use it for agent inference.

### Cron
Schedule recurring tasks with cron-style expressions.
**No credentials required.** No configuration needed — just enable the plugin.
**Tips:** Uses standard cron syntax. The Cron plugin depends on the CLI plugin.

### Directives
Inline directives system for controlling agent behavior per-message.
**No credentials required.**
**Variables:**
- `DEFAULT_THINKING` — Default thinking level: `off`, `minimal`, `low`, `medium`, `high`
- `DEFAULT_VERBOSE` — Default verbose level: `off`, `on`, `full`
- `ALLOW_ELEVATED` — `true` to allow elevated permission directives
- `ALLOW_EXEC` — `true` to allow exec directive for shell configuration
**Tips:** Use directives to control thinking depth and verbosity on a per-message basis. Disable `ALLOW_ELEVATED` and `ALLOW_EXEC` in production for security.

### Edge TTS
Free text-to-speech using Microsoft Edge's TTS engine (no API key needed).
**No credentials required.**
**Variables:**
- `EDGE_TTS_VOICE` — Voice ID, e.g. `en-US-MichelleNeural`, `en-GB-SoniaNeural`
- `EDGE_TTS_LANG` — Language code, e.g. `en-US`, `de-DE`
- `EDGE_TTS_OUTPUT_FORMAT` — Audio format, e.g. `audio-24khz-48kbitrate-mono-mp3`
- `EDGE_TTS_RATE` — Speech rate, e.g. `+0%`, `-10%`, `+20%`
- `EDGE_TTS_PITCH` — Pitch, e.g. `+0Hz`, `-10Hz`
- `EDGE_TTS_VOLUME` — Volume, e.g. `+0%`, `-10%`
- `EDGE_TTS_PROXY` — HTTP proxy URL for requests
- `EDGE_TTS_TIMEOUT_MS` — Request timeout in milliseconds
**Tips:** Completely free — uses Microsoft's Edge browser TTS API. Great for quick voice output without paying for ElevenLabs or OpenAI TTS.

### ElevenLabs
High-quality voice synthesis and speech-to-text using ElevenLabs.
**Get credentials:** https://elevenlabs.io → Profile → API Keys
**Minimum required:** `ELEVENLABS_API_KEY`
**Variables:**
- `ELEVENLABS_API_KEY` — From your ElevenLabs profile page (required)
- `ELEVENLABS_VOICE_ID` — Voice ID to synthesize with (find in ElevenLabs Voice Library)
- `ELEVENLABS_MODEL_ID` — TTS model, e.g. `eleven_multilingual_v2`
- `ELEVENLABS_VOICE_STABILITY` — Voice consistency (0-1)
- `ELEVENLABS_OPTIMIZE_STREAMING_LATENCY` — Latency optimization (0-4)
- `ELEVENLABS_OUTPUT_FORMAT` — Audio format, e.g. `mp3_44100_128`, `pcm_16000`
- `ELEVENLABS_BROWSER_URL` — Browser-safe proxy URL
- `ELEVENLABS_VOICE_SIMILARITY_BOOST` — Voice match accuracy (0-1)
- `ELEVENLABS_VOICE_STYLE` — Style intensity (0-1)
- `ELEVENLABS_VOICE_USE_SPEAKER_BOOST` — Enable speaker boost
- `ELEVENLABS_STT_MODEL_ID` — Speech-to-text model
- `ELEVENLABS_STT_LANGUAGE_CODE` — STT language code (e.g., `en`)
- `ELEVENLABS_STT_DIARIZE` — `true` to identify speakers
- `ELEVENLABS_STT_NUM_SPEAKERS` — Expected speaker count (1-32)
- `ELEVENLABS_STT_TAG_AUDIO_EVENTS` — Tag laughter, applause, etc.
**Tips:** ElevenLabs has the most natural-sounding voices. Free tier gives 10,000 chars/month. Clone your own voice in the Voice Lab.

### Eliza Classic
Classic ELIZA chatbot implementation (the 1966 Rogerian therapist).
**No credentials required.** No configuration needed.
**Tips:** A fun throwback. Enable it to add classic ELIZA-style pattern-matching responses alongside modern LLM capabilities.

### ElizaCloud
Cloud-hosted AI inference and services via elizaOS Cloud.
**Get credentials:** https://www.elizacloud.ai/dashboard/api-keys
**Minimum required:** `ELIZAOS_CLOUD_API_KEY` (format: `eliza_xxxxx`)
**Variables:**
- `ELIZAOS_CLOUD_API_KEY` — API key from elizaCloud dashboard (required)
- `ELIZAOS_CLOUD_BASE_URL` — Base URL for API requests
- `ELIZAOS_CLOUD_SMALL_MODEL` — Fast model: `gpt-5-mini`, `claude-3-5-sonnet`, `gemini-2.0-flash`
- `ELIZAOS_CLOUD_LARGE_MODEL` — Powerful model for complex tasks
- `ELIZAOS_CLOUD_EMBEDDING_MODEL` — Model for text embeddings
- `ELIZAOS_CLOUD_EMBEDDING_API_KEY` — Custom embedding API key
- `ELIZAOS_CLOUD_TTS_MODEL` / `ELIZAOS_CLOUD_TTS_VOICE` — Text-to-speech config
- `ELIZAOS_CLOUD_ENABLED` — `true` to enable container provisioning, device auth, and backup
- `ELIZAOS_CLOUD_BROWSER_BASE_URL` — Browser-safe proxy URL (no secrets exposed)
**Tips:** ElizaCloud provides a single API key for access to multiple model providers. Useful if you don't want to manage individual API keys.

### EVM
EVM-compatible blockchain operations — token transfers, swaps, and DeFi.
**Get credentials:** https://www.alchemy.com (Alchemy), https://infura.io (Infura), https://www.ankr.com (Ankr)
**Minimum required:** `EVM_PRIVATE_KEY` + at least one RPC provider key
**Variables:**
- `EVM_PRIVATE_KEY` — Hex-encoded private key starting with `0x` (required)
- `EVM_RPC_PROVIDER` — Preferred provider: `alchemy`, `infura`, `ankr`, or `elizacloud`
- `ALCHEMY_API_KEY` — Alchemy API key (supports most EVM chains)
- `INFURA_API_KEY` — Infura API key
- `ANKR_API_KEY` — Ankr premium API key (broadest chain support)
- `ETHEREUM_PROVIDER_ETHEREUM` — Custom RPC URL for Ethereum mainnet
- `ETHEREUM_PROVIDER_BASE` — Custom RPC URL for Base
- `ETHEREUM_PROVIDER_ARBITRUM` — Custom RPC URL for Arbitrum
- `ETHEREUM_PROVIDER_OPTIMISM` — Custom RPC URL for Optimism
- `TEE_MODE` — Enable Trusted Execution Environment mode
- `WALLET_SECRET_SALT` — Salt for TEE-derived wallet keypair
- `SEPOLIA_RPC_URL` / `BASE_SEPOLIA_RPC_URL` — Testnet RPC URLs
**Tips:** Use at least one of Alchemy/Infura/Ankr for reliable RPC access. Alchemy free tier is generous. Never expose your private key.

### Experience
Track and learn from agent interaction experiences.
**No credentials required.**
**Variables:**
- `AUTO_RECORD_THRESHOLD` — Threshold for automatic experience recording
**Tips:** Helps the agent improve over time by recording and learning from past interactions.

### Form
Curves-based token economics on the Form chain.
**No credentials required.** No configuration needed.
**Tips:** Depends on blockchain infrastructure. Used for creating bonding curves and token launches.

### Goals
Goal management system for tracking agent objectives.
**No credentials required.**
**Variables:**
- `GOAL_CHECK_INTERVAL` — Interval between goal checks (ms)
- `GOAL_BATCH_SIZE` — Batch processing size
- `GOAL_MAX_CONCURRENT` — Maximum concurrent goal operations
- `GOAL_REMINDER_COOLDOWN` — Cooldown between reminders (ms)
- `GOAL_ENABLE_SMART_REMINDERS` — `true` for intelligent reminder timing
- `GOAL_ENABLE_MONITORING` — `true` to enable goal monitoring
**Tips:** Use goals to give your agent long-term objectives it works toward across conversations.

### Hedera
Integration with the Hedera Hashgraph network.
**No credentials required for basic use.** Configuration depends on your Hedera account setup.
**Tips:** Requires a Hedera account. Visit https://portal.hedera.com for testnet accounts.

### Knowledge (RAG)
Retrieval-Augmented Generation — lets your agent reference custom documents.
**Get credentials:** Requires an embedding provider API key (OpenAI, Google, etc.)
**Minimum required:** At least one API key for embeddings (e.g., `OPENAI_API_KEY`)
**Variables:**
- `CTX_KNOWLEDGE_ENABLED` — `true` to enable contextual knowledge
- `EMBEDDING_PROVIDER` — Provider for embeddings: `openai`, `google`, etc.
- `OPENAI_API_KEY` — For OpenAI embeddings
- `ANTHROPIC_API_KEY` — For Anthropic text generation
- `OPENROUTER_API_KEY` — For OpenRouter
- `GOOGLE_API_KEY` — For Google AI embeddings
- `TEXT_EMBEDDING_MODEL` — Embedding model name
- `EMBEDDING_DIMENSION` — Custom embedding dimension count
- `KNOWLEDGE_PATH` — Path to documents directory (default: `./docs`)
- `LOAD_DOCS_ON_STARTUP` — `true` to auto-load documents on start
- `TEXT_PROVIDER` / `TEXT_MODEL` — Provider and model for text generation
- `MAX_INPUT_TOKENS` / `MAX_OUTPUT_TOKENS` — Token limits
- `MAX_CONCURRENT_REQUESTS` / `REQUESTS_PER_MINUTE` — Rate limiting
**Tips:** Place your documents (PDF, TXT, MD) in the `KNOWLEDGE_PATH` directory. The agent will automatically chunk, embed, and retrieve relevant context. OpenAI's `text-embedding-3-small` is a good default.

### Linear
Linear issue tracking integration for project management.
**Get credentials:** https://linear.app → Settings → API → Personal API Keys
**Minimum required:** `LINEAR_API_KEY`
**Variables:**
- `LINEAR_API_KEY` — Personal API key from Linear settings (required)
- `LINEAR_WORKSPACE_ID` — Your workspace ID
- `LINEAR_DEFAULT_TEAM_KEY` — Default team key for creating issues
**Tips:** Create a personal API key in Linear's settings. The agent can create issues, update status, and query your backlog.

### Local Embedding
Generate embeddings locally without API calls.
**No API key needed — uses local model files.**
**Variables:**
- `MODELS_DIR` — Path to local model files (required)
- `CACHE_DIR` — Path for caching model assets (required)
- `LOCAL_SMALL_MODEL` / `LOCAL_LARGE_MODEL` — Model filenames
- `LOCAL_EMBEDDING_MODEL` — Embedding model filename
- `LOCAL_EMBEDDING_DIMENSIONS` — Embedding dimension count
- `CUDA_VISIBLE_DEVICES` — GPU selection, e.g. `0` for first GPU
**Tips:** Fully offline operation. Download GGUF models and point `MODELS_DIR` to them.

### LP Manager
Manage liquidity pool positions across Solana and EVM DEXes.
**Minimum required:** `SOLANA_PRIVATE_KEY` or `EVM_PRIVATE_KEY` (depending on chain)
**Variables:**
- `SOLANA_PRIVATE_KEY` — Solana wallet private key (required for Solana LPs)
- `EVM_PRIVATE_KEY` — EVM wallet private key (required for EVM LPs)
- `SOLANA_RPC_URL` — Solana RPC endpoint
- `ETHEREUM_RPC_URL` / `BASE_RPC_URL` / `BSC_RPC_URL` / `ARBITRUM_RPC_URL` — EVM chain RPCs
- `LP_SOLANA_DEXES` — Comma-separated Solana DEXes to manage
- `LP_EVM_DEXES` — Comma-separated EVM DEXes to manage
**Tips:** Depends on Anthropic, Discord, Telegram, and EVM plugins. Only provide private keys for chains you want to manage LPs on.

### Memory
Agent memory system for persistent context across conversations.
**No credentials required.** No configuration needed.
**Tips:** Enables your agent to remember facts, preferences, and context from past conversations.

### Moltbook
Integration with the Moltbook platform.
**Get credentials:** From your Moltbook account
**Minimum required:** `MOLTBOOK_TOKEN`
**Variables:**
- `MOLTBOOK_TOKEN` — Authentication token for Moltbook
- `MOLTBOOK_AGENT_NAME` — Agent display name
- `MOLTBOOK_MODEL` — Model identifier
- `MOLTBOOK_PERSONALITY` — Agent personality description
- `MOLTBOOK_AUTONOMY_INTERVAL_MS` — Interval between autonomous actions (ms)
- `MOLTBOOK_AUTONOMY_MAX_STEPS` — Maximum steps per autonomous run
- `MOLTBOOK_AUTONOMOUS_MODE` — Enable autonomous operation
**Tips:** Get your token from the Moltbook platform dashboard.

### Mysticism
Tarot, I Ching, and Astrology readings with optional SOL-based pricing.
**No credentials required.**
**Variables:**
- `MYSTICISM_PRICE_TAROT` — Price in SOL for tarot readings
- `MYSTICISM_PRICE_ICHING` — Price in SOL for I Ching readings
- `MYSTICISM_PRICE_ASTROLOGY` — Price in SOL for astrology readings
**Tips:** Depends on the Form plugin. Set prices to 0 for free readings. Fun addition for community engagement.

### n8n
Workflow automation integration with n8n.
**Get credentials:** https://n8n.io — self-hosted or n8n cloud
**Minimum required:** `ANTHROPIC_API_KEY` + `N8N_API_KEY` + `N8N_HOST`
**Variables:**
- `ANTHROPIC_API_KEY` — Anthropic Claude API key (required for AI features)
- `N8N_API_KEY` — n8n API key for workflow operations
- `N8N_HOST` — n8n instance URL (e.g., `https://your.n8n.cloud`)
- `PLUGIN_DATA_DIR` — Directory for plugin workspace
- `CLAUDE_MODEL` — Claude model to use
**Tips:** Get your n8n API key from Settings → API in your n8n instance. Supports creating, triggering, and managing n8n workflows from the agent.

### PDF
PDF file processing — read, extract text, and analyze PDF documents.
**No credentials required.** No configuration needed.
**Tips:** Allows the agent to read and understand PDF files. Works with the Knowledge plugin for document ingestion.

### Personality
Configure and manage agent personality traits.
**No credentials required.**
**Variables:**
- `ADMIN_USERS` — Comma-separated list of admin user IDs who can modify personality
**Tips:** Use this to define your agent's tone, style, and behavioral traits.

### Plugin Manager
Dynamically manage plugins at runtime — install, enable, and disable.
**No credentials required.** No configuration needed.
**Tips:** Allows runtime plugin management without restarting the agent.

### Polymarket
Prediction market trading on Polymarket (Polygon network).
**Get credentials:** https://polymarket.com → API Settings, or https://docs.polymarket.com
**Minimum required:** `POLYMARKET_PRIVATE_KEY`
**Variables:**
- `POLYMARKET_PRIVATE_KEY` — Hex-encoded private key for Polygon trading (required)
- `CLOB_API_URL` — Polymarket CLOB API URL
- `CLOB_WS_URL` — WebSocket URL for real-time updates
- `CLOB_API_KEY` — API key for authenticated operations
- `CLOB_API_SECRET` — API secret
- `CLOB_API_PASSPHRASE` — API passphrase
**Tips:** Uses the Polygon network. Ensure your wallet has USDC on Polygon for trading. Depends on the EVM plugin.

### Prose
Prose text processing with stateful workspace files.
**No credentials required.**
**Variables:**
- `PROSE_WORKSPACE_DIR` — Base directory for `.prose` workspace files
- `PROSE_STATE_MODE` — State mode: `filesystem`, `in-context`, `sqlite`, `postgres`
- `PROSE_SKILLS_DIR` — Directory containing prose skill files
**Tips:** Great for structured writing tasks. Use `filesystem` mode for simple setups.

### RLM (Reinforcement Learning Manager)
Reinforcement learning for agent behavior optimization.
**No credentials required.** No configuration needed.
**Tips:** Helps the agent learn and adapt its responses based on feedback signals.

### Robot Voice
Simple robotic voice synthesis.
**No credentials required.** No configuration needed.
**Tips:** A lightweight, free alternative to ElevenLabs or Edge TTS. Produces a distinctive robotic voice.

### Rolodex
Contact and relationship management for your agent.
**No credentials required.** No configuration needed.
**Tips:** Tracks people, relationships, and contact information across conversations.

### RSS
RSS feed monitoring and news aggregation.
**No credentials required.**
**Variables:**
- `RSS_FEEDS` — JSON array or comma-separated list of feed URLs
- `RSS_DISABLE_ACTIONS` — `true` to disable subscription management actions
- `RSS_FEED_FORMAT` — Output format: `csv` (compact) or `markdown` (readable)
- `RSS_CHECK_INTERVAL_MINUTES` — Minutes between feed checks
**Tips:** Supply feed URLs to auto-subscribe on startup. Great for keeping agents informed about specific topics.

### S3 Storage
AWS S3 file storage integration.
**Get credentials:** https://aws.amazon.com/s3 → IAM → Create User → Access Keys
**Minimum required:** `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_REGION` + `AWS_S3_BUCKET`
**Variables:**
- `AWS_ACCESS_KEY_ID` — IAM user access key (required)
- `AWS_SECRET_ACCESS_KEY` — IAM user secret key (required)
- `AWS_REGION` — AWS region, e.g. `us-east-1` (required)
- `AWS_S3_BUCKET` — S3 bucket name (required)
- `AWS_S3_UPLOAD_PATH` — Default upload path/prefix inside the bucket
- `AWS_S3_ENDPOINT` — Custom S3-compatible endpoint (for MinIO, DigitalOcean Spaces, etc.)
- `AWS_S3_SSL_ENABLED` — `true` to enable SSL for custom endpoint
- `AWS_S3_FORCE_PATH_STYLE` — `true` for path-style addressing (needed for some S3-compatible providers)
**Tips:** Create an IAM user with only S3 permissions scoped to your bucket. Works with S3-compatible services like MinIO, DigitalOcean Spaces, or Cloudflare R2 via the custom endpoint.

### Scheduling
Task scheduling for agent operations.
**No credentials required.**
**Variables:**
- `DEFAULT_TIMEZONE` — Default timezone, e.g. `America/New_York`
**Tips:** Uses IANA timezone names. Allows agents to schedule actions for specific times.

### Scratchpad
Note-taking and scratchpad for persistent agent notes.
**No credentials required.**
**Variables:**
- `SCRATCHPAD_BASE_PATH` — Base directory for scratchpad files (default: `~/.eliza/scratchpad`)
- `SCRATCHPAD_MAX_FILE_SIZE` — Maximum file size in bytes (default: 1MB)
**Tips:** Useful for agents that need to maintain persistent working notes across sessions.

### Secrets Manager
Runtime secrets management with optional encryption.
**No credentials required.**
**Variables:**
- `ENCRYPTION_SALT` — Custom salt for encryption key derivation
- `ENABLE_ENCRYPTION` — `true` to encrypt stored secrets (default: true)
- `ENABLE_ACCESS_LOGGING` — `true` to log secret access for audit (default: true)
**Tips:** Manages secrets at runtime. Useful for multi-tenant setups where agents need isolated secret storage.

### Shell
Execute shell commands with full host machine access.
**No credentials required.**
**Variables:**
- `SHELL_ALLOWED_DIRECTORY` — Directory to restrict shell commands to (required)
- `SHELL_TIMEOUT` — Max command execution timeout in milliseconds
- `SHELL_FORBIDDEN_COMMANDS` — Comma-separated forbidden commands
- `SHELL_MAX_OUTPUT_CHARS` — Maximum output characters to capture
- `SHELL_BACKGROUND_MS` — Default wait before backgrounding commands
- `SHELL_ALLOW_BACKGROUND` — `true` to allow background execution
- `SHELL_JOB_TTL_MS` — Time-to-live for finished session records (ms)
**Tips:** ⚠️ **Use with extreme caution** — this gives the agent full shell access. Always set `SHELL_ALLOWED_DIRECTORY` and `SHELL_FORBIDDEN_COMMANDS` to restrict access. Prefer the Code plugin for sandboxed operations.

### Simple Voice
Lightweight voice capabilities.
**No credentials required.** No configuration needed.
**Tips:** Basic voice input/output support. Use ElevenLabs or Edge TTS for higher quality.

### Social Alpha
Social media alpha — crypto market intelligence from social signals.
**Get credentials:** https://birdeyeapi.com (Birdeye), https://dexscreener.com (DexScreener), https://jup.ag (Jupiter), https://helius.dev (Helius), https://coingecko.com/api (CoinGecko), https://moralis.io (Moralis)
**Minimum required:** `BIRDEYE_API_KEY` + `DEXSCREENER_API_KEY` + `JUPITER_API_KEY` + `HELIUS_API_KEY` + `COINGECKO_API_KEY` + `MORALIS_API_KEY`
**Variables:**
- `BIRDEYE_API_KEY` — Birdeye market data API key
- `DEXSCREENER_API_KEY` — DexScreener API key
- `JUPITER_API_KEY` — Jupiter aggregator API key
- `HELIUS_API_KEY` — Helius Solana infrastructure key
- `COINGECKO_API_KEY` — CoinGecko market data key
- `MORALIS_API_KEY` — Moralis Web3 data key
**Tips:** Aggregates crypto market data from multiple sources. All 6 API keys are required for full functionality.

### Solana
Core Solana blockchain operations — wallet, transfers, swaps, and DeFi.
**Get credentials:** https://helius.dev (Helius RPC), https://birdeyeapi.com (Birdeye)
**Minimum required:** `HELIUS_API_KEY` + `BIRDEYE_API_KEY` + wallet key (either `SOLANA_PRIVATE_KEY` or `WALLET_SECRET_SALT`)
**Variables:**
- `HELIUS_API_KEY` — Helius API key for Solana RPC access (required)
- `BIRDEYE_API_KEY` — Birdeye API key for market data (required)
- `SOLANA_PRIVATE_KEY` — Wallet private key in base58 (required if not using salt)
- `WALLET_SECRET_KEY` — Alternative wallet secret key
- `WALLET_SECRET_SALT` — Salt for TEE-derived wallet (alternative to private key)
- `WALLET_PUBLIC_KEY` / `SOLANA_PUBLIC_KEY` — Wallet public key
- `SOLANA_RPC_URL` — Custom RPC endpoint (defaults to Helius)
- `SOL_ADDRESS` — SOL mint address for swap operations (required)
- `SLIPPAGE` — Max slippage for swaps in percentage/basis points (required)
**Tips:** Get a free Helius API key at helius.dev. Use `WALLET_SECRET_SALT` with TEE mode for secure key derivation, or `SOLANA_PRIVATE_KEY` for direct key usage.

### TEE (Trusted Execution Environment)
Secure key derivation inside Trusted Execution Environments.
**Minimum required:** `TEE_MODE` + `WALLET_SECRET_SALT`
**Variables:**
- `TEE_MODE` — TEE operation mode: `LOCAL`, `DOCKER`, or `PRODUCTION` (required)
- `TEE_VENDOR` — TEE vendor: `PHALA` (default)
- `WALLET_SECRET_SALT` — Secret salt for deterministic keypair derivation (required)
**Tips:** Use `LOCAL` mode for development, `DOCKER` for containerized testing, `PRODUCTION` for actual TEE hardware (e.g., Intel SGX via Phala Network).

### Todo
Todo list management for agent task tracking.
**No credentials required.**
**Variables:**
- `ENABLE_REMINDERS` — `true` to enable reminder notifications
- `REMINDER_INTERVAL_MS` — Interval between reminder checks (ms)
**Tips:** Helps the agent manage and track tasks across conversations.

### Trajectory Logger
Log agent decision trajectories for debugging and analysis.
**No credentials required.** No configuration needed.
**Tips:** Records the decision-making path of agent actions. Useful for debugging agent behavior.

### Trust
Trust primitives for agent-to-agent relationships.
**No credentials required.** Depends on the Anthropic plugin.
**Variables:**
- `OWNER_ENTITY_ID` — Entity identifier for the owner
- `WORLD_ID` — World identifier
**Tips:** Establishes trust relationships between agents. Used in multi-agent systems.

### TTS (Text-to-Speech Hub)
Central text-to-speech routing across multiple providers.
**No credentials required for the hub itself.** Requires a TTS provider plugin (ElevenLabs, Edge TTS, etc.)
**Variables:**
- `TTS_AUTO_MODE` — When to auto-apply TTS: `off`, `always`, `inbound`, `tagged`
- `TTS_DEFAULT_PROVIDER` — Default provider: `auto`, `elevenlabs`, `openai`, `edge`, `simple-voice`
- `TTS_MAX_LENGTH` — Maximum text length for synthesis
- `TTS_SUMMARIZE` — `true` to summarize long text instead of truncating
- `TTS_DEFAULT_VOICE` — Default voice ID
**Tips:** This is a routing layer — it delegates to whichever TTS provider you have configured. Install at least one TTS provider plugin.

### Vision
Image processing and analysis via AI vision models.
**No credentials required for the plugin itself.** Requires an AI provider with vision support (e.g., OpenAI GPT-4o, Anthropic Claude).
**Variables:**
- `CAMERA_NAME` — Camera name to search for (lowercase partial match)
- `PIXEL_CHANGE_THRESHOLD` — Percentage of pixels that must change to trigger VLM update (default: 50)
**Tips:** Works with any vision-capable AI provider. Set `CAMERA_NAME` for webcam integration.

### Webhooks
Inbound and outbound webhook support.
**No credentials required.** No configuration needed.
**Tips:** Enables your agent to receive webhooks from external services and send webhook notifications.

### x402
x402 HTTP payment protocol for crypto micropayments.
**Minimum required:** `X402_PRIVATE_KEY`
**Variables:**
- `X402_PRIVATE_KEY` — Private key for signing payment transactions (required)
- `X402_AGENT_URL` — Agent endpoint URL
- `X402_NETWORK` — Network: `mainnet` or `testnet`
- `X402_PAY_TO` — Payment recipient address
- `X402_FACILITATOR_URL` — Facilitator service URL
- `X402_MAX_PAYMENT_USD` — Maximum single payment in USD
- `X402_MAX_TOTAL_USD` — Maximum total spend in USD
- `X402_ENABLED` — `true` to enable
- `X402_DB_PATH` — Database file path
**Tips:** Enables HTTP 402 payment flows. Use testnet for development. Set spending limits via `X402_MAX_PAYMENT_USD` and `X402_MAX_TOTAL_USD`.

---

## Apps

### Babylon
Prediction market platform with autonomous trading capabilities.
**Get credentials:** https://babylon.market
**Variables:**
- `BABYLON_API_URL` — Babylon API base URL (default: `https://api.babylon.market`)
- `BABYLON_AGENT_ID` — Agent ID (defaults to `babylon-agent-alice` in dev)
- `CRON_SECRET` — CRON secret for A2A auth (generate with `openssl rand -hex 32`)
- `BABYLON_GAME_PRIVATE_KEY` — Babylon-specific wallet private key (falls back to `EVM_PRIVATE_KEY`)
- `EVM_PRIVATE_KEY` — Fallback wallet private key from plugin-evm
- `BASE_SEPOLIA_RPC_URL` — Base Sepolia RPC URL (falls back to `EVM_PROVIDER_URL`)
- `BABYLON_AUTONOMOUS_MODE` — `true` for independent trading
- `BABYLON_ALLOW_USER_ACTIONS` — `true` to let users execute actions through the agent
- `BABYLON_PRIVY_APP_ID` / `BABYLON_PRIVY_APP_SECRET` — Privy app credentials for embedded wallet creation
- `BASE_IDENTITY_REGISTRY_ADDRESS` — ERC-8004 Identity Registry contract address
**Tips:** Start with testnet (Base Sepolia). Generate a CRON_SECRET with `openssl rand -hex 32`. Privy integration is optional — falls back to direct wallet usage.

### Clawbal Chat
On-chain AI chatrooms on Solana with PnL leaderboards.
**Get credentials:** Solana wallet + Moltbook account + bags.fm
**Minimum required:** `SOLANA_PRIVATE_KEY`
**Variables:**
- `SOLANA_PRIVATE_KEY` — Solana wallet private key, base58 or JSON array (required)
- `SOLANA_RPC_URL` — Solana RPC endpoint (default: mainnet)
- `CLAWBAL_CHATROOM` — Default chatroom (default: `Trenches`)
- `MOLTBOOK_TOKEN` — Moltbook API token for posting
- `BAGS_API_KEY` — bags.fm API key for token launches
- `IMAGE_API_KEY` — Image generation API key (auto-detects provider from prefix)
- `MILADY_ASSETS_PATH` — Path to milady-image-generator assets for unique PFP generation
**Tips:** The chatroom is on-chain — transactions require SOL for gas fees. Use `CLAWBAL_CHATROOM` to set the default room.

### Minecraft
Minecraft bot integration for in-game interaction.
**No credentials required for offline mode.**
**Variables:**
- `MC_HOST` — Minecraft server host address
- `MC_PORT` — Server port
- `MC_SERVER_PORT` — Local server port
- `MC_USERNAME` — Bot username
- `MC_AUTH` — Auth mode: `offline` or `microsoft`
- `MC_VERSION` — Minecraft version (e.g., `1.20.4`)
**Tips:** Use `offline` auth for local testing. For online servers, use `microsoft` auth with a valid Microsoft account.

### Roblox
Roblox platform integration via Open Cloud API.
**Get credentials:** https://create.roblox.com → Credentials → API Keys
**Minimum required:** `ROBLOX_API_KEY` + `ROBLOX_UNIVERSE_ID`
**Variables:**
- `ROBLOX_API_KEY` — Open Cloud API key (required)
- `ROBLOX_UNIVERSE_ID` — Universe ID of your Roblox experience (required)
- `ROBLOX_PLACE_ID` — Place ID within the universe
- `ROBLOX_WEBHOOK_SECRET` — Secret for validating Roblox webhooks
- `ROBLOX_MESSAGING_TOPIC` — Messaging service topic for cross-server communication
- `ROBLOX_POLL_INTERVAL` — Polling interval in seconds
- `ROBLOX_DRY_RUN` — `true` to simulate without executing
**Tips:** Create an API key in Roblox Creator Hub with appropriate permissions. Use `ROBLOX_DRY_RUN=true` for safe testing.

---

## Database Plugins

### InMemoryDB
In-memory database — data is lost on restart.
**No credentials required.** No configuration needed.
**Tips:** Good for development and testing. Not suitable for production — use SQL or LocalDB for persistent storage.

### LocalDB
Local file-based database using SQLite.
**No credentials required.** No configuration needed.
**Tips:** Data persists locally in SQLite files. Good for single-instance deployments.

### SQL
SQL database integration for PostgreSQL and other SQL databases.
**No credentials required for the plugin itself.** Database connection is configured via the main `POSTGRES_URL` environment variable.
**Tips:** Use `POSTGRES_URL` (e.g., `postgresql://user:pass@host:5432/dbname`) to connect. Recommended for production multi-agent deployments.

---

## General Tips

**Required vs Optional:** Every plugin has minimum required fields. Start with just those — you can add optional settings later.

**Testing before going live:** Most connectors have a "dry run" mode (e.g. `TWITTER_DRY_RUN=true`, `FARCASTER_DRY_RUN=true`, `BLUESKY_DRY_RUN=true`) — use this to verify setup without posting.

**Policy fields:** Most connectors have `DM_POLICY` and `GROUP_POLICY` fields:
- `allow-all` — respond to everyone
- `allow-from` — only respond to accounts in the `ALLOW_FROM` list
- `deny-all` — never respond (effectively disables that channel type)

**Webhook vs Polling:** Connectors like LINE, Twilio, WhatsApp Cloud API, and Google Chat use webhooks (they push messages to your server). You need a publicly accessible URL. Use ngrok for local development: `ngrok http 3000`.

**Rate limits:** Most platforms enforce rate limits. For Twitter especially, use conservative post intervals (90-180 minutes minimum).
