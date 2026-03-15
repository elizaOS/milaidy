/**
 * Snapshot Manager
 *
 * Manages the in-memory state for the cloud agent. Provides capture()
 * and restore() for snapshotting agent state across container restarts,
 * migrations, or scaling events.
 *
 * The state includes:
 *   - Chat memories (user + assistant messages)
 *   - Agent configuration
 *   - Workspace files
 *   - Startup timestamp
 */

import type { AgentState, MemoryEntry } from "../types.js";
import type { SnapshotData, RestoreData } from "../bridge/protocol.js";

// ─── Snapshot Manager ───────────────────────────────────────────────────

export class SnapshotManager {
  /** The mutable in-memory state. */
  private state: AgentState;

  constructor() {
    this.state = {
      memories: [],
      config: {},
      workspaceFiles: {},
      startedAt: new Date().toISOString(),
    };
  }

  // ─── State Accessors ────────────────────────────────────────────────

  /** Get the current startup timestamp. */
  get startedAt(): string {
    return this.state.startedAt;
  }

  /** Get the current memories array. */
  get memories(): MemoryEntry[] {
    return this.state.memories;
  }

  /** Get the current config object. */
  get config(): Record<string, unknown> {
    return this.state.config;
  }

  /** Get the current workspace files. */
  get workspaceFiles(): Record<string, string> {
    return this.state.workspaceFiles;
  }

  // ─── Memory Management ──────────────────────────────────────────────

  /**
   * Add a memory entry (user or assistant message).
   */
  addMemory(entry: MemoryEntry): void {
    this.state.memories.push(entry);
  }

  /**
   * Add a user/assistant message pair to memory.
   */
  addExchange(userText: string, assistantText: string): void {
    const timestamp = Date.now();
    this.state.memories.push({ role: "user", text: userText, timestamp });
    this.state.memories.push({
      role: "assistant",
      text: assistantText,
      timestamp,
    });
  }

  // ─── Snapshot Operations ────────────────────────────────────────────

  /**
   * Capture the current state as a snapshot.
   * Returns a JSON-serializable object.
   */
  capture(): SnapshotData {
    return {
      memories: this.state.memories,
      config: this.state.config,
      workspaceFiles: this.state.workspaceFiles,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Restore state from a snapshot.
   * Only overwrites fields that are present in the incoming data.
   */
  restore(data: RestoreData): void {
    if (data.memories) {
      this.state.memories = data.memories as MemoryEntry[];
    }
    if (data.config) {
      this.state.config = data.config;
    }
    if (data.workspaceFiles) {
      this.state.workspaceFiles = data.workspaceFiles;
    }
    console.log("[cloud-agent] State restored from snapshot");
  }

  /**
   * Get the raw state object (read-only reference).
   */
  getState(): Readonly<AgentState> {
    return this.state;
  }
}
