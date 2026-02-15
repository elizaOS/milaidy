# Milaidy Testing Plan - Bug Discovery

**Goal**: Systematically test the project to find real bugs worth fixing

---

## Phase 1: Core Functionality Testing (Web Dashboard)

### 1.1 Chat Functionality
- [ ] Send a simple message to the agent
- [ ] Test with long messages (>1000 chars)
- [ ] Test special characters and emojis
- [ ] Test code blocks in messages
- [ ] Verify response time is reasonable
- [ ] Check if conversation history persists

**How to test**:
```bash
# Terminal 1
node milaidy.mjs start

# Terminal 2
cd apps/ui && bun run dev

# Browser: http://localhost:18789
# Send: "Hello, what's 2+2?"
# Send: "Write a Python function to reverse a string"
# Send: Long message with emojis 🚀✨
```

**Expected**: Agent responds coherently using Claude Haiku
**Document**: Any errors, slow responses, or broken features

---

### 1.2 Agent Status & Monitoring
- [ ] Check if "Status" button shows agent state
- [ ] Verify uptime is displayed
- [ ] Check if model name shows correctly (Claude 3.5 Haiku)
- [ ] Test Pause/Resume buttons
- [ ] Test Stop/Restart buttons

**How to test**: Click all buttons in the UI and observe behavior

---

### 1.3 Plugin System
- [ ] Navigate to "Plugins" tab
- [ ] Verify Anthropic plugin shows as loaded
- [ ] Check if other plugins are listed
- [ ] Try installing a new plugin (if possible)

**Look for**: Missing plugins, load errors, UI glitches

---

### 1.4 Configuration
- [ ] Open "Config" tab
- [ ] Verify current settings display
- [ ] Try changing a setting
- [ ] Check if changes persist after restart

---

### 1.5 Skills System
- [ ] Navigate to "Skills" tab
- [ ] Check if any skills are loaded
- [ ] Test refreshing skills list

---

### 1.6 Logs Viewer
- [ ] Open "Logs" tab
- [ ] Verify logs are streaming
- [ ] Check if log levels are correct
- [ ] Test filtering/searching logs

---

### 1.7 OpenAI + Anthropic Compatibility API
- [ ] `GET /v1/models` returns a list of models
- [ ] `POST /v1/chat/completions` returns an OpenAI-shaped response
- [ ] `POST /v1/chat/completions` supports `stream: true` (SSE)
- [ ] `POST /v1/messages` returns an Anthropic-shaped response
- [ ] `POST /v1/messages` supports `stream: true` (SSE)

**How to test**:
```bash
# Terminal 1
bun run start

# If you have MILAIDY_API_TOKEN set, add this to curl:
#   -H "Authorization: Bearer $MILAIDY_API_TOKEN"

curl -sS http://localhost:2138/v1/models | jq .

curl -sS http://localhost:2138/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "milaidy",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Say hello in one sentence." }
    ]
  }' | jq .

curl -N http://localhost:2138/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "milaidy",
    "stream": true,
    "messages": [
      { "role": "user", "content": "Stream a short haiku." }
    ]
  }'

curl -sS http://localhost:2138/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "milaidy",
    "max_tokens": 256,
    "system": "You are a helpful assistant.",
    "messages": [
      { "role": "user", "content": "What is 2+2?" }
    ]
  }' | jq .

curl -N http://localhost:2138/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "milaidy",
    "stream": true,
    "max_tokens": 256,
    "messages": [
      { "role": "user", "content": "Stream the answer to 2+2." }
    ]
  }'
```

**Expected**:
- OpenAI route returns `{ id, object, created, model, choices: [...] }`
- Anthropic route returns `{ id, type: \"message\", role: \"assistant\", content: [{type:\"text\", text:\"...\"}] }`
- Streaming routes produce `data:` SSE chunks and complete without hanging

---

## Phase 2: Desktop App Testing (Windows)

### 2.1 Build Desktop App
```bash
cd a:\programa\ai\milaidy

# Build everything
bun run build

# Build desktop app
cd apps/app
bun install
bun run build
npx cap sync @capacitor-community/electron

# Build Electron
cd electron
npm install
bun run build

# Run in dev mode
bun run electron:start-live
```

### 2.2 Desktop-Specific Features
- [ ] Verify app window opens
- [ ] Check system tray integration
- [ ] Test minimize to tray
- [ ] Test native notifications
- [ ] Check if shortcuts work
- [ ] Verify auto-updater (if configured)

**Look for**: Crashes, missing features, UI bugs

---

## Phase 3: Platform-Specific Testing (Windows)

### 3.1 Windows-Specific Issues
- [ ] Test on fresh Windows install (if possible)
- [ ] Check file path handling (Windows uses backslashes)
- [ ] Verify .env file is read correctly
- [ ] Test with spaces in installation path
- [ ] Check permissions issues

### 3.2 Installation & Setup
- [ ] Test first-run experience (delete ~/.milaidy and restart)
- [ ] Verify onboarding wizard works
- [ ] Test API key input
- [ ] Test wallet generation

---

## Phase 4: Error Scenarios

### 4.1 Invalid Configuration
- [ ] Test with invalid API key
- [ ] Test with missing .env file
- [ ] Test with corrupt config file
- [ ] Test with unsupported model name

### 4.2 Network Issues
- [ ] Test with no internet (should still work locally)
- [ ] Test with slow connection
- [ ] Test API rate limiting

### 4.3 Resource Constraints
- [ ] Test with low memory
- [ ] Test with multiple instances running
- [ ] Test long-running sessions (hours)

---

## Phase 5: Advanced Features

### 5.1 Wallet Functionality
- [ ] Navigate to "Inventory" tab
- [ ] Test wallet address display
- [ ] Test balance checking (if API keys configured)
- [ ] Test wallet export/import

### 5.2 Browser Integration
- [ ] Check if browser plugin is available
- [ ] Test screenshot functionality
- [ ] Test webpage scraping

### 5.3 Multi-Agent Setup
- [ ] Test creating multiple agents
- [ ] Test switching between agents
- [ ] Test agent-specific configs

---

## Phase 6: Code Quality Issues

### 6.1 TypeScript Errors
```bash
cd a:\programa\ai\milaidy
npx tsc --noEmit
```
**Document**: Any type errors that should be fixed

### 6.2 Linting Issues
```bash
# If eslint is configured
bun run lint
```

### 6.3 Dependency Issues
```bash
# Check for outdated packages
bun outdated

# Check for security vulnerabilities
bun audit
```

---

## Phase 7: Documentation Issues

### 7.1 README Accuracy
- [ ] Verify all commands in README work
- [ ] Check for outdated screenshots
- [ ] Test installation instructions
- [ ] Verify links aren't broken

### 7.2 Missing Documentation
- [ ] Check if environment variables are documented
- [ ] Verify plugin system is explained
- [ ] Look for undocumented features

---

## Bug Reporting Template

When you find a bug, document it in bugs.md with:

```markdown
### Bug #XXX

**Bug ID**: XXX
**Severity**: Critical / High / Medium / Low
**Component**: (chat / ui / config / plugins / desktop / etc)
**Platform**: Windows 11 / macOS / Linux
**Description**: Clear description of what's broken
**Steps to Reproduce**:
1. Step 1
2. Step 2
3. Step 3
**Expected**: What should happen
**Actual**: What actually happened
**Error Output**: Full error message
**Screenshots**: (if UI issue)
**Status**: Open / In Progress / Fixed
```

---

## Prioritization

**Fix First** (High Impact):
1. Crashes or data loss
2. Security issues
3. Features that don't work at all
4. Poor UX that blocks users

**Fix Later** (Nice to Have):
1. Minor UI glitches
2. Performance optimizations
3. Code quality improvements
4. Documentation updates

---

## Good Candidates for PRs

**Easy Wins** (Good first PRs):
- Fix typos in docs
- Update outdated dependencies
- Fix broken links
- Add missing error messages
- Improve log messages

**Medium Complexity**:
- Fix WebSocket stub (implement or remove cleanly)
- Improve Windows path handling
- Add better error handling
- Fix TypeScript strict mode issues

**High Impact**:
- Fix desktop app build issues
- Improve first-run experience
- Add missing tests
- Performance improvements

---

## Next Steps

1. **Start with Phase 1** (Web Dashboard testing)
2. **Document everything** you find
3. **Ask the person who hired you**: What features are priority?
4. **Focus on Windows** since that's your platform
5. **Create small, focused PRs** (easier to review)

Good luck! 🚀
