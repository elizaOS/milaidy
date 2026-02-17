# Signal Connector Testing - Issue #148

## Overview

This document tracks testing and validation of the Signal connector (`@elizaos/plugin-signal`) as outlined in [GitHub Issue #148](https://github.com/milady-ai/milaidy/issues/148).

## Prerequisites

### 1. Install signal-cli

**macOS:**
```bash
brew install signal-cli
```

**Linux:**
```bash
# Download latest release
wget https://github.com/AsamK/signal-cli/releases/download/v0.13.2/signal-cli-0.13.2-Linux.tar.gz
tar xf signal-cli-0.13.2-Linux.tar.gz
sudo mv signal-cli-0.13.2 /opt/signal-cli
sudo ln -s /opt/signal-cli/bin/signal-cli /usr/local/bin/signal-cli
```

**Windows (WSL recommended):**
```bash
# Use WSL and follow Linux instructions
```

### 2. Register Signal Account

```bash
# Request verification code
signal-cli -u +1234567890 register

# Complete verification
signal-cli -u +1234567890 verify 123456
```

**Note:** You need a phone number that can receive SMS. Consider using a secondary number.

### 3. Start signal-cli REST API (Recommended)

```bash
# Option A: Use signal-cli daemon mode
signal-cli -u +1234567890 daemon --http=localhost:8080

# Option B: Use Docker (easier)
docker run -d --name signal-cli-rest-api \
  -p 8080:8080 \
  -v ~/.local/share/signal-cli:/home/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api
```

### 4. Configure Milaidy

Add to your `.env` or `milaidy.json`:

```bash
# Environment variables
SIGNAL_ACCOUNT_NUMBER=+1234567890
SIGNAL_HTTP_URL=http://localhost:8080

# Or use signal-cli directly (alternative)
# SIGNAL_CLI_PATH=/usr/local/bin/signal-cli
```

Or in `milaidy.json`:
```json
{
  "plugins": ["@elizaos/plugin-signal"],
  "env": {
    "SIGNAL_ACCOUNT_NUMBER": "+1234567890",
    "SIGNAL_HTTP_URL": "http://localhost:8080"
  }
}
```

## Test Files

### E2E Test File
**Location:** `test/signal-connector.e2e.test.ts`

Run tests:
```bash
# Unit tests (no Signal account needed)
pnpm test test/signal-connector.e2e.test.ts

# Live tests (requires Signal setup)
MILAIDY_LIVE_TEST=1 pnpm test test/signal-connector.e2e.test.ts
```

## Test Checklist

### Setup & Authentication
- [ ] signal-cli installed and in PATH
- [ ] Signal account registered (phone number verified)
- [ ] signal-cli REST API running OR signal-cli path configured
- [ ] Plugin loads without errors
- [ ] Connection to Signal service succeeds
- [ ] Error messages are clear when setup fails

### Message Handling
- [ ] Receiving text messages works
- [ ] Sending text responses works
- [ ] Message delivery confirmation works
- [ ] Long messages (>4000 chars) handled correctly

### Signal-Specific Features
- [ ] Group messages work
- [ ] Reply quoting works
- [ ] Typing indicators work
- [ ] Reactions (emoji) work
- [ ] Contact list retrieval works
- [ ] Group list retrieval works

### Media & Attachments
- [ ] Receiving images works
- [ ] Receiving voice messages works
- [ ] Receiving files works
- [ ] Sending images works (if supported)

### Privacy & Security
- [ ] End-to-end encryption maintained (Signal handles this)
- [ ] No message content logged inappropriately
- [ ] Phone numbers handled securely

### Error Handling
- [ ] Network errors handled gracefully
- [ ] Invalid phone numbers rejected with clear error
- [ ] Rate limiting respected
- [ ] Offline messages queued (if supported)

## Plugin Configuration Options

| Variable | Description | Required |
|----------|-------------|----------|
| `SIGNAL_ACCOUNT_NUMBER` | Phone number in E.164 format (+1234567890) | Yes |
| `SIGNAL_HTTP_URL` | signal-cli REST API URL | One of these |
| `SIGNAL_CLI_PATH` | Path to signal-cli binary | required |
| `SIGNAL_SHOULD_IGNORE_GROUP_MESSAGES` | If true, only respond to DMs | No |

## Plugin Actions

| Action | Description |
|--------|-------------|
| `SIGNAL_LIST_CONTACTS` | List Signal contacts |
| `SIGNAL_LIST_GROUPS` | List Signal groups |
| `SIGNAL_SEND_MESSAGE` | Send a message to a contact or group |
| `SIGNAL_SEND_REACTION` | React to a message with an emoji |

## Plugin Providers

| Provider | Description |
|----------|-------------|
| `signalConversationState` | Provides current conversation context |

## Known Limitations

1. **Phone number required** — Unlike Telegram/Discord, Signal requires a real phone number
2. **signal-cli setup** — Requires external daemon/CLI setup (not pure npm)
3. **One account per instance** — Multi-account support via config but complex
4. **No bots API** — Signal doesn't have an official bot API like Telegram

## Troubleshooting

### "Signal service is not available"
- Check signal-cli daemon is running: `curl http://localhost:8080/v1/about`
- Verify SIGNAL_HTTP_URL is correct
- Check signal-cli logs for errors

### "Missing required configuration"
- Ensure SIGNAL_ACCOUNT_NUMBER is set in E.164 format
- Ensure either SIGNAL_HTTP_URL or SIGNAL_CLI_PATH is set

### "Registration failed"
- Signal may require CAPTCHA for new registrations
- Try registering with `--captcha` flag
- Use an actual phone number that can receive SMS

### "Rate limited"
- Signal rate limits automated accounts
- Wait and retry
- Consider using a dedicated number for the agent

## Test Results

### Date: YYYY-MM-DD
**Tester:** @username
**Environment:** OS, signal-cli version, Milaidy version

| Category | Status | Notes |
|----------|--------|-------|
| Setup & Auth | ⬜ | |
| Message Handling | ⬜ | |
| Signal Features | ⬜ | |
| Media | ⬜ | |
| Privacy | ⬜ | |
| Error Handling | ⬜ | |

**Legend:** ✅ Pass | ❌ Fail | ⚠️ Partial | ⬜ Not Tested

### Issues Found
- [ ] Issue 1: Description
- [ ] Issue 2: Description

### Recommendations
- Recommendation 1
- Recommendation 2
