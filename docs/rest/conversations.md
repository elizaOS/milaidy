---
title: "Conversations API"
sidebarTitle: "Conversations"
description: "REST API endpoints for managing web-chat conversations — CRUD, messaging, streaming, and legacy chat."
---

The conversations API manages the agent's web-chat interface. Each conversation has its own room in the runtime's memory system, allowing independent message histories. The API supports both streaming (SSE) and synchronous message delivery.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/conversations` | List all conversations |
| POST | `/api/conversations` | Create a new conversation |
| GET | `/api/conversations/:id/messages` | Get messages for a conversation |
| POST | `/api/conversations/:id/messages` | Send a message (synchronous) |
| POST | `/api/conversations/:id/messages/stream` | Send a message (SSE streaming) |
| POST | `/api/conversations/:id/greeting` | Generate a greeting message |
| PATCH | `/api/conversations/:id` | Update conversation metadata |
| DELETE | `/api/conversations/:id` | Delete a conversation |
| POST | `/api/chat/stream` | Legacy streaming chat (single room) |
| POST | `/api/chat` | Legacy synchronous chat (single room) |

---

### GET /api/conversations

List all conversations, sorted by most recently updated first.

**Response**

```json
{
  "conversations": [
    {
      "id": "uuid",
      "title": "Morning Chat",
      "roomId": "uuid",
      "createdAt": "2025-06-01T10:00:00.000Z",
      "updatedAt": "2025-06-01T12:30:00.000Z"
    }
  ]
}
```

---

### POST /api/conversations

Create a new conversation with its own room.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | Conversation title (default `"New Chat"`) |

**Response**

```json
{
  "conversation": {
    "id": "uuid",
    "title": "New Chat",
    "roomId": "uuid",
    "createdAt": "2025-06-01T12:00:00.000Z",
    "updatedAt": "2025-06-01T12:00:00.000Z"
  }
}
```

---

### GET /api/conversations/:id/messages

Retrieve up to 200 messages for a conversation, sorted oldest first.

**Response**

```json
{
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "text": "Hello!",
      "timestamp": 1718000000000
    },
    {
      "id": "uuid",
      "role": "assistant",
      "text": "Hey there! How can I help?",
      "timestamp": 1718000001000
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `messages[].role` | string | `user` or `assistant` |
| `messages[].text` | string | Message text content |
| `messages[].timestamp` | number | Unix timestamp (ms) when the message was created |
| `messages[].source` | string\|undefined | Source identifier if not `client_chat` |

**Errors**

| Status | Condition |
|--------|-----------|
| 404 | Conversation not found |

---

### POST /api/conversations/:id/messages

Send a message and get the agent's response synchronously (non-streaming).

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | User message text |
| `channelType` | string | No | Channel type override |
| `images` | array | No | Attached image data |

**Response**

```json
{
  "text": "Here's what I think...",
  "agentName": "Milady"
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| 404 | Conversation not found |
| 503 | Agent is not running |

---

### POST /api/conversations/:id/messages/stream

Send a message and receive the agent's response via Server-Sent Events (SSE). Each token is streamed as it is generated, followed by a final `done` event.

**Request Body**

Same as `POST /api/conversations/:id/messages`.

**SSE Events**

Token events:
```
data: {"type":"token","text":"Here's"}
data: {"type":"token","text":" what"}
data: {"type":"token","text":" I think..."}
```

Final event:
```
data: {"type":"done","fullText":"Here's what I think...","agentName":"Milady"}
```

The conversation title is auto-generated in the background if it is still `"New Chat"`, and a `conversation-updated` WebSocket event is broadcast.

---

### POST /api/conversations/:id/greeting

Generate a greeting message for a new conversation. Picks a random `postExample` from the agent's character definition — no model call, no latency. The greeting is stored as an agent message for persistence.

**Response**

```json
{
  "text": "gm. ready to go viral today or what.",
  "agentName": "Milady",
  "generated": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | The greeting text (empty if no post examples exist) |
| `agentName` | string | Agent's display name |
| `generated` | boolean | `true` if post examples were available |

---

### PATCH /api/conversations/:id

Update conversation metadata (currently supports renaming).

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | New conversation title |

**Response**

```json
{
  "conversation": {
    "id": "uuid",
    "title": "Updated Title",
    "roomId": "uuid",
    "createdAt": "2025-06-01T10:00:00.000Z",
    "updatedAt": "2025-06-01T14:00:00.000Z"
  }
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| 404 | Conversation not found |

---

### DELETE /api/conversations/:id

Delete a conversation. Messages remain in the runtime memory but the conversation metadata is removed.

**Response**

```json
{
  "ok": true
}
```

---

## Legacy Chat Endpoints

These endpoints use a single shared room for all messages. They are retained for backward compatibility with older clients and the cloud proxy path.

### POST /api/chat/stream

Send a message and receive a streaming SSE response in the legacy single-room context.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | User message text |
| `channelType` | string | No | Channel type override |

**SSE Events**

Same format as `/api/conversations/:id/messages/stream`.

---

### POST /api/chat

Send a message and receive a synchronous response in the legacy single-room context.

**Request Body**

Same as `POST /api/chat/stream`.

**Response**

```json
{
  "text": "Response text here...",
  "agentName": "Milady"
}
```
