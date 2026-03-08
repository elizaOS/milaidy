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

## General Tips

**Required vs Optional:** Every plugin has minimum required fields. Start with just those — you can add optional settings later.

**Testing before going live:** Most connectors have a "dry run" mode (e.g. `TWITTER_DRY_RUN=true`, `FARCASTER_DRY_RUN=true`, `BLUESKY_DRY_RUN=true`) — use this to verify setup without posting.

**Policy fields:** Most connectors have `DM_POLICY` and `GROUP_POLICY` fields:
- `allow-all` — respond to everyone
- `allow-from` — only respond to accounts in the `ALLOW_FROM` list
- `deny-all` — never respond (effectively disables that channel type)

**Webhook vs Polling:** Connectors like LINE, Twilio, WhatsApp Cloud API, and Google Chat use webhooks (they push messages to your server). You need a publicly accessible URL. Use ngrok for local development: `ngrok http 3000`.

**Rate limits:** Most platforms enforce rate limits. For Twitter especially, use conservative post intervals (90-180 minutes minimum).
