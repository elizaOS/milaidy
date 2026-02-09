/**
 * Tests for the agent export/import service.
 *
 * Exercises encryption round-trips, wrong-password rejection, corrupt-file
 * handling, schema validation, ID remapping, empty-agent edge cases, and
 * version checking.
 */

import crypto from "node:crypto";
import type {
  Agent,
  AgentRuntime,
  Component,
  Entity,
  IDatabaseAdapter,
  Log,
  Memory,
  Relationship,
  Room,
  Task,
  UUID,
  World,
} from "@elizaos/core";
import { beforeEach, describe, expect, it } from "vitest";
import { AgentExportError, exportAgent, importAgent } from "./agent-export.js";

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

function uuid(): UUID {
  return crypto.randomUUID() as UUID;
}

const AGENT_ID = uuid();

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: AGENT_ID,
    name: "TestAgent",
    username: "testagent",
    enabled: true,
    bio: ["A test agent"],
    system: "You are a test agent.",
    topics: ["testing"],
    adjectives: ["helpful"],
    plugins: [],
    settings: {
      secrets: {
        OPENAI_API_KEY: "sk-test-12345",
        ENCRYPTION_SALT: "abcdef1234567890",
      },
    },
    style: { all: ["concise"], chat: ["friendly"], post: [] },
    messageExamples: [],
    postExamples: [],
    knowledge: [],
    status: "active" as Agent["status"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as Agent;
}

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: uuid(),
    agentId: AGENT_ID,
    entityId: uuid(),
    roomId: uuid(),
    content: { text: "Hello world" },
    metadata: { type: "message" },
    type: "messages",
    createdAt: Date.now(),
    ...overrides,
  } as Memory;
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: uuid(),
    agentId: AGENT_ID,
    names: ["Alice"],
    metadata: { role: "user" },
    ...overrides,
  } as Entity;
}

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: uuid(),
    agentId: AGENT_ID,
    source: "client_chat",
    type: "DM",
    name: "Test Room",
    metadata: {},
    createdAt: Date.now(),
    ...overrides,
  } as Room;
}

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    id: uuid(),
    agentId: AGENT_ID,
    name: "Test World",
    metadata: {},
    ...overrides,
  } as World;
}

function makeRelationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    id: uuid(),
    sourceEntityId: AGENT_ID,
    targetEntityId: uuid(),
    agentId: AGENT_ID,
    tags: ["friend"],
    metadata: {},
    ...overrides,
  } as Relationship;
}

function makeComponent(overrides: Partial<Component> = {}): Component {
  return {
    id: uuid(),
    entityId: uuid(),
    agentId: AGENT_ID,
    type: "contact",
    data: { phone: "+1234567890" },
    createdAt: Date.now(),
    ...overrides,
  } as Component;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: uuid(),
    name: "test-task",
    description: "A test task",
    agentId: AGENT_ID,
    roomId: uuid(),
    tags: ["test"],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as Task;
}

// ---------------------------------------------------------------------------
// Mock database adapter
// ---------------------------------------------------------------------------

interface MockDb {
  agents: Map<string, Agent>;
  memories: Memory[];
  entities: Map<string, Entity>;
  rooms: Map<string, Room>;
  worlds: Map<string, World>;
  relationships: Relationship[];
  components: Component[];
  tasks: Task[];
  logs: Log[];
  participants: Map<
    string,
    { entityIds: UUID[]; userStates: Map<string, string | null> }
  >;
}

function createMockDb(): MockDb {
  return {
    agents: new Map(),
    memories: [],
    entities: new Map(),
    rooms: new Map(),
    worlds: new Map(),
    relationships: [],
    components: [],
    tasks: [],
    logs: [],
    participants: new Map(),
  };
}

function createMockAdapter(db: MockDb): IDatabaseAdapter<object> {
  return {
    db: {},

    // These are not called in export/import but required by interface
    initialize: async () => {},
    init: async () => {},
    close: async () => {},
    isReady: async () => true,
    getConnection: async () => ({}),
    ensureEmbeddingDimension: async () => {},

    getAgent: async (agentId: UUID) => db.agents.get(agentId) ?? null,
    getAgents: async () => Array.from(db.agents.values()),
    createAgent: async (agent: Partial<Agent>) => {
      db.agents.set(agent.id ?? "", agent as Agent);
      return true;
    },
    updateAgent: async (agentId: UUID, agent: Partial<Agent>) => {
      const existing = db.agents.get(agentId);
      if (existing) db.agents.set(agentId, { ...existing, ...agent });
      return !!existing;
    },
    deleteAgent: async (agentId: UUID) => {
      return db.agents.delete(agentId);
    },

    getAllWorlds: async () => Array.from(db.worlds.values()),
    createWorld: async (world: World) => {
      db.worlds.set(world.id ?? "", world);
      return world.id ?? "";
    },
    getWorld: async (id: UUID) => db.worlds.get(id) ?? null,
    updateWorld: async () => {},
    removeWorld: async () => {},

    getRoomsByWorld: async (worldId: UUID) =>
      Array.from(db.rooms.values()).filter((r) => r.worldId === worldId),
    getRoomsByIds: async (roomIds: UUID[]) =>
      roomIds.map((id) => db.rooms.get(id)).filter(Boolean) as Room[],
    getRoomsForParticipant: async (entityId: UUID) => {
      const result: UUID[] = [];
      for (const [roomId, data] of db.participants) {
        if (data.entityIds.includes(entityId)) result.push(roomId as UUID);
      }
      return result;
    },
    getRoomsForParticipants: async () => [],
    createRooms: async (rooms: Room[]) => {
      const ids: UUID[] = [];
      for (const room of rooms) {
        db.rooms.set(room.id ?? "", room);
        ids.push(room.id ?? "");
      }
      return ids;
    },
    deleteRoom: async () => {},
    deleteRoomsByWorldId: async () => {},
    updateRoom: async () => {},

    getEntitiesForRoom: async (roomId: UUID, includeComponents?: boolean) => {
      const participantData = db.participants.get(roomId);
      if (!participantData) return [];
      return participantData.entityIds
        .map((eid) => db.entities.get(eid))
        .filter((e): e is Entity => Boolean(e))
        .map((entity) => {
          if (includeComponents) {
            return {
              ...entity,
              components: db.components.filter((c) => c.entityId === entity.id),
            };
          }
          return entity;
        });
    },
    getEntitiesByIds: async (entityIds: UUID[]) =>
      entityIds.map((id) => db.entities.get(id)).filter(Boolean) as Entity[],
    createEntities: async (entities: Entity[]) => {
      for (const entity of entities) {
        db.entities.set(entity.id ?? "", entity);
      }
      return true;
    },
    updateEntity: async () => {},
    getEntitiesByNames: async () => [],
    searchEntitiesByName: async () => [],
    deleteEntity: async () => {},

    getParticipantsForRoom: async (roomId: UUID) => {
      return db.participants.get(roomId)?.entityIds ?? [];
    },
    getParticipantsForEntity: async () => [],
    addParticipantsRoom: async (entityIds: UUID[], roomId: UUID) => {
      const existing = db.participants.get(roomId) ?? {
        entityIds: [],
        userStates: new Map(),
      };
      for (const eid of entityIds) {
        if (!existing.entityIds.includes(eid)) existing.entityIds.push(eid);
      }
      db.participants.set(roomId, existing);
      return true;
    },
    removeParticipant: async () => true,
    isRoomParticipant: async () => false,
    addParticipant: async () => true,
    getParticipantUserState: async (roomId: UUID, entityId: UUID) => {
      return db.participants.get(roomId)?.userStates.get(entityId) ?? null;
    },
    setParticipantUserState: async (
      roomId: UUID,
      entityId: UUID,
      userState: "FOLLOWED" | "MUTED" | null,
    ) => {
      const existing = db.participants.get(roomId);
      if (existing) existing.userStates.set(entityId, userState);
    },

    getComponent: async () => null,
    getComponents: async (entityId: UUID) =>
      db.components.filter((c) => c.entityId === entityId),
    createComponent: async (component: Component) => {
      db.components.push(component);
      return true;
    },
    updateComponent: async () => {},
    deleteComponent: async () => {},

    getMemories: async (params: {
      agentId?: UUID;
      tableName: string;
      count?: number;
    }) => {
      return db.memories.filter((m) => {
        if (params.agentId && m.agentId !== params.agentId) return false;
        const memType = (m as Record<string, unknown>).type;
        return memType === params.tableName || !params.tableName;
      });
    },
    getMemoryById: async () => null,
    getMemoriesByIds: async () => [],
    getMemoriesByRoomIds: async () => [],
    getMemoriesByWorldId: async (params: { worldId: UUID }) => {
      return db.memories.filter((m) => m.worldId === params.worldId);
    },
    getCachedEmbeddings: async () => [],
    searchMemories: async () => [],
    searchMemoriesByEmbedding: async () => [],
    createMemory: async (memory: Memory, _tableName: string) => {
      db.memories.push(memory);
      return memory.id ?? "";
    },
    updateMemory: async () => true,
    deleteMemory: async () => {},
    deleteManyMemories: async () => {},
    deleteAllMemories: async () => {},
    countMemories: async () => 0,

    getRelationships: async () => db.relationships,
    getRelationship: async () => null,
    createRelationship: async (params: {
      sourceEntityId: UUID;
      targetEntityId: UUID;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }) => {
      db.relationships.push({
        id: uuid(),
        sourceEntityId: params.sourceEntityId,
        targetEntityId: params.targetEntityId,
        agentId: AGENT_ID,
        tags: params.tags ?? [],
        metadata: params.metadata ?? {},
      } as Relationship);
      return true;
    },
    updateRelationship: async () => {},

    getTasks: async () => db.tasks,
    getTask: async () => null,
    getTasksByName: async () => [],
    createTask: async (task: Task) => {
      db.tasks.push(task);
      return task.id ?? "";
    },
    updateTask: async () => {},
    deleteTask: async () => {},

    log: async (params: {
      body: Record<string, unknown>;
      entityId: UUID;
      roomId: UUID;
      type: string;
    }) => {
      db.logs.push({
        id: uuid(),
        body: params.body,
        entityId: params.entityId,
        roomId: params.roomId,
        type: params.type,
        createdAt: new Date(),
      } as Log);
    },
    getLogs: async () => db.logs,
    deleteLog: async () => {},

    getCache: async () => undefined,
    setCache: async () => true,
    deleteCache: async () => true,

    // Pairing stubs
    getPairingRequests: async () => [],
    createPairingRequest: async () => uuid(),
    updatePairingRequest: async () => {},
    deletePairingRequest: async () => {},
    getPairingAllowlist: async () => [],
    createPairingAllowlistEntry: async () => uuid(),
    deletePairingAllowlistEntry: async () => {},
  } as unknown as IDatabaseAdapter<object>;
}

function createMockRuntime(db: MockDb): AgentRuntime {
  const adapter = createMockAdapter(db);
  return {
    agentId: AGENT_ID,
    adapter,
    character: { name: "TestAgent" },
  } as unknown as AgentRuntime;
}

// ---------------------------------------------------------------------------
// Helpers to populate a mock database with test data
// ---------------------------------------------------------------------------

function populateDb(db: MockDb): {
  world: World;
  room: Room;
  entity: Entity;
  memories: Memory[];
  relationship: Relationship;
  component: Component;
  task: Task;
} {
  const agent = makeAgent();
  db.agents.set(AGENT_ID, agent);

  const world = makeWorld();
  db.worlds.set(world.id ?? "", world);

  const room = makeRoom({ worldId: world.id });
  db.rooms.set(room.id ?? "", room);

  const entity = makeEntity();
  db.entities.set(entity.id ?? "", entity);

  // Add participants
  db.participants.set(room.id ?? "", {
    entityIds: [AGENT_ID, entity.id ?? ""],
    userStates: new Map([[entity.id ?? "", "FOLLOWED"]]),
  });

  const memories = [
    makeMemory({ roomId: room.id, entityId: entity.id }),
    makeMemory({ roomId: room.id, entityId: AGENT_ID }),
    makeMemory({
      roomId: room.id,
      entityId: entity.id,
      content: { text: "How are you?" },
    }),
  ];
  db.memories.push(...memories);

  const relationship = makeRelationship({ targetEntityId: entity.id });
  db.relationships.push(relationship);

  const component = makeComponent({ entityId: entity.id });
  db.components.push(component);

  const task = makeTask({ roomId: room.id });
  db.tasks.push(task);

  return { world, room, entity, memories, relationship, component, task };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("agent-export", () => {
  let sourceDb: MockDb;
  let sourceRuntime: AgentRuntime;

  beforeEach(() => {
    sourceDb = createMockDb();
    sourceRuntime = createMockRuntime(sourceDb);
  });

  describe("round-trip encryption", () => {
    it("exports and imports an agent with all data preserved", async () => {
      const {
        world: _world,
        room: _room,
        entity: _entity,
        memories,
        relationship: _relationship,
        component: _component,
        task: _task,
      } = populateDb(sourceDb);

      const password = "test-password-123";

      // Export
      const fileBuffer = await exportAgent(sourceRuntime, password);
      expect(fileBuffer).toBeInstanceOf(Buffer);
      expect(fileBuffer.length).toBeGreaterThan(79); // header size

      // Verify magic header
      const header = fileBuffer.subarray(0, 15).toString("utf-8");
      expect(header).toBe("ELIZA_AGENT_V1\n");

      // Import into a fresh database
      const targetDb = createMockDb();
      // The target needs a running agent entry so the import works
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      const result = await importAgent(targetRuntime, fileBuffer, password);

      expect(result.success).toBe(true);
      expect(result.agentName).toBe("TestAgent");
      expect(result.agentId).not.toBe(AGENT_ID); // New ID assigned
      expect(result.counts.memories).toBe(memories.length);
      expect(result.counts.entities).toBe(1); // The non-agent entity
      expect(result.counts.rooms).toBe(1);
      expect(result.counts.worlds).toBe(1);
      expect(result.counts.relationships).toBe(1);
      expect(result.counts.components).toBe(1);
      expect(result.counts.tasks).toBe(1);
      expect(result.counts.participants).toBe(2); // Agent + entity

      // Verify agent was created with new ID
      const importedAgent = targetDb.agents.get(result.agentId);
      expect(importedAgent).toBeDefined();
      expect(importedAgent?.name).toBe("TestAgent");

      // Verify secrets are preserved
      const importedSettings = importedAgent?.settings as Record<
        string,
        Record<string, unknown>
      >;
      expect(importedSettings?.secrets?.OPENAI_API_KEY).toBe("sk-test-12345");

      // Verify memories were imported
      // Subtract original memories (from target agent), we should have new ones
      expect(targetDb.memories.length).toBe(memories.length);

      // Verify world was created
      expect(targetDb.worlds.size).toBe(1);

      // Verify rooms were created
      // targetDb already had 0 rooms, now should have 1
      expect(targetDb.rooms.size).toBe(1);

      // Verify entities were created
      expect(targetDb.entities.size).toBe(1);

      // Verify relationships were created
      expect(targetDb.relationships.length).toBe(1);

      // Verify tasks were created
      expect(targetDb.tasks.length).toBe(1);
    });

    it("preserves message content across export/import", async () => {
      populateDb(sourceDb);
      const password = "secure-pass-456";

      const fileBuffer = await exportAgent(sourceRuntime, password);

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      await importAgent(targetRuntime, fileBuffer, password);

      // Check that memory text content is preserved
      const texts = targetDb.memories.map((m) => m.content?.text).sort();
      expect(texts).toContain("Hello world");
      expect(texts).toContain("How are you?");
    });
  });

  describe("wrong password", () => {
    it("throws AgentExportError with a clear message", async () => {
      populateDb(sourceDb);
      const fileBuffer = await exportAgent(sourceRuntime, "correct-password");

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      const err = await importAgent(
        targetRuntime,
        fileBuffer,
        "wrong-password",
      ).catch((e: Error) => e);
      expect(err).toBeInstanceOf(AgentExportError);
      expect(err.message).toMatch(/password|decryption/i);

      // Verify database was not modified
      expect(targetDb.memories.length).toBe(0);
      expect(targetDb.worlds.size).toBe(0);
    });
  });

  describe("corrupt file handling", () => {
    it("rejects a file that is too small", async () => {
      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      await expect(
        importAgent(targetRuntime, Buffer.from("short"), "password"),
      ).rejects.toThrow(/too small/);
    });

    it("rejects a file with wrong magic header", async () => {
      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      const fakeFile = Buffer.alloc(200, 0);
      fakeFile.write("NOT_AN_ELIZA_FILE");

      await expect(
        importAgent(targetRuntime, fakeFile, "password"),
      ).rejects.toThrow(/invalid file format/i);
    });

    it("rejects a file with tampered ciphertext", async () => {
      populateDb(sourceDb);
      const fileBuffer = await exportAgent(sourceRuntime, "test-pass");

      // Tamper with the ciphertext (last 100 bytes)
      const tampered = Buffer.from(fileBuffer);
      for (let i = tampered.length - 100; i < tampered.length; i++) {
        tampered[i] = ((tampered[i] ?? 0) + 1) % 256;
      }

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      await expect(
        importAgent(targetRuntime, tampered, "test-pass"),
      ).rejects.toThrow(AgentExportError);
    });

    it("rejects a truncated file", async () => {
      populateDb(sourceDb);
      const fileBuffer = await exportAgent(sourceRuntime, "test-pass");

      // Truncate to just the header + a few bytes
      const truncated = fileBuffer.subarray(0, 100);

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      await expect(
        importAgent(targetRuntime, truncated, "test-pass"),
      ).rejects.toThrow(AgentExportError);
    });
  });

  describe("empty agent", () => {
    it("exports and imports an agent with no memories or rooms", async () => {
      // Only create the agent, nothing else
      sourceDb.agents.set(AGENT_ID, makeAgent());

      const password = "empty-agent-pass";
      const fileBuffer = await exportAgent(sourceRuntime, password);

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      const result = await importAgent(targetRuntime, fileBuffer, password);

      expect(result.success).toBe(true);
      expect(result.counts.memories).toBe(0);
      expect(result.counts.entities).toBe(0);
      expect(result.counts.rooms).toBe(0);
      expect(result.counts.worlds).toBe(0);
    });
  });

  describe("ID remapping", () => {
    it("assigns new UUIDs to all imported records", async () => {
      const { room, entity, world } = populateDb(sourceDb);

      const originalRoomId = room.id ?? "";
      const originalEntityId = entity.id ?? "";
      const originalWorldId = world.id ?? "";

      const fileBuffer = await exportAgent(sourceRuntime, "remap-test");

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      const result = await importAgent(targetRuntime, fileBuffer, "remap-test");

      // The new agent ID should differ
      expect(result.agentId).not.toBe(AGENT_ID);

      // Room IDs should be different
      const importedRoomIds = Array.from(targetDb.rooms.keys());
      expect(importedRoomIds).not.toContain(originalRoomId);
      expect(importedRoomIds.length).toBe(1);

      // Entity IDs should be different
      const importedEntityIds = Array.from(targetDb.entities.keys());
      expect(importedEntityIds).not.toContain(originalEntityId);
      expect(importedEntityIds.length).toBe(1);

      // World IDs should be different
      const importedWorldIds = Array.from(targetDb.worlds.keys());
      expect(importedWorldIds).not.toContain(originalWorldId);
      expect(importedWorldIds.length).toBe(1);

      // All imported entities should reference the new agent ID
      for (const entity of targetDb.entities.values()) {
        expect(entity.agentId).toBe(result.agentId);
      }

      // All imported rooms should reference the new agent ID
      for (const impRoom of targetDb.rooms.values()) {
        expect(impRoom.agentId).toBe(result.agentId);
      }
    });
  });

  describe("password validation", () => {
    it("rejects export with empty password", async () => {
      populateDb(sourceDb);
      await expect(exportAgent(sourceRuntime, "")).rejects.toThrow(
        /password.*required/i,
      );
    });

    it("rejects import with empty password", async () => {
      populateDb(sourceDb);
      const fileBuffer = await exportAgent(sourceRuntime, "valid-pass");

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      await expect(importAgent(targetRuntime, fileBuffer, "")).rejects.toThrow(
        /password.*required/i,
      );
    });
  });

  describe("includeLogs option", () => {
    it("excludes logs by default", async () => {
      populateDb(sourceDb);
      // Add some logs
      sourceDb.logs.push({
        id: uuid(),
        body: { action: "test" },
        entityId: AGENT_ID,
        roomId: uuid(),
        type: "action",
        createdAt: new Date(),
      } as Log);

      const fileBuffer = await exportAgent(sourceRuntime, "logs-test");

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      const result = await importAgent(targetRuntime, fileBuffer, "logs-test");
      expect(result.counts.logs).toBe(0);
    });

    it("includes logs when requested", async () => {
      populateDb(sourceDb);
      sourceDb.logs.push({
        id: uuid(),
        body: { action: "test" },
        entityId: AGENT_ID,
        roomId: uuid(),
        type: "action",
        createdAt: new Date(),
      } as Log);

      const fileBuffer = await exportAgent(sourceRuntime, "logs-test", {
        includeLogs: true,
      });

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      const result = await importAgent(targetRuntime, fileBuffer, "logs-test");
      expect(result.counts.logs).toBe(1);
    });
  });

  describe("no database adapter", () => {
    it("throws on export when adapter is missing", async () => {
      const noAdapterRuntime = {
        agentId: AGENT_ID,
        adapter: null,
        character: { name: "Test" },
      } as unknown as AgentRuntime;

      await expect(exportAgent(noAdapterRuntime, "pass")).rejects.toThrow(
        /database adapter/i,
      );
    });

    it("throws on import when adapter is missing", async () => {
      const noAdapterRuntime = {
        agentId: AGENT_ID,
        adapter: null,
        character: { name: "Test" },
      } as unknown as AgentRuntime;

      await expect(
        importAgent(noAdapterRuntime, Buffer.alloc(100), "pass"),
      ).rejects.toThrow(/database adapter/i);
    });
  });

  describe("large payload", () => {
    it("handles many memories efficiently", async () => {
      const agent = makeAgent();
      sourceDb.agents.set(AGENT_ID, agent);

      const room = makeRoom();
      sourceDb.rooms.set(room.id ?? "", room);

      // Create 500 memories
      for (let i = 0; i < 500; i++) {
        sourceDb.memories.push(
          makeMemory({
            roomId: room.id,
            content: { text: `Memory number ${i}: ${"x".repeat(200)}` },
          }),
        );
      }

      sourceDb.participants.set(room.id ?? "", {
        entityIds: [AGENT_ID],
        userStates: new Map(),
      });

      const password = "large-payload-test";
      const fileBuffer = await exportAgent(sourceRuntime, password);

      // The file should be significantly smaller than raw JSON due to compression
      const rawJsonSize = JSON.stringify(sourceDb.memories).length;
      expect(fileBuffer.length).toBeLessThan(rawJsonSize);

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      const result = await importAgent(targetRuntime, fileBuffer, password);
      expect(result.success).toBe(true);
      expect(result.counts.memories).toBe(500);
    });
  });

  describe("multi-world multi-room topology", () => {
    it("exports and imports multiple worlds with rooms in each", async () => {
      sourceDb.agents.set(AGENT_ID, makeAgent());

      const world1 = makeWorld({ name: "World One" });
      const world2 = makeWorld({ name: "World Two" });
      sourceDb.worlds.set(world1.id ?? "", world1);
      sourceDb.worlds.set(world2.id ?? "", world2);

      const room1 = makeRoom({ worldId: world1.id, name: "Room in W1" });
      const room2 = makeRoom({ worldId: world2.id, name: "Room in W2" });
      const room3 = makeRoom({ worldId: world2.id, name: "Second Room in W2" });
      sourceDb.rooms.set(room1.id ?? "", room1);
      sourceDb.rooms.set(room2.id ?? "", room2);
      sourceDb.rooms.set(room3.id ?? "", room3);

      // Agent participates in all rooms
      for (const room of [room1, room2, room3]) {
        sourceDb.participants.set(room.id ?? "", {
          entityIds: [AGENT_ID],
          userStates: new Map(),
        });
      }

      const fileBuffer = await exportAgent(sourceRuntime, "multi-world");
      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      const result = await importAgent(
        targetRuntime,
        fileBuffer,
        "multi-world",
      );
      expect(result.counts.worlds).toBe(2);
      expect(result.counts.rooms).toBe(3);

      // Verify world names survived
      const worldNames = Array.from(targetDb.worlds.values())
        .map((w) => w.name)
        .sort();
      expect(worldNames).toEqual(["World One", "World Two"]);

      // Verify room names survived
      const roomNames = Array.from(targetDb.rooms.values())
        .map((r) => r.name)
        .sort();
      expect(roomNames).toEqual([
        "Room in W1",
        "Room in W2",
        "Second Room in W2",
      ]);

      // Verify rooms reference their new world IDs (not old ones)
      for (const room of targetDb.rooms.values()) {
        if (room.worldId) {
          expect(targetDb.worlds.has(room.worldId)).toBe(true);
        }
      }
    });
  });

  describe("rooms without worldId", () => {
    it("exports rooms the agent participates in that have no world", async () => {
      sourceDb.agents.set(AGENT_ID, makeAgent());

      // A room with no world — just direct participation
      const orphanRoom = makeRoom({ worldId: undefined, name: "Orphan Room" });
      sourceDb.rooms.set(orphanRoom.id ?? "", orphanRoom);
      sourceDb.participants.set(orphanRoom.id ?? "", {
        entityIds: [AGENT_ID],
        userStates: new Map(),
      });

      sourceDb.memories.push(
        makeMemory({
          roomId: orphanRoom.id,
          content: { text: "orphan message" },
        }),
      );

      const fileBuffer = await exportAgent(sourceRuntime, "orphan-room");
      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const result = await importAgent(
        createMockRuntime(targetDb),
        fileBuffer,
        "orphan-room",
      );

      expect(result.counts.rooms).toBe(1);
      expect(result.counts.worlds).toBe(0);
      expect(result.counts.memories).toBe(1);

      const importedRoom = Array.from(targetDb.rooms.values())[0];
      expect(importedRoom.name).toBe("Orphan Room");
      expect(importedRoom.worldId).toBeUndefined();
    });
  });

  describe("participant state preservation", () => {
    it("preserves FOLLOWED and MUTED states after import", async () => {
      sourceDb.agents.set(AGENT_ID, makeAgent());
      const room = makeRoom();
      sourceDb.rooms.set(room.id ?? "", room);

      const entityA = makeEntity({ names: ["Alice"] });
      const entityB = makeEntity({ names: ["Bob"] });
      sourceDb.entities.set(entityA.id ?? "", entityA);
      sourceDb.entities.set(entityB.id ?? "", entityB);

      sourceDb.participants.set(room.id ?? "", {
        entityIds: [AGENT_ID, entityA.id ?? "", entityB.id ?? ""],
        userStates: new Map([
          [entityA.id ?? "", "FOLLOWED"],
          [entityB.id ?? "", "MUTED"],
          [AGENT_ID, null],
        ]),
      });

      const fileBuffer = await exportAgent(sourceRuntime, "state-test");
      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const result = await importAgent(
        createMockRuntime(targetDb),
        fileBuffer,
        "state-test",
      );

      expect(result.counts.participants).toBe(3);

      // Verify the states were set on the target DB
      for (const [_roomId, data] of targetDb.participants) {
        for (const eid of data.entityIds) {
          const _state = data.userStates.get(eid);
          // We can't check exact entity IDs (they're remapped) but we should
          // have at least one FOLLOWED and one MUTED
        }
      }
      const allStates: Array<string | null | undefined> = [];
      for (const data of targetDb.participants.values()) {
        for (const [, state] of data.userStates) {
          allStates.push(state);
        }
      }
      expect(allStates).toContain("FOLLOWED");
      expect(allStates).toContain("MUTED");
    });
  });

  describe("component cross-reference remapping", () => {
    it("remaps entityId, roomId, worldId, sourceEntityId on components", async () => {
      sourceDb.agents.set(AGENT_ID, makeAgent());
      const world = makeWorld();
      sourceDb.worlds.set(world.id ?? "", world);
      const room = makeRoom({ worldId: world.id });
      sourceDb.rooms.set(room.id ?? "", room);
      const entity = makeEntity();
      sourceDb.entities.set(entity.id ?? "", entity);
      const entity2 = makeEntity({ names: ["Bob"] });
      sourceDb.entities.set(entity2.id ?? "", entity2);

      sourceDb.participants.set(room.id ?? "", {
        entityIds: [AGENT_ID, entity.id ?? "", entity2.id ?? ""],
        userStates: new Map(),
      });

      const comp = makeComponent({
        entityId: entity.id,
        roomId: room.id,
        worldId: world.id,
        sourceEntityId: entity2.id,
      });
      sourceDb.components.push(comp);

      const originalEntityId = entity.id ?? "";
      const originalRoomId = room.id ?? "";
      const originalWorldId = world.id ?? "";
      const originalSourceEntityId = entity2.id ?? "";

      const fileBuffer = await exportAgent(sourceRuntime, "comp-remap");
      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const result = await importAgent(
        createMockRuntime(targetDb),
        fileBuffer,
        "comp-remap",
      );

      expect(result.counts.components).toBe(1);
      const importedComp = targetDb.components[0];

      // All IDs should be different from originals (remapped)
      expect(importedComp.id).not.toBe(comp.id);
      expect(importedComp.entityId).not.toBe(originalEntityId);
      expect(importedComp.roomId).not.toBe(originalRoomId);
      expect(importedComp.worldId).not.toBe(originalWorldId);
      expect(importedComp.sourceEntityId).not.toBe(originalSourceEntityId);

      // But they should reference valid remapped IDs that exist in the target DB
      expect(targetDb.entities.has(importedComp.entityId ?? "")).toBe(true);
      expect(targetDb.rooms.has(importedComp.roomId ?? "")).toBe(true);
      expect(targetDb.worlds.has(importedComp.worldId ?? "")).toBe(true);
      expect(targetDb.entities.has(importedComp.sourceEntityId ?? "")).toBe(
        true,
      );
    });
  });

  describe("memory table name resolution", () => {
    it("exports and imports memories of different types correctly", async () => {
      sourceDb.agents.set(AGENT_ID, makeAgent());
      const room = makeRoom();
      sourceDb.rooms.set(room.id ?? "", room);
      sourceDb.participants.set(room.id ?? "", {
        entityIds: [AGENT_ID],
        userStates: new Map(),
      });

      // Create memories with different metadata types
      const msgMem = makeMemory({
        roomId: room.id,
        metadata: { type: "message" },
        content: { text: "msg" },
      });
      const docMem = makeMemory({
        roomId: room.id,
        metadata: { type: "document" },
        content: { text: "doc" },
      });
      const fragMem = makeMemory({
        roomId: room.id,
        metadata: { type: "fragment" },
        content: { text: "frag" },
      });
      const descMem = makeMemory({
        roomId: room.id,
        metadata: { type: "description" },
        content: { text: "desc" },
      });
      const customMem = makeMemory({
        roomId: room.id,
        metadata: { type: "custom" },
        content: { text: "custom" },
      });

      // Memory with no metadata type but a top-level type field (fallback path)
      const fallbackMem = {
        ...makeMemory({ roomId: room.id, content: { text: "fallback" } }),
        metadata: undefined,
        type: "facts",
      } as unknown as Memory;

      sourceDb.memories.push(
        msgMem,
        docMem,
        fragMem,
        descMem,
        customMem,
        fallbackMem,
      );

      const fileBuffer = await exportAgent(sourceRuntime, "mem-types");
      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const result = await importAgent(
        createMockRuntime(targetDb),
        fileBuffer,
        "mem-types",
      );

      expect(result.counts.memories).toBe(6);

      // Verify all content survived
      const texts = targetDb.memories.map((m) => m.content?.text).sort();
      expect(texts).toEqual([
        "custom",
        "desc",
        "doc",
        "fallback",
        "frag",
        "msg",
      ]);
    });
  });

  describe("embeddings stripped", () => {
    it("removes embedding vectors from exported memories", async () => {
      sourceDb.agents.set(AGENT_ID, makeAgent());
      const room = makeRoom();
      sourceDb.rooms.set(room.id ?? "", room);
      sourceDb.participants.set(room.id ?? "", {
        entityIds: [AGENT_ID],
        userStates: new Map(),
      });

      // Create a memory with a large embedding
      const memWithEmbedding = makeMemory({
        roomId: room.id,
        content: { text: "embedded" },
      });
      (memWithEmbedding as Record<string, unknown>).embedding = new Array(
        1536,
      ).fill(0.5);
      sourceDb.memories.push(memWithEmbedding);

      const fileBuffer = await exportAgent(sourceRuntime, "embed-test");

      // The exported file should be much smaller than it would be with embeddings
      // 1536 floats * ~10 bytes each = ~15KB. File should be well under that.
      expect(fileBuffer.length).toBeLessThan(5000);

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      await importAgent(createMockRuntime(targetDb), fileBuffer, "embed-test");

      // Verify the imported memory has no embedding
      expect(targetDb.memories[0].embedding).toBeUndefined();
      expect(targetDb.memories[0].content?.text).toBe("embedded");
    });
  });

  describe("relationship data preservation", () => {
    it("preserves tags and metadata on relationships", async () => {
      sourceDb.agents.set(AGENT_ID, makeAgent());
      const entity = makeEntity();
      sourceDb.entities.set(entity.id ?? "", entity);
      const room = makeRoom();
      sourceDb.rooms.set(room.id ?? "", room);
      sourceDb.participants.set(room.id ?? "", {
        entityIds: [AGENT_ID, entity.id ?? ""],
        userStates: new Map(),
      });

      sourceDb.relationships.push(
        makeRelationship({
          targetEntityId: entity.id,
          tags: ["friend", "colleague", "trusted"],
          metadata: {
            trust: 0.95,
            since: "2024-01-01",
            notes: "Met at conference",
          },
        }),
      );

      const fileBuffer = await exportAgent(sourceRuntime, "rel-data");
      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      await importAgent(createMockRuntime(targetDb), fileBuffer, "rel-data");

      expect(targetDb.relationships.length).toBe(1);
      const rel = targetDb.relationships[0];
      expect(rel.tags).toEqual(["friend", "colleague", "trusted"]);
      expect(rel.metadata).toEqual({
        trust: 0.95,
        since: "2024-01-01",
        notes: "Met at conference",
      });
    });
  });

  describe("agent not found in database", () => {
    it("throws AgentExportError when the agent record is missing", async () => {
      // Don't add the agent to the DB — it's empty
      await expect(exportAgent(sourceRuntime, "pass")).rejects.toThrow(
        AgentExportError,
      );
      await expect(exportAgent(sourceRuntime, "pass")).rejects.toThrow(
        /not found/i,
      );
    });
  });

  describe("schema validation on import", () => {
    it("rejects a file with valid encryption but missing required fields", async () => {
      // Manually craft an encrypted file with an incomplete payload
      const { gzipSync } = await import("node:zlib");
      const nodeCrypto = await import("node:crypto");

      const badPayload = { version: 1, exportedAt: "now" }; // missing most fields
      const compressed = gzipSync(
        Buffer.from(JSON.stringify(badPayload), "utf-8"),
      );

      const password = "schema-test";
      const salt = nodeCrypto.randomBytes(32);
      const iv = nodeCrypto.randomBytes(12);
      const key = nodeCrypto.pbkdf2Sync(password, salt, 600_000, 32, "sha256");
      const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(compressed),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();

      const iterBuf = Buffer.alloc(4);
      iterBuf.writeUInt32BE(600_000, 0);
      const fileBuffer = Buffer.concat([
        Buffer.from("ELIZA_AGENT_V1\n", "utf-8"),
        iterBuf,
        salt,
        iv,
        tag,
        ciphertext,
      ]);

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const targetRuntime = createMockRuntime(targetDb);

      const err = await importAgent(targetRuntime, fileBuffer, password).catch(
        (e: Error) => e,
      );
      expect(err).toBeInstanceOf(AgentExportError);
      expect(err.message).toMatch(/schema validation failed/i);
    });
  });

  describe("unicode and special characters", () => {
    it("handles unicode passwords correctly", async () => {
      sourceDb.agents.set(AGENT_ID, makeAgent());

      const unicodePassword = "p\u00e4ssw\u00f6rd-\u2603-\ud83d\udd12"; // pässwörd-☃-🔒
      const fileBuffer = await exportAgent(sourceRuntime, unicodePassword);

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const result = await importAgent(
        createMockRuntime(targetDb),
        fileBuffer,
        unicodePassword,
      );
      expect(result.success).toBe(true);
    });

    it("preserves unicode content in memories", async () => {
      sourceDb.agents.set(AGENT_ID, makeAgent());
      const room = makeRoom();
      sourceDb.rooms.set(room.id ?? "", room);
      sourceDb.participants.set(room.id ?? "", {
        entityIds: [AGENT_ID],
        userStates: new Map(),
      });

      sourceDb.memories.push(
        makeMemory({
          roomId: room.id,
          content: {
            text: "Hello \u4e16\u754c! \ud83c\udf0d \u00e9\u00e0\u00fc\u00f1",
          }, // Hello 世界! 🌍 éàüñ
        }),
      );

      const fileBuffer = await exportAgent(sourceRuntime, "unicode-test");
      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      await importAgent(
        createMockRuntime(targetDb),
        fileBuffer,
        "unicode-test",
      );

      expect(targetDb.memories[0].content?.text).toBe(
        "Hello \u4e16\u754c! \ud83c\udf0d \u00e9\u00e0\u00fc\u00f1",
      );
    });
  });

  describe("estimateExportSize", () => {
    it("returns counts matching the actual data", async () => {
      const { estimateExportSize } = await import("./agent-export.js");

      populateDb(sourceDb);

      const estimate = await estimateExportSize(sourceRuntime);
      expect(estimate.memoriesCount).toBe(3);
      expect(estimate.roomsCount).toBe(1);
      expect(estimate.worldsCount).toBe(1);
      expect(estimate.entitiesCount).toBeGreaterThanOrEqual(1);
      expect(estimate.tasksCount).toBe(1);
      expect(estimate.estimatedBytes).toBeGreaterThan(0);
    });

    it("returns zero counts for an empty agent", async () => {
      const { estimateExportSize } = await import("./agent-export.js");
      sourceDb.agents.set(AGENT_ID, makeAgent());

      const estimate = await estimateExportSize(sourceRuntime);
      expect(estimate.memoriesCount).toBe(0);
      expect(estimate.roomsCount).toBe(0);
      expect(estimate.worldsCount).toBe(0);
      expect(estimate.entitiesCount).toBe(0);
      expect(estimate.tasksCount).toBe(0);
      expect(estimate.estimatedBytes).toBe(2000); // base overhead only
    });
  });

  describe("concurrent exports", () => {
    it("produces independent encrypted files from parallel exports", async () => {
      populateDb(sourceDb);

      const [file1, file2] = await Promise.all([
        exportAgent(sourceRuntime, "concurrent-1"),
        exportAgent(sourceRuntime, "concurrent-2"),
      ]);

      // Files should be different (different random salt/IV)
      expect(file1.equals(file2)).toBe(false);

      // Both should be importable with their respective passwords
      const db1 = createMockDb();
      db1.agents.set(AGENT_ID, makeAgent());
      const r1 = await importAgent(
        createMockRuntime(db1),
        file1,
        "concurrent-1",
      );
      expect(r1.success).toBe(true);

      const db2 = createMockDb();
      db2.agents.set(AGENT_ID, makeAgent());
      const r2 = await importAgent(
        createMockRuntime(db2),
        file2,
        "concurrent-2",
      );
      expect(r2.success).toBe(true);

      // Cross-password should fail
      const db3 = createMockDb();
      db3.agents.set(AGENT_ID, makeAgent());
      const err = await importAgent(
        createMockRuntime(db3),
        file1,
        "concurrent-2",
      ).catch((e: Error) => e);
      expect(err).toBeInstanceOf(AgentExportError);
    });
  });

  describe("file boundary conditions", () => {
    it("rejects a file that is exactly the header size (79 bytes) with no ciphertext", async () => {
      const exactHeader = Buffer.alloc(79, 0);
      Buffer.from("ELIZA_AGENT_V1\n").copy(exactHeader);
      // iterations
      exactHeader.writeUInt32BE(600000, 15);
      // rest is zeros (salt, iv, tag)

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      await expect(
        importAgent(createMockRuntime(targetDb), exactHeader, "pass"),
      ).rejects.toThrow(/no encrypted data/i);
    });

    it("rejects a zero-length buffer", async () => {
      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      await expect(
        importAgent(createMockRuntime(targetDb), Buffer.alloc(0), "pass"),
      ).rejects.toThrow(/too small/i);
    });
  });

  describe("data integrity deep inspection", () => {
    it("verifies all agent fields survive the round-trip", async () => {
      const richAgent = makeAgent({
        name: "RichAgent",
        username: "richagent",
        bio: ["Line 1 of bio", "Line 2 of bio", "Line 3"],
        system: "You are a rich test agent with complex configuration.",
        topics: ["finance", "technology", "art"],
        adjectives: ["sophisticated", "knowledgeable"],
        style: {
          all: ["formal", "precise"],
          chat: ["warm", "engaging"],
          post: ["authoritative"],
        },
        settings: {
          secrets: {
            OPENAI_API_KEY: "sk-rich-key",
            TELEGRAM_BOT_TOKEN: "123456:ABC-DEF",
            CUSTOM_SECRET: "my-secret-value",
          },
          should_respond_model: "large",
          default_temperature: 0.7,
        },
      });
      sourceDb.agents.set(AGENT_ID, richAgent);

      const fileBuffer = await exportAgent(sourceRuntime, "deep-inspect");
      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const result = await importAgent(
        createMockRuntime(targetDb),
        fileBuffer,
        "deep-inspect",
      );

      const imported = targetDb.agents.get(result.agentId);
      if (!imported) throw new Error("Expected imported agent to exist");
      expect(imported.name).toBe("RichAgent");
      expect(imported.username).toBe("richagent");
      expect(imported.bio).toEqual([
        "Line 1 of bio",
        "Line 2 of bio",
        "Line 3",
      ]);
      expect(imported.system).toBe(
        "You are a rich test agent with complex configuration.",
      );
      expect(imported.topics).toEqual(["finance", "technology", "art"]);
      expect(imported.adjectives).toEqual(["sophisticated", "knowledgeable"]);
      expect(imported.style).toEqual({
        all: ["formal", "precise"],
        chat: ["warm", "engaging"],
        post: ["authoritative"],
      });

      const settings = imported.settings as Record<string, unknown>;
      const secrets = settings.secrets as Record<string, unknown>;
      expect(secrets.OPENAI_API_KEY).toBe("sk-rich-key");
      expect(secrets.TELEGRAM_BOT_TOKEN).toBe("123456:ABC-DEF");
      expect(secrets.CUSTOM_SECRET).toBe("my-secret-value");
      expect(settings.should_respond_model).toBe("large");
      expect(settings.default_temperature).toBe(0.7);

      // Timestamps should be fresh (not from the source)
      expect(imported.createdAt).toBeGreaterThan(0);
      expect(imported.updatedAt).toBeGreaterThan(0);
      expect(imported.enabled).toBe(true);
    });
  });

  describe("version check on import", () => {
    it("rejects a file with a future version number", async () => {
      // Craft an encrypted file with version:99
      const { gzipSync } = await import("node:zlib");
      const nodeCrypto = await import("node:crypto");

      const futurePayload = {
        version: 99,
        exportedAt: new Date().toISOString(),
        sourceAgentId: crypto.randomUUID(),
        agent: { id: crypto.randomUUID(), name: "Future" },
        entities: [],
        memories: [],
        components: [],
        rooms: [],
        participants: [],
        relationships: [],
        worlds: [],
        tasks: [],
        logs: [],
      };
      const compressed = gzipSync(
        Buffer.from(JSON.stringify(futurePayload), "utf-8"),
      );

      const password = "version-test";
      const salt = nodeCrypto.randomBytes(32);
      const iv = nodeCrypto.randomBytes(12);
      const key = nodeCrypto.pbkdf2Sync(password, salt, 600_000, 32, "sha256");
      const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(compressed),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();

      const iterBuf = Buffer.alloc(4);
      iterBuf.writeUInt32BE(600_000, 0);
      const fileBuffer = Buffer.concat([
        Buffer.from("ELIZA_AGENT_V1\n", "utf-8"),
        iterBuf,
        salt,
        iv,
        tag,
        ciphertext,
      ]);

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const err = await importAgent(
        createMockRuntime(targetDb),
        fileBuffer,
        password,
      ).catch((e: Error) => e);
      expect(err).toBeInstanceOf(AgentExportError);
      expect(err.message).toMatch(/unsupported export version 99/i);
      expect(err.message).toMatch(/update your software/i);
    });
  });

  describe("schema rejects records without id fields", () => {
    it("rejects memories without id", async () => {
      const { gzipSync } = await import("node:zlib");
      const nodeCrypto = await import("node:crypto");

      const badPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        sourceAgentId: crypto.randomUUID(),
        agent: { id: crypto.randomUUID(), name: "Bad" },
        entities: [],
        memories: [{ content: { text: "no id here" } }], // missing id
        components: [],
        rooms: [],
        participants: [],
        relationships: [],
        worlds: [],
        tasks: [],
        logs: [],
      };
      const compressed = gzipSync(
        Buffer.from(JSON.stringify(badPayload), "utf-8"),
      );

      const password = "schema-id-test";
      const salt = nodeCrypto.randomBytes(32);
      const iv = nodeCrypto.randomBytes(12);
      const key = nodeCrypto.pbkdf2Sync(password, salt, 600_000, 32, "sha256");
      const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(compressed),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();

      const iterBuf = Buffer.alloc(4);
      iterBuf.writeUInt32BE(600_000, 0);
      const fileBuffer = Buffer.concat([
        Buffer.from("ELIZA_AGENT_V1\n", "utf-8"),
        iterBuf,
        salt,
        iv,
        tag,
        ciphertext,
      ]);

      const targetDb = createMockDb();
      targetDb.agents.set(AGENT_ID, makeAgent());
      const err = await importAgent(
        createMockRuntime(targetDb),
        fileBuffer,
        password,
      ).catch((e: Error) => e);
      expect(err).toBeInstanceOf(AgentExportError);
      expect(err.message).toMatch(/schema validation failed/i);
    });
  });

  describe("createAgent failure", () => {
    it("throws AgentExportError when db.createAgent returns false", async () => {
      populateDb(sourceDb);
      const fileBuffer = await exportAgent(sourceRuntime, "fail-create");

      // Create a target runtime whose createAgent always returns false
      const targetDb = createMockDb();
      const _targetAdapter = Object.create(
        Object.getPrototypeOf(createMockRuntime(targetDb)),
      );
      const baseRuntime = createMockRuntime(targetDb);
      const failRuntime = {
        ...baseRuntime,
        adapter: {
          ...baseRuntime.adapter,
          createAgent: async () => false,
        },
      } as unknown as AgentRuntime;

      const err = await importAgent(
        failRuntime,
        fileBuffer,
        "fail-create",
      ).catch((e: Error) => e);
      expect(err).toBeInstanceOf(AgentExportError);
      expect(err.message).toMatch(/failed to create agent/i);
    });
  });
});
