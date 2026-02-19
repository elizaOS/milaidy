---
title: "Knowledge API"
sidebarTitle: "Knowledge"
description: "REST API endpoints for managing the agent's knowledge base — uploading, searching, and deleting documents."
---

The knowledge API manages the agent's document store and semantic search index. All endpoints require the agent to be running with the knowledge service available. Documents are automatically chunked into fragments for semantic retrieval.

<Warning>
The URL upload endpoint blocks private/link-local IP addresses and `localhost` for security. YouTube URLs are automatically transcribed via their caption API.
</Warning>

## Endpoints

### GET /api/knowledge/stats

Get document and fragment counts for the current agent.

**Response**

```json
{
  "documentCount": 42,
  "fragmentCount": 1836,
  "agentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### GET /api/knowledge/documents

List knowledge documents with pagination.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | integer | No | Number of results to return (default: 100) |
| `offset` | integer | No | Number of results to skip (default: 0) |

**Response**

```json
{
  "documents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "filename": "research-paper.pdf",
      "contentType": "application/pdf",
      "fileSize": 204800,
      "createdAt": 1718000000000,
      "fragmentCount": 48,
      "source": "upload",
      "url": null
    }
  ],
  "total": 42,
  "limit": 100,
  "offset": 0
}
```

---

### GET /api/knowledge/documents/:id

Get a specific document including its full content.

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Document ID |

**Response**

```json
{
  "document": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "research-paper.pdf",
    "contentType": "application/pdf",
    "fileSize": 204800,
    "createdAt": 1718000000000,
    "fragmentCount": 48,
    "source": "upload",
    "url": null,
    "content": { "text": "Full document text content..." }
  }
}
```

---

### POST /api/knowledge/documents

Upload a document from base64-encoded content or plain text.

**Request**

```json
{
  "content": "SGVsbG8gV29ybGQ=",
  "filename": "hello.txt",
  "contentType": "text/plain",
  "metadata": { "author": "Alice" }
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | Document content — base64-encoded for binary files, plain text for text files |
| `filename` | string | Yes | Original filename including extension |
| `contentType` | string | No | MIME type (default: `text/plain`) |
| `metadata` | object | No | Additional metadata to store with the document |

**Response**

```json
{
  "ok": true,
  "documentId": "550e8400-e29b-41d4-a716-446655440000",
  "fragmentCount": 12
}
```

---

### POST /api/knowledge/documents/url

Fetch and upload a document from a URL. YouTube URLs are automatically transcribed using their caption API. Redirects, private IPs, and localhost are blocked for security.

**Request**

```json
{
  "url": "https://example.com/document.pdf",
  "metadata": { "source": "web" }
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | Public HTTPS URL to fetch. YouTube URLs (youtube.com, youtu.be) are auto-transcribed |
| `metadata` | object | No | Additional metadata to store with the document |

**Response**

```json
{
  "ok": true,
  "documentId": "550e8400-e29b-41d4-a716-446655440000",
  "fragmentCount": 24,
  "filename": "document.pdf",
  "contentType": "application/pdf",
  "isYouTubeTranscript": false
}
```

---

### DELETE /api/knowledge/documents/:id

Delete a document and all its fragments from the knowledge base.

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Document ID |

**Response**

```json
{
  "ok": true,
  "deletedFragments": 48
}
```

---

### GET /api/knowledge/search

Perform semantic search across the knowledge base.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Search query |
| `threshold` | float | No | Minimum similarity score 0–1 (default: 0.3) |
| `limit` | integer | No | Maximum results to return (default: 20) |

**Response**

```json
{
  "query": "machine learning basics",
  "threshold": 0.3,
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "text": "Machine learning is a subset of artificial intelligence...",
      "similarity": 0.87,
      "documentId": "550e8400-e29b-41d4-a716-446655440000",
      "documentTitle": "ml-intro.pdf",
      "position": 3
    }
  ],
  "count": 1
}
```

---

### GET /api/knowledge/fragments/:documentId

List all text fragments for a specific document, ordered by position.

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `documentId` | UUID | Yes | Document ID |

**Response**

```json
{
  "documentId": "550e8400-e29b-41d4-a716-446655440000",
  "fragments": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "text": "Introduction to machine learning...",
      "position": 0,
      "createdAt": 1718000000000
    }
  ],
  "count": 48
}
```
