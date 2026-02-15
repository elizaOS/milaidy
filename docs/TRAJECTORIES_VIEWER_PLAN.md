# Trajectories Viewer Implementation Plan

## Goal

Build a comprehensive **Trajectories Viewer** in the Milaidy app that shows all LLM input/output pairs across conversations, autonomous runs, and actions. This enables developers to:
- Debug agent behavior by seeing exact prompts and responses
- Understand token usage and model costs
- Filter by source (connector, autonomous, etc.)
- Review complete interaction chains (trajectories)

---

## CRITICAL REVISION: Correct Architecture

**My original plan was WRONG about patching `messageService.handleMessage`.**

After thoroughly reviewing the official `plugin-trajectory-logger` and ElizaOS core runtime, the **correct approach** is:

### ElizaOS Already Has Built-in Trajectory Logging

The runtime at `/eliza/packages/typescript/src/runtime.ts` **already calls** `trajLogger.logLlmCall()` and `trajLogger.logProviderAccess()` when:
1. A `TrajectoryLoggerService` is registered (service type: `"trajectory_logger"`)
2. A trajectory context is active via `getTrajectoryContext()?.trajectoryStepId`

**Key code in runtime.ts (lines 3657-3667, 3734-3742):**
```typescript
const stepId = getTrajectoryContext()?.trajectoryStepId;
const trajLogger = this.getService<TrajectoryLogger>("trajectory_logger");
if (stepId && trajLogger) {
  trajLogger.logLlmCall({
    stepId,
    model: String(modelKey),
    systemPrompt: ...,
    userPrompt: promptContent,
    response: fullText,
    temperature: ...,
    maxTokens: ...,
    purpose: "action",
    actionType: "runtime.useModel",
    latencyMs: elapsedTime
  });
}
```

### Correct Implementation Strategy

1. **DON'T patch messageService** - This is fragile and bypasses the proper architecture
2. **DO register TrajectoryLoggerService** - As service type `"trajectory_logger"`
3. **DO wrap message handling with trajectory context** - Using `runWithTrajectoryContext()`
4. **DO persist logs to database** - Override the default in-memory storage

### Official Plugin Pattern

From `/plugins/plugin-trajectory-logger/`:
- `TrajectoryLoggerService` - In-memory collector (lines 24-265)
- `action-interceptor.ts` - Wraps actions/providers with logging
- `integration.ts` - Manual instrumentation helpers (`startAutonomousTick`, `loggedLLMCall`)

The plugin is **storage-agnostic** by design - we need to add persistence

---

## Current State Analysis

### What Exists

#### 1. Trajectory Infrastructure (babylon packages)
Location: `/Users/shawwalters/eliza-workspace/babylon/packages/training/`

The babylon training packages have a comprehensive trajectory system:
- **TrajectoryRecorder**: Records steps with LLM calls, provider accesses, actions
- **Database schema**: `trajectories` and `llm_call_logs` tables
- **TrajectoryMetricsExtractor**: Extracts behavioral metrics

**LLM Call Data Captured:**
```typescript
{
  model: string;
  modelVersion?: string;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  reasoning?: string;
  temperature: number;
  maxTokens: number;
  latencyMs?: number;
  purpose: 'action' | 'reasoning' | 'evaluation' | 'response';
  actionType?: string;
}
```

#### 2. Milaidy TrainingService
Location: `/Users/shawwalters/eliza-workspace/milaidy/src/services/training-service.ts`

Already has:
- `listTrajectories()` - Query trajectories from DB
- `getTrajectoryById()` - Get full trajectory with steps JSON
- `extractLlmCallsFromSteps()` - Parse LLM calls from steps

**API Routes Available:**
- `GET /api/training/trajectories` - List trajectories
- `GET /api/training/trajectories/:id` - Get trajectory detail

#### 3. App UI (Config Tab)
Location: `/Users/shawwalters/eliza-workspace/milaidy/apps/app/`

Current tab structure:
- "Config" tab at `/config` (user calls it "Admin")
- Sub-tab pattern used in Database and Plugins views
- Split-view pattern in DatabaseView (sidebar + main content)

### What's Missing

| Gap | Description | Impact |
|-----|-------------|--------|
| **Token counting** | No input/output token counts captured | Can't show costs or usage |
| **Real-time logging** | Trajectory system designed for training, not real-time | Need to enable logging for all LLM calls |
| **trajectories table** | May not exist in standard Milaidy setup | Need migration or alternative storage |
| **Connector tracking** | LLM calls don't track source connector | Can't filter by Telegram vs Discord vs chat |
| **Autonomous flag** | Not captured in current LLM call format | Can't filter autonomous vs user-initiated |

---

## Architecture Decisions (REVISED)

### Key Question 1: How to Capture All LLM Calls?

**~~Option A: Patch messageService.handleMessage~~** - ❌ WRONG APPROACH
- Fragile, bypasses proper architecture
- phetta-companion-plugin pattern is for message interception, not logging

**Option B: Use TrajectoryLoggerService from @elizaos/core** - ✅ CORRECT APPROACH
- Built into ElizaOS runtime
- Runtime ALREADY calls `logLlmCall()` when service is registered
- Just need to: 1) register service, 2) set trajectory context, 3) persist logs

**Option C: Use plugin-trajectory-logger package** - ✅ ENHANCED APPROACH
- Adds action wrapping, export formats (ART/GRPO)
- More features than core TrajectoryLoggerService
- Can be combined with custom persistence

**Recommendation: Option B + custom persistence layer.** The core service captures everything; we just need to persist and expose via API.

### Key Question 2: Where to Store LLM Call Logs?

**Option A: Extend in-memory TrajectoryLoggerService with DB persistence** - ✅ RECOMMENDED
- Subclass `TrajectoryLoggerService`
- Override `logLlmCall()` to also persist to database
- Keep backward compatibility with in-memory access

**Option B: Use Eliza's memories table**
- Create memory type `"llm_completion"`
- Works with all DB adapters
- Slightly awkward fit for structured data

**Option C: Create new `trajectories` + `llm_call_logs` tables**
- Purpose-built schema (matches babylon)
- Best query performance
- Requires migration

**Recommendation: Option A** - Subclass and persist to either memories (simpler) or dedicated tables (cleaner).

### Key Question 3: Token Counting?

**Option A: Parse from provider response** - ✅ RECOMMENDED
- Most providers return `usage.prompt_tokens`, `usage.completion_tokens`
- Already being passed to `logLlmCall()` via `promptTokens`, `completionTokens` params
- Need to ensure providers expose this data

**Option B: Estimate from character count**
- Fallback: ~4 chars per token
- Flag as "estimated" in UI

**Recommendation: Option A with Option B fallback**

### Key Question 4: How to Set Trajectory Context?

The runtime checks `getTrajectoryContext()?.trajectoryStepId` before logging.

**Option A: Wrap at message entry point** - ✅ RECOMMENDED
```typescript
// In server.ts chat handler
const trajectoryId = startTrajectory(agentId);
const stepId = startStep(trajectoryId);
await runWithTrajectoryContext({ trajectoryStepId: stepId }, async () => {
  await runtime.messageService.handleMessage(...);
});
endTrajectory(trajectoryId);
```

**Option B: Wrap at plugin level**
- Use `action-interceptor.ts` pattern
- More granular control
- More complex

**Recommendation: Option A** - Simplest, catches all LLM calls for a message

---

## Data Model

### LLM Completion Memory

```typescript
interface LLMCompletionContent {
  // Identity
  trajectoryId: string;      // Groups related calls
  stepNumber: number;        // Order within trajectory

  // Model info
  model: string;             // e.g., "openai/gpt-4o"
  modelProvider: string;     // e.g., "openai", "anthropic", "cloud"

  // Prompts
  systemPrompt: string;
  userPrompt: string;
  messages?: Array<{role: string; content: string}>;  // Full message array

  // Response
  response: string;

  // Tokens
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;

  // Performance
  latencyMs: number;

  // Context
  purpose: 'chat' | 'action' | 'reasoning' | 'evaluation' | 'autonomous';
  sourceConnector: string | null;  // 'telegram', 'discord', 'chat', etc.
  isAutonomous: boolean;
  actionType: string | null;

  // Parameters
  temperature: number | null;
  maxTokens: number | null;

  // Metadata
  roomId: string | null;
  userId: string | null;
}
```

### Trajectory Summary

```typescript
interface TrajectorySummary {
  trajectoryId: string;
  agentId: string;
  startedAt: string;
  endedAt: string | null;

  // Aggregates
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalLatencyMs: number;

  // Context
  sourceConnector: string | null;
  isAutonomous: boolean;
  roomId: string | null;

  // Preview
  firstPromptPreview: string;  // Truncated first user prompt
  lastResponsePreview: string; // Truncated last response
}
```

---

## UI Design

### Tab Structure

**Before:**
```
Config (at /config)
```

**After:**
```
Advanced (at /advanced)
├── Config (sub-tab)
├── Trajectories (sub-tab)
└── [future: Training, Debugging, etc.]
```

### Trajectories View Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Filters Bar]                                                           │
│ Source: [All ▼] | Autonomous: [All ▼] | Date: [Last 24h ▼] | [Search]  │
├────────────────────┬────────────────────────────────────────────────────┤
│ Trajectories List  │ Selected Trajectory Detail                         │
│                    │                                                     │
│ ┌────────────────┐ │ Trajectory: abc-123                                │
│ │ #1 Chat - 3m   │ │ Started: 2:34 PM | Duration: 45s                   │
│ │ "Tell me..."   │ │ Model: gpt-4o | Tokens: 1,234 in / 456 out        │
│ │ 5 calls, 2.1k ▼│ │                                                     │
│ └────────────────┘ │ ┌─────────────────┬─────────────────────────────┐  │
│ ┌────────────────┐ │ │ INPUT           │ OUTPUT                      │  │
│ │ #2 Auto - 1m   │ │ ├─────────────────┼─────────────────────────────┤  │
│ │ "Check market" │ │ │ System:         │ Response:                   │  │
│ │ 2 calls, 890  ▼│ │ │ You are...      │ Based on my analysis...     │  │
│ └────────────────┘ │ │                 │                             │  │
│ ┌────────────────┐ │ │ User:           │                             │  │
│ │ #3 Telegram... │ │ │ Tell me about.. │                             │  │
│ │ "Hello @bot"   │ │ │                 │                             │  │
│ │ 1 call, 234   ▼│ │ │ [234 tokens]    │ [89 tokens]                 │  │
│ └────────────────┘ │ └─────────────────┴─────────────────────────────┘  │
│                    │                                                     │
│ [Load More]        │ [Step 1 of 5] [<] [>]                              │
└────────────────────┴────────────────────────────────────────────────────┘
```

### Mobile Layout

```
┌─────────────────────────┐
│ [< Back] Trajectories   │
├─────────────────────────┤
│ [Filters ▼]             │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ #1 Chat - 3 min ago │ │
│ │ "Tell me about..."  │ │
│ │ 5 calls · 2.1k tok  │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ #2 Autonomous - 1m  │ │
│ │ "Check market..."   │ │
│ │ 2 calls · 890 tok   │ │
│ └─────────────────────┘ │
└─────────────────────────┘

[Tap trajectory to expand]

┌─────────────────────────┐
│ [< Back] Trajectory #1  │
├─────────────────────────┤
│ Step 1 of 5    [<] [>]  │
├─────────────────────────┤
│ INPUT                   │
│ ─────────────────────── │
│ System: You are...      │
│                         │
│ User: Tell me about...  │
│                         │
│ [234 tokens]            │
├─────────────────────────┤
│ OUTPUT                  │
│ ─────────────────────── │
│ Based on my analysis... │
│                         │
│ [89 tokens · 1.2s]      │
└─────────────────────────┘
```

---

## Implementation Steps (REVISED)

### Phase 1: Backend - LLM Call Logging (Correct Architecture)

**1.1 Create persistent TrajectoryLoggerService**
- File: `src/services/persistent-trajectory-logger.ts`
- Extend `@elizaos/core` `TrajectoryLoggerService`
- Override `logLlmCall()` and `logProviderAccess()` to persist to database
- Register as service type `"trajectory_logger"` (replaces default in-memory)

**1.2 Wrap message handling with trajectory context**
- File: `src/api/server.ts` (chat endpoint)
- Before `handleMessage`: `startTrajectory()` + `startStep()` + `runWithTrajectoryContext()`
- After `handleMessage`: `endTrajectory()`
- Runtime will automatically call our `logLlmCall()` for all model calls

**1.3 Add API routes for querying**
- File: `src/api/trajectory-routes.ts`
- `GET /api/trajectories` - List trajectory summaries with filters
- `GET /api/trajectories/:id` - Get trajectory detail with all LLM calls
- `DELETE /api/trajectories` - Clear trajectories (with optional date filter)
- `GET /api/trajectories/export` - Export as JSON/CSV

**1.4 Database schema**
- Option A (simple): Store in `memories` table with type `"trajectory_log"`
- Option B (clean): Create `trajectory_logs` table with proper schema
- Include: trajectoryId, stepId, model, prompts, response, tokens, latency, connector, isAutonomous

### Phase 2: Frontend - Trajectories Tab

**2.1 Rename Config to Advanced with sub-tabs**
- Update `navigation.ts`: Change "Config" to "Advanced"
- Add sub-tab structure similar to Database view
- Sub-tabs: Config, Trajectories

**2.2 Create TrajectoriesView component**
- File: `apps/app/src/components/TrajectoriesView.tsx`
- Split layout: sidebar list + main detail
- Filters bar: source, autonomous, date range

**2.3 Create TrajectoryDetailView component**
- File: `apps/app/src/components/TrajectoryDetailView.tsx`
- Input/output split view (left/right on desktop, top/bottom on mobile)
- Step navigation (prev/next)
- Token counts and model metadata

**2.4 Add API client methods**
- File: `apps/app/src/api-client.ts`
- `getTrajectories(filters)` - Fetch trajectory list
- `getTrajectoryDetail(id)` - Fetch single trajectory

### Phase 3: Token Counting

**3.1 Extract tokens from provider responses**
- Parse `usage.prompt_tokens`, `usage.completion_tokens` from OpenAI
- Parse `usage.input_tokens`, `usage.output_tokens` from Anthropic
- Normalize to common format

**3.2 Fallback estimation**
- Use ~4 chars per token heuristic when actual counts unavailable
- Flag estimated vs actual in UI

### Phase 4: Filtering & Search

**4.1 Filter by source connector**
- Track connector in LLM call context
- Filter: Telegram, Discord, Chat, API, etc.

**4.2 Filter by autonomous mode**
- Track whether call was autonomous or user-initiated
- Add toggle filter

**4.3 Date range filter**
- Last hour, 24h, 7d, 30d, custom range

**4.4 Full-text search**
- Search prompts and responses
- Highlight matches

---

## API Specification

### GET /api/llm/trajectories

Query params:
- `limit` (default: 50)
- `offset` (default: 0)
- `source` - Filter by connector
- `autonomous` - true/false/all
- `since` - ISO timestamp
- `until` - ISO timestamp
- `search` - Full-text search

Response:
```json
{
  "total": 142,
  "trajectories": [
    {
      "trajectoryId": "traj-abc123",
      "agentId": "agent-xyz",
      "startedAt": "2024-01-15T14:30:00Z",
      "endedAt": "2024-01-15T14:30:45Z",
      "totalCalls": 5,
      "totalInputTokens": 1234,
      "totalOutputTokens": 456,
      "totalLatencyMs": 3200,
      "sourceConnector": "chat",
      "isAutonomous": false,
      "firstPromptPreview": "Tell me about the...",
      "lastResponsePreview": "Based on my analysis..."
    }
  ]
}
```

### GET /api/llm/trajectories/:id

Response:
```json
{
  "trajectory": {
    "trajectoryId": "traj-abc123",
    "agentId": "agent-xyz",
    "startedAt": "2024-01-15T14:30:00Z",
    "endedAt": "2024-01-15T14:30:45Z",
    "sourceConnector": "chat",
    "isAutonomous": false,
    "roomId": "room-123",
    "steps": [
      {
        "stepNumber": 1,
        "timestamp": "2024-01-15T14:30:00Z",
        "model": "openai/gpt-4o",
        "modelProvider": "openai",
        "systemPrompt": "You are Milaidy, an AI assistant...",
        "userPrompt": "Tell me about the weather",
        "response": "Based on current data...",
        "inputTokens": 234,
        "outputTokens": 89,
        "latencyMs": 1200,
        "purpose": "chat",
        "temperature": 0.7
      }
    ]
  }
}
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance degradation from logging | Medium | High | Log asynchronously, batch writes |
| Storage bloat from long contexts | High | Medium | Truncate prompts > 10k chars in storage, keep full in temp |
| Missing token counts from some providers | High | Low | Use estimation fallback |
| Breaking existing training system | Low | High | Keep training routes separate, use new `/api/llm/*` namespace |
| Mobile layout complexity | Medium | Medium | Progressive disclosure, collapsible sections |

---

## Unknowns to Resolve

1. **Should we log streaming responses?**
   - Currently unclear if we should log each chunk or just final response
   - Recommendation: Log final assembled response only

2. **How long to retain logs?**
   - Need to consider storage limits
   - Recommendation: Configurable retention, default 7 days

3. **Should trajectory IDs be UUIDs or sequential?**
   - UUIDs are more robust but harder to debug
   - Recommendation: Use UUIDs with human-readable prefixes (e.g., `traj-abc123`)

4. **What's the relationship to existing training trajectories?**
   - Training trajectories in babylon are separate concept
   - Recommendation: Keep them separate, this is "logging trajectories" vs "training trajectories"

---

## File Changes Summary

### New Files
- `src/services/llm-logger.ts` - LLM call logging service
- `src/api/llm-routes.ts` - API routes for trajectories
- `apps/app/src/components/TrajectoriesView.tsx` - Main trajectories list
- `apps/app/src/components/TrajectoryDetailView.tsx` - Single trajectory detail
- `apps/app/src/components/AdvancedPageView.tsx` - Container with sub-tabs

### Modified Files
- `apps/app/src/navigation.ts` - Add "Advanced" tab, rename Config
- `apps/app/src/App.tsx` - Route to AdvancedPageView
- `apps/app/src/AppContext.tsx` - Add advancedSubTab state
- `apps/app/src/api-client.ts` - Add trajectory API methods
- `src/runtime/milaidy-plugin.ts` - Hook LLM logging
- `src/api/server.ts` - Register LLM routes

---

## User Decisions (Confirmed)

1. **Retention period**: ✅ Keep forever (no automatic deletion)
2. **Real-time updates**: ✅ WebSocket/SSE (use existing patterns)
3. **Cost estimation**: ✅ Yes, show estimated $ cost from tokens
4. **Export**: ✅ Yes, JSON/CSV export
5. **Privacy**: ✅ Allow disabling trajectory logging + clearing trajectories

---

## Additional Feature: Transcription/TTS Provider Selection

**Requirement**: Allow users to select transcription and TTS providers in the Advanced tab.

### Providers to Support

**Transcription (Speech-to-Text):**
- Local (Whisper via whisper.cpp)
- OpenAI Whisper API
- Anthropic (if available)
- Deepgram
- AssemblyAI
- Google Cloud Speech
- Azure Speech Services

**TTS (Text-to-Speech):**
- Local (Piper, espeak, etc.)
- OpenAI TTS
- ElevenLabs
- Google Cloud TTS
- Azure Speech Services
- Play.ht
- Murf.ai

### UI Design

Add to Advanced tab:
```
Advanced
├── Config (RPC providers)
├── Trajectories (LLM logs)
└── Voice (NEW)
    ├── Transcription Provider: [Dropdown]
    │   └── API Key input (if required)
    ├── TTS Provider: [Dropdown]
    │   └── API Key input (if required)
    │   └── Voice selection (if supported)
    └── Test buttons
```

### Implementation

**Backend:**
- `src/config/types.ts` - Add `voice.transcription` and `voice.tts` config sections
- `src/api/voice-routes.ts` - Routes for testing voice providers
- Environment variable support: `TRANSCRIPTION_PROVIDER`, `TTS_PROVIDER`, etc.

**Frontend:**
- `apps/app/src/components/VoiceConfigView.tsx` - Provider selection UI

---

## Questions Remaining

1. **Prompt truncation**: Should we truncate very long prompts in the list view? At what length?

2. **Database storage**: Use existing `memories` table or create dedicated `trajectory_logs` table?
