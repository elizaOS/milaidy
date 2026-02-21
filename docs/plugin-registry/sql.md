---
title: "SQL Plugin"
sidebarTitle: "SQL"
description: "Database layer — SQLite adapter, schema, migrations, query interface, and memory persistence."
---

The SQL plugin is the database layer for Milady agents. It provides persistent storage for conversation memory, entity data, knowledge embeddings, and agent state.

**Package:** `@elizaos/plugin-sql` (core plugin — always loaded)

## Overview

The SQL plugin implements the `IDatabaseAdapter` interface from ElizaOS core, backed by SQLite via Drizzle ORM. It is the first core plugin loaded because all other plugins depend on persistent storage.

## Database Location

The SQLite database file is stored at:

```
~/.milady/agents/{agentId}/agent.db
```

For multi-agent setups, each agent has its own isolated database.

## Schema

The SQL plugin manages the following tables:

| Table | Description |
|-------|-------------|
| `agents` | Agent configuration and character data |
| `entities` | Users, bots, and other entities the agent knows |
| `rooms` | Channels, conversations, and DMs |
| `participants` | Entity–room membership |
| `memories` | Message history and knowledge fragments |
| `components` | Entity component data (custom structured state) |
| `worlds` | Connected platforms and servers |
| `tasks` | Background task queue |
| `relationships` | Entity relationship graph |

## Memory Storage

Memories are stored with:

- `content` — The memory text and metadata
- `embedding` — Vector embedding (768 dimensions by default)
- `type` — `message`, `knowledge`, `reflection`, `fact`, etc.
- `roomId` — The room this memory belongs to
- `entityId` — The entity (user/agent) associated with the memory
- `agentId` — The agent that owns this memory

## Vector Search

The SQL plugin supports cosine similarity search over embeddings for the RAG pipeline:

```typescript
const results = await runtime.searchMemories({
  tableName: "memories",
  query: embeddingVector,
  topK: 10,
  minScore: 0.7,
  roomId: currentRoomId,
});
```

SQLite does not have a native vector extension, so similarity search is performed in-process using JavaScript. For large knowledge bases (>100k documents), consider a PostgreSQL backend.

## PostgreSQL Support

For production deployments, the SQL plugin supports PostgreSQL via the `pg` driver:

```json
{
  "database": {
    "type": "postgres",
    "url": "postgresql://user:password@host:5432/milady"
  }
}
```

PostgreSQL deployments use `pgvector` for efficient similarity search.

## Migrations

The SQL plugin runs migrations automatically on startup. Migration files are embedded in the plugin package and versioned sequentially.

To inspect the current schema version:

```bash
milady doctor
```

## Runtime API

Other plugins access the database through the runtime's adapter methods:

```typescript
// Store a memory
await runtime.createMemory({
  id: uuid(),
  entityId: message.entityId,
  roomId: message.roomId,
  content: { text: "User prefers dark mode" },
  type: "fact",
});

// Retrieve memories
const memories = await runtime.getMemories({
  roomId: message.roomId,
  count: 20,
  unique: true,
});

// Store entity data
await runtime.createEntity({
  id: userId,
  name: "Alice",
  type: "user",
  metadata: { platform: "telegram" },
});

// Get entity
const entity = await runtime.getEntityById(userId);

// Update component
await runtime.setComponent(userId, "userPreferences", {
  theme: "dark",
  language: "en",
});
```

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `database.type` | `sqlite` or `postgres` | `sqlite` |
| `database.url` | PostgreSQL connection URL | — |
| `database.path` | Custom SQLite file path | Auto-resolved |
| `database.vectorDimensions` | Embedding vector size | `768` |

## Related

- [Knowledge Plugin](/plugin-registry/knowledge) — Uses SQL for embedding storage
- [Secrets Manager Plugin](/plugin-registry/secrets-manager) — Persists secrets via SQL
- [Bootstrap Plugin](/plugin-registry/bootstrap) — Reads/writes conversation memory
