---
title: Knowledge Base (RAG)
sidebarTitle: Knowledge
description: Upload documents, URLs, and YouTube transcripts to build a searchable knowledge base the agent uses for Retrieval Augmented Generation.
---

# Knowledge Base (RAG)

The knowledge system provides Retrieval Augmented Generation (RAG) for the Milady agent. You can upload documents, URLs, and YouTube videos to build a searchable knowledge base. When the agent responds to questions, it retrieves relevant fragments from this knowledge base to ground its answers in your specific content.

## How It Works

1. **Upload** -- Documents are uploaded via the API or dashboard. Supported sources include file uploads (text, PDF, Word documents), web URLs, and YouTube videos (auto-transcribed).
2. **Embedding** -- The knowledge service splits uploaded content into fragments, generates vector embeddings for each fragment, and stores them in the database.
3. **Retrieval** -- When the agent processes a message, it creates a vector embedding of the query and searches for the most similar knowledge fragments.
4. **Generation** -- Retrieved fragments are injected into the agent's context, allowing it to generate responses grounded in your uploaded content.

## Upload Types

### File Upload

Upload document content directly as text or base64-encoded binary data.

**POST `/api/knowledge/documents`**

```json
{
  "content": "The full text content or base64-encoded binary data",
  "filename": "my-document.txt",
  "contentType": "text/plain",
  "metadata": {
    "source": "manual",
    "category": "reference"
  }
}
```

Supported content types include plain text, PDF (`application/pdf`), Word documents (`application/vnd.openxmlformats-officedocument`), and images. Binary content should be base64-encoded. The maximum upload size is 32 MB.

### URL Upload

Fetch and index content from a web URL.

**POST `/api/knowledge/documents/url`**

```json
{
  "url": "https://example.com/article",
  "metadata": {
    "category": "web"
  }
}
```

The system fetches the URL content, detects its type, and processes it appropriately. Text content is stored directly; binary content (PDF, Word, images) is stored as base64.

Security: URL fetching includes SSRF protection. Requests to localhost, private/internal network addresses, link-local ranges, and cloud metadata endpoints (169.254.169.254, metadata.google.internal) are blocked. DNS resolution is checked to prevent alias bypasses. Redirects are not followed.

### YouTube Transcripts

YouTube URLs are automatically detected and handled specially. Instead of fetching the page HTML, the system:

1. Extracts the video ID from the URL (supports `youtube.com/watch`, `youtu.be`, `/embed/`, and `/v/` formats)
2. Fetches the video page to locate caption track URLs
3. Downloads and parses the timed text transcript
4. Stores the full transcript as plain text

```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

The response includes `isYouTubeTranscript: true` to confirm transcript extraction. If captions are not available for the video, the request fails with an error.

## Searching the Knowledge Base

**GET `/api/knowledge/search?q=<query>&threshold=0.3&limit=20`**

Search across all knowledge fragments using semantic similarity.

Query parameters:
- `q` (required) -- search query text
- `threshold` -- minimum similarity score (0 to 1, default: 0.3)
- `limit` -- maximum results to return (default: 20)

```json
{
  "query": "how to configure triggers",
  "threshold": 0.3,
  "results": [
    {
      "id": "fragment-uuid",
      "text": "Triggers are scheduled tasks that wake the agent...",
      "similarity": 0.87,
      "documentId": "document-uuid",
      "documentTitle": "triggers-guide.md",
      "position": 3
    }
  ],
  "count": 5
}
```

The search creates a vector embedding of the query and finds the most similar knowledge fragments, filtering by the threshold and limiting results.

## Managing Knowledge

### View Statistics

**GET `/api/knowledge/stats`**

```json
{
  "documentCount": 15,
  "fragmentCount": 342,
  "agentId": "agent-uuid"
}
```

### List Documents

**GET `/api/knowledge/documents?limit=100&offset=0`**

Returns documents with their metadata and fragment counts:

```json
{
  "documents": [
    {
      "id": "document-uuid",
      "filename": "my-guide.pdf",
      "contentType": "application/pdf",
      "fileSize": 245760,
      "createdAt": 1706000000000,
      "fragmentCount": 23,
      "source": "upload",
      "url": null
    }
  ],
  "total": 15,
  "limit": 100,
  "offset": 0
}
```

### Get Document Detail

**GET `/api/knowledge/documents/:id`**

Returns a single document with full content and fragment count.

### View Document Fragments

**GET `/api/knowledge/fragments/:documentId`**

Returns all fragments for a specific document, sorted by position:

```json
{
  "documentId": "document-uuid",
  "fragments": [
    {
      "id": "fragment-uuid",
      "text": "The first section of the document...",
      "position": 0,
      "createdAt": 1706000000000
    }
  ],
  "count": 23
}
```

### Delete Document

**DELETE `/api/knowledge/documents/:id`**

Deletes a document and all its associated fragments:

```json
{
  "ok": true,
  "deletedFragments": 23
}
```

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/knowledge/stats` | Document and fragment counts |
| GET | `/api/knowledge/documents` | List all documents (paginated) |
| GET | `/api/knowledge/documents/:id` | Get a single document with content |
| POST | `/api/knowledge/documents` | Upload document from content |
| POST | `/api/knowledge/documents/url` | Upload document from URL |
| DELETE | `/api/knowledge/documents/:id` | Delete document and fragments |
| GET | `/api/knowledge/search?q=...` | Semantic search across fragments |
| GET | `/api/knowledge/fragments/:documentId` | List fragments for a document |

## The Knowledge Tab in the Dashboard

The `KnowledgeView` component in the dashboard provides a visual interface for managing the knowledge base:

- **Stats display** -- shows the total document count and fragment count at the top of the view
- **Document upload** -- supports both file picker and drag-and-drop upload, with a file size warning at 8 MB and a hard limit of 32 MB
- **URL upload** -- text input for adding knowledge from web URLs, with automatic YouTube transcript detection
- **Search** -- text search input that queries the knowledge base and displays results with similarity scores
- **Document list** -- browse all uploaded documents with metadata (filename, content type, file size, fragment count, creation date, source)
- **Document deletion** -- per-document delete functionality with confirmation
- **Fragment viewer** -- drill into a document to see its individual text fragments
