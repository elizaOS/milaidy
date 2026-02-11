# Knowledge Tab Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding a Knowledge management feature to Milaidy, including:
1. Installing `@elizaos/plugin-knowledge` as a default plugin
2. Modifying the knowledge provider to skip when no knowledge exists
3. Adding a new "Knowledge" tab in the UI for document management
4. Supporting PDFs, Markdown, links, and video transcription
5. Creating live E2E tests with real LLM API keys

---

## 1. Current State Analysis

### 1.1 Existing Plugin: `@elizaos/plugin-knowledge`

**Location:** `/Users/shawwalters/eliza-workspace/plugins/plugin-knowledge/typescript/`

**Key Components:**
- `KnowledgeService` - Core service for document processing (chunking, embedding, storage)
- `knowledgeProvider` - RAG provider that retrieves relevant knowledge based on message embeddings
- `documentsProvider` - Lists available documents
- `routes.ts` - HTTP endpoints for upload, search, delete, and a built-in frontend UI

**Supported File Types:**
- `text/plain`, `text/markdown`, `application/pdf`
- `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX)
- `text/html`, `application/json`, `application/xml`, `text/csv`

**Current Provider Behavior (lines 16-23 of provider.ts):**
```typescript
let knowledge = `${
  firstFiveKnowledgeItems && firstFiveKnowledgeItems.length > 0
    ? addHeader("# Knowledge", ...)
    : ""
}\n`;
```
The provider currently returns an empty string when no knowledge exists, but still contributes to the context. It should skip entirely.

### 1.2 Milaidy UI Tab Architecture

**Navigation System:** `apps/app/src/navigation.ts`
- Tabs defined with: `id`, `label`, `icon`, `component`, `condition` (visibility rules)
- Examples: `chat`, `persona`, `skills`, `training`, `logs`, `settings`, `game`

**State Management:** `apps/app/src/AppContext.tsx`
- `setState(key, value)` for tab switching via `tab` key
- Context provides state for active tab, agent status, etc.

**Tab Rendering:** `apps/app/src/App.tsx`
- Tabs rendered based on navigation config and conditions
- Lazy loading supported for heavy components

### 1.3 Live Testing Patterns

**Pattern from `test/api-auth-live.e2e.test.ts`:**
- Tests run when `MILAIDY_LIVE_TEST=1` environment variable is set
- Tests load `.env` from eliza workspace for API keys
- Uses `describe.skipIf(!canRun)` pattern to conditionally run
- Tests real API endpoints with actual LLM providers

---

## 2. Requirements Clarification

### 2.1 Plugin Installation
- `@elizaos/plugin-knowledge` should be installed by default
- Plugin should be enabled without requiring manual configuration
- Should load at agent startup

### 2.2 Provider Behavior
- **Current:** Provider returns empty string when no knowledge, but still contributes to context
- **Required:** Provider should return `null` or equivalent to skip entirely when no knowledge exists
- This prevents "Knowledge: \n" appearing in agent context with no actual content

### 2.3 Knowledge Tab UI
- New tab in navigation: "Knowledge"
- Features:
  - List all uploaded documents with metadata (name, size, upload date, fragment count)
  - Upload new documents (drag-and-drop, file picker)
  - Upload from URL
  - Delete documents
  - Search across knowledge base
  - Preview document content/fragments

### 2.4 Supported Content Types
| Type | Support | Implementation |
|------|---------|----------------|
| PDF | Existing | `unpdf` library in plugin-knowledge |
| Markdown | Existing | Direct text extraction |
| Plain Text | Existing | Direct text extraction |
| DOCX | Existing | `mammoth` library |
| Links/URLs | Existing | `fetchUrlContent` in utils |
| Video Links | New | YouTube/video transcription service |

### 2.5 Video Transcription
- Requires additional integration
- Options:
  1. Use `@elizaos/plugin-elizacloud` transcription endpoint
  2. Use `@elizaos/plugin-openai` Whisper API
  3. Use YouTube transcript API for YouTube videos
  4. Use `@elizaos/plugin-local-ai` transcribe manager for local processing

**Recommendation:** Support YouTube transcript extraction first (common use case), then optionally integrate with transcription services for uploaded video files.

---

## 3. Implementation Plan

### Phase 1: Default Plugin Installation

**File to modify:** `src/runtime/eliza.ts`

The plugin loading is controlled by `collectPluginNames()`. Currently `@elizaos/plugin-knowledge` is in `OPTIONAL_CORE_PLUGINS` (line 170) but this is just documentation - it's NOT loaded by default.

**Change:** Move `@elizaos/plugin-knowledge` to `CORE_PLUGINS`:

```typescript
// Before (line 152-160):
export const CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-sql",
  "@elizaos/plugin-local-embedding",
  "@elizaos/plugin-agent-skills",
  "@elizaos/plugin-agent-orchestrator",
  "@elizaos/plugin-shell",
  "@elizaos/plugin-plugin-manager",
];

// After:
export const CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-sql",
  "@elizaos/plugin-local-embedding",
  "@elizaos/plugin-knowledge",  // RAG knowledge management
  "@elizaos/plugin-agent-skills",
  "@elizaos/plugin-agent-orchestrator",
  "@elizaos/plugin-shell",
  "@elizaos/plugin-plugin-manager",
];
```

**Remove from OPTIONAL_CORE_PLUGINS** (line 170) since it's now core.

**Verify:** `package.json` already has `@elizaos/plugin-knowledge: next` in dependencies.

### Phase 2: Provider Skip Logic (SIMPLIFIED)

**File:** `/plugins/plugin-knowledge/typescript/provider.ts`

**Finding:** ElizaOS runtime (`runtime.ts:2870-2879`) automatically filters out providers that return empty/whitespace text:
```typescript
if (result?.text && typeof result.text === "string" && result.text.trim() !== "") {
  orderedTexts.push(result.text);
}
```

**Current Behavior:** Provider returns `"\n"` when no knowledge, which `.trim() === ""` and gets filtered. But code is unclear.

**Fix:** Make the skip behavior explicit:
```typescript
// Early return when no knowledge exists
if (!knowledgeData || knowledgeData.length === 0) {
  return {
    text: "",  // Empty text = provider skipped in context
    values: { knowledge: "", knowledgeUsed: false },
    data: { knowledge: "", ragMetadata: null, knowledgeUsed: false },
  };
}

// ... rest of knowledge formatting
```

**No ElizaOS core changes required** - the skip mechanism already exists.

### Phase 3: API Endpoints in Milaidy

**Files to create/modify:**

1. **`src/api/routes/knowledge.ts`** - Proxy routes to knowledge plugin
   ```
   GET    /api/knowledge/documents      - List all documents
   POST   /api/knowledge/documents      - Upload documents (multipart)
   POST   /api/knowledge/documents/url  - Upload from URL
   DELETE /api/knowledge/documents/:id  - Delete document
   GET    /api/knowledge/search         - Search knowledge
   GET    /api/knowledge/stats          - Get knowledge stats (document count, fragment count)
   ```

2. **`apps/app/src/api-client.ts`** - Add client methods
   ```typescript
   // Knowledge API methods
   async listKnowledgeDocuments(): Promise<KnowledgeDocument[]>
   async uploadKnowledgeFile(file: File): Promise<UploadResult>
   async uploadKnowledgeUrl(url: string): Promise<UploadResult>
   async deleteKnowledgeDocument(id: string): Promise<void>
   async searchKnowledge(query: string): Promise<SearchResult[]>
   async getKnowledgeStats(): Promise<KnowledgeStats>
   ```

### Phase 4: UI Tab Implementation

**Files to create:**

1. **`apps/app/src/components/KnowledgeView.tsx`**
   - Main knowledge tab component
   - Sections:
     - Header with stats (X documents, Y fragments)
     - Upload area (drag-and-drop + URL input)
     - Document list with actions (delete, preview)
     - Search bar

2. **`apps/app/src/navigation.ts`** - Add tab entry
   ```typescript
   {
     id: "knowledge",
     label: "Knowledge",
     icon: BookOpenIcon,
     component: "KnowledgeView",
     condition: () => true, // Always show
   }
   ```

3. **`apps/app/src/components/KnowledgeUpload.tsx`**
   - Drag-and-drop zone
   - URL input field
   - File type indicators
   - Upload progress

4. **`apps/app/src/components/KnowledgeDocumentList.tsx`**
   - Document cards/rows
   - Metadata display
   - Delete confirmation
   - Fragment count badges

5. **`apps/app/src/components/KnowledgeSearch.tsx`**
   - Search input
   - Results with similarity scores
   - Document source links

### Phase 5: Video Transcription Support

**Requirement:** Auto-transcribe YouTube URLs when uploaded.

**Implementation:**

1. **Detect YouTube URLs in upload-from-URL flow:**
   ```typescript
   function isYouTubeUrl(url: string): boolean {
     return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/.test(url);
   }
   ```

2. **Add YouTube transcript extraction:**
   ```typescript
   // In knowledge routes or as a utility
   import { YoutubeTranscript } from 'youtube-transcript';

   async function getYouTubeTranscript(url: string): Promise<string> {
     const videoId = extractVideoId(url);
     const transcript = await YoutubeTranscript.fetchTranscript(videoId);
     return transcript.map(t => t.text).join(' ');
   }
   ```

3. **Modify upload-from-URL handler:**
   - Check if URL is YouTube
   - If yes: extract transcript, store as text/plain knowledge
   - If no: proceed with normal URL fetch

4. **Dependencies:**
   - `youtube-transcript` npm package (lightweight, no API key needed)
   - Falls back to manual transcription services if auto-captions unavailable

**Future Enhancement:** For non-YouTube video files, integrate with:
- Whisper API via `@elizaos/plugin-openai`
- Local transcription via `@elizaos/plugin-local-ai`

### Phase 6: Live E2E Tests

**File:** `test/knowledge-live.e2e.test.ts`

**Test Cases:**
```typescript
describe.skipIf(!hasLLMKey)("Live: Knowledge integration with LLM", () => {
  it("uploads a document and retrieves it via RAG", async () => {
    // 1. Start agent with knowledge plugin
    // 2. Upload test document
    // 3. Send chat message that should trigger RAG
    // 4. Verify response includes knowledge
  });

  it("skips knowledge provider when no documents exist", async () => {
    // 1. Start agent with empty knowledge
    // 2. Send chat message
    // 3. Verify no "Knowledge:" section in context
  });

  it("searches knowledge with similarity threshold", async () => {
    // 1. Upload multiple documents
    // 2. Search with query
    // 3. Verify ranked results
  });

  it("handles PDF upload and extraction", async () => {
    // Upload PDF, verify text extracted, query knowledge
  });

  it("handles YouTube transcript extraction", async () => {
    // Provide YouTube URL, verify transcript extracted
  });
});
```

**Environment Variables Required:**
- `MILAIDY_LIVE_TEST=1` - Enable live tests
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` - For LLM and embeddings

---

## 4. Dependencies

### Existing (in plugin-knowledge)
- `unpdf` - PDF text extraction
- `mammoth` - DOCX text extraction
- `multer` - File upload handling
- `@langchain/textsplitters` - Text chunking

### New Dependencies (if adding video transcription)
- `youtube-transcript` - YouTube transcript extraction
- OR use existing `@elizaos/plugin-openai` Whisper integration

### Version Constraints
- Must work with `@elizaos/core: next` (2.0.0-alpha.x)
- Must work with existing milaidy build system (tsdown, vite)

---

## 5. Data Flow

```
┌─────────────────┐
│  Knowledge Tab  │
│      (UI)       │
└───────┬─────────┘
        │ HTTP API
        ▼
┌─────────────────┐
│  Milaidy API    │
│   Server        │
└───────┬─────────┘
        │ Plugin Routes
        ▼
┌─────────────────┐     ┌─────────────────┐
│  Knowledge      │────▶│  Knowledge      │
│  Service        │     │  Provider       │
└───────┬─────────┘     └───────┬─────────┘
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  Documents      │     │  Agent Context  │
│  Table (Memory) │     │  (RAG Injection)│
└─────────────────┘     └─────────────────┘
        │
        ▼
┌─────────────────┐
│  Knowledge      │
│  Fragments      │
│  (Embeddings)   │
└─────────────────┘
```

---

## 6. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large file uploads | Memory issues, slow processing | Stream processing, progress indicators, chunked reads |
| Embedding costs | High API usage | Batch embeddings, content-based deduplication (already implemented) |
| YouTube auto-captions unavailable | No transcript for some videos | Graceful fallback with user notification |
| YouTube API rate limits | Blocked requests | Queue requests, implement backoff |
| Processing timeout for large docs | Incomplete knowledge | Async processing with status updates |

---

## 7. Clarified Requirements

Based on user feedback:

1. **Provider Skip Semantics:** RESOLVED - Providers returning empty `.text` are automatically filtered from context. No validate() needed.

2. **YouTube Transcription:** Auto-transcribe when YouTube URL detected in upload flow.

3. **File Size Limits:** No max file size. Focus on parsing/processing capabilities.

4. **Knowledge Scope:** Per-agent scope (default).

5. **Embedding Provider:** Use same embedding provider as main agent (from runtime settings).

---

## 8. Success Criteria

1. Knowledge plugin loads by default without configuration
2. Provider doesn't appear in context when no knowledge exists
3. Users can upload PDF, MD, TXT documents via UI
4. Users can upload from URL (including YouTube)
5. Search returns relevant results with similarity scores
6. Live E2E tests pass with real LLM API keys
7. UI is responsive and shows upload progress

---

## 9. Timeline Estimate

| Phase | Scope | Dependencies |
|-------|-------|--------------|
| Phase 1 | Default plugin installation | None |
| Phase 2 | Provider skip logic | May need ElizaOS core change |
| Phase 3 | API endpoints | Phase 1 |
| Phase 4 | UI implementation | Phase 3 |
| Phase 5 | Video transcription | Phase 3 |
| Phase 6 | Live tests | Phases 1-5 |

---

## 10. Appendix: File Inventory

### Files to Create
- `apps/app/src/components/KnowledgeView.tsx`
- `apps/app/src/components/KnowledgeUpload.tsx`
- `apps/app/src/components/KnowledgeDocumentList.tsx`
- `apps/app/src/components/KnowledgeSearch.tsx`
- `test/knowledge-live.e2e.test.ts`

### Files to Modify
- `apps/app/src/navigation.ts` - Add knowledge tab
- `apps/app/src/api-client.ts` - Add knowledge API methods
- `src/runtime/milaidy-plugin.ts` - Add default plugin
- `/plugins/plugin-knowledge/typescript/provider.ts` - Skip logic

### Files to Review
- `src/api/server.ts` - Plugin route mounting
- `src/services/plugin-installer.ts` - Plugin installation flow
