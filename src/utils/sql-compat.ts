import type { AgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";

const repairedRuntimes = new WeakSet<AgentRuntime>();
const repairPromises = new WeakMap<AgentRuntime, Promise<void>>();

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function sanitizeIdentifier(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const sanitized = trimmed.replace(/[^a-zA-Z0-9_]/g, "");
  return sanitized.length > 0 ? sanitized : null;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function executeRawSql(
  runtime: AgentRuntime,
  sqlText: string,
): Promise<{
  rows: Record<string, unknown>[];
  columns: string[];
}> {
  const db = runtime.adapter?.db as
    | {
        execute: (query: { queryChunks: unknown[] }) => Promise<{
          rows: Record<string, unknown>[];
          fields?: Array<{ name: string }>;
        }>;
      }
    | undefined;

  if (!db?.execute) {
    throw new Error("Database adapter not available");
  }

  const { sql } = await import("drizzle-orm");
  const result = await db.execute(sql.raw(sqlText));
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const columns = Array.isArray(result.fields)
    ? result.fields.map((field) => field.name)
    : Object.keys(rows[0] ?? {});

  return { rows, columns };
}

async function getTableColumnNames(
  runtime: AgentRuntime,
  tableName: string,
  schemaName = "public",
): Promise<Set<string>> {
  const columns = new Set<string>();

  try {
    const { rows } = await executeRawSql(
      runtime,
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = ${sqlLiteral(schemaName)}
          AND table_name = ${sqlLiteral(tableName)}
        ORDER BY ordinal_position`,
    );

    for (const row of rows) {
      const value = row.column_name;
      if (typeof value === "string" && value.length > 0) {
        columns.add(value);
      }
    }
  } catch {
    // Fall through to PRAGMA for PGlite/SQLite compatibility.
  }

  if (columns.size > 0) {
    return columns;
  }

  try {
    const safeTableName = sanitizeIdentifier(tableName);
    if (!safeTableName) {
      return columns;
    }

    const { rows } = await executeRawSql(
      runtime,
      `PRAGMA table_info(${safeTableName})`,
    );

    for (const row of rows) {
      const value = row.name;
      if (typeof value === "string" && value.length > 0) {
        columns.add(value);
      }
    }
  } catch {
    // Ignore missing-table/missing-pragma support.
  }

  return columns;
}

async function addColumnIfMissing(
  runtime: AgentRuntime,
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> {
  const columns = await getTableColumnNames(runtime, tableName);
  if (columns.has(columnName)) {
    return;
  }

  const safeTable = sanitizeIdentifier(tableName);
  const safeColumn = sanitizeIdentifier(columnName);
  if (!safeTable || !safeColumn) {
    return;
  }

  try {
    await executeRawSql(
      runtime,
      `ALTER TABLE ${quoteIdent(safeTable)}
       ADD COLUMN IF NOT EXISTS ${quoteIdent(safeColumn)} ${definition}`,
    );
  } catch (errorWithIfExists) {
    try {
      await executeRawSql(
        runtime,
        `ALTER TABLE ${quoteIdent(safeTable)}
         ADD COLUMN ${quoteIdent(safeColumn)} ${definition}`,
      );
    } catch (errorPlain) {
      const message =
        `${errorWithIfExists instanceof Error ? errorWithIfExists.message : String(errorWithIfExists)} | ${errorPlain instanceof Error ? errorPlain.message : String(errorPlain)}`.toLowerCase();

      if (
        message.includes("already exists") ||
        message.includes("duplicate column") ||
        message.includes("duplicate_column")
      ) {
        return;
      }

      throw errorPlain;
    }
  }
}

export async function ensureRuntimeSqlCompatibility(
  runtime: AgentRuntime | null | undefined,
): Promise<void> {
  if (!runtime?.adapter?.db) {
    return;
  }

  if (repairedRuntimes.has(runtime)) {
    return;
  }

  const existingRepair = repairPromises.get(runtime);
  if (existingRepair) {
    await existingRepair;
    return;
  }

  const repairPromise = (async () => {
    try {
      await addColumnIfMissing(
        runtime,
        "participants",
        "agent_id",
        'uuid REFERENCES "agents"("id") ON DELETE CASCADE',
      );
      await addColumnIfMissing(runtime, "participants", "room_state", "text");

      try {
        const participantColumns = await getTableColumnNames(
          runtime,
          "participants",
        );

        if (
          participantColumns.has("room_state") &&
          participantColumns.has("user_state")
        ) {
          await executeRawSql(
            runtime,
            `UPDATE participants
                SET room_state = COALESCE(room_state, user_state)
              WHERE user_state IS NOT NULL`,
          );
        }

        if (participantColumns.has("agent_id")) {
          await executeRawSql(
            runtime,
            `UPDATE participants AS participants
                SET agent_id = rooms.agent_id
               FROM rooms
              WHERE participants.room_id = rooms.id
                AND participants.agent_id IS NULL`,
          );
        }
      } catch (error) {
        logger.warn(
          `[milady-sql-compat] Participant repair failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      for (const [columnName, definition] of [
        ["step_count", "integer NOT NULL DEFAULT 0"],
        ["llm_call_count", "integer NOT NULL DEFAULT 0"],
        ["total_prompt_tokens", "integer NOT NULL DEFAULT 0"],
        ["total_completion_tokens", "integer NOT NULL DEFAULT 0"],
        ["total_reward", "real NOT NULL DEFAULT 0"],
        ["scenario_id", "text"],
        ["batch_id", "text"],
      ] as const) {
        try {
          await addColumnIfMissing(
            runtime,
            "trajectories",
            columnName,
            definition,
          );
        } catch (error) {
          logger.warn(
            `[milady-sql-compat] Trajectory repair failed for ${columnName}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      repairedRuntimes.add(runtime);
    } catch (error) {
      logger.warn(
        `[milady-sql-compat] Compatibility repair failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  })().finally(() => {
    repairPromises.delete(runtime);
  });

  repairPromises.set(runtime, repairPromise);
  await repairPromise;
}
