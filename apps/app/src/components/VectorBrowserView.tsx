/**
 * Vector Browser — explore agent memories and embeddings.
 *
 * Reads from the memories table (or similar vector-storage tables) using
 * the generic database APIs. Shows paginated memory records with content,
 * metadata, and embedding previews. Click any card to see full details.
 * Toggle to a 2D scatter-plot graph view of embeddings.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { client, type TableInfo, type QueryResult } from "../api-client";

const PAGE_SIZE = 25;

type ViewMode = "list" | "graph";

/** The dimension columns in the ElizaOS `embeddings` table. */
const DIM_COLUMNS = ["dim_384", "dim_512", "dim_768", "dim_1024", "dim_1536", "dim_3072"] as const;

interface MemoryRecord {
  id: string;
  content: string;
  roomId: string;
  entityId: string;
  type: string;
  createdAt: string;
  unique: boolean;
  embedding: number[] | null;
  raw: Record<string, unknown>;
}

/** Try to parse a JSON content field, returning the text content or the raw string. */
function parseContent(val: unknown): string {
  if (typeof val !== "string") return String(val ?? "");
  if (val.startsWith("{")) {
    try {
      const parsed = JSON.parse(val);
      if (parsed.text) return String(parsed.text);
      return val;
    } catch {
      return val;
    }
  }
  return val;
}

/** Parse an embedding from various storage formats (pgvector text, JSON, typed arrays). */
function parseEmbedding(val: unknown): number[] | null {
  if (!val) return null;
  if (Array.isArray(val)) return val as number[];
  // Handle typed arrays (Float32Array, Float64Array, Uint8Array etc.)
  if (ArrayBuffer.isView(val)) {
    return Array.from(val as Float64Array);
  }
  if (typeof val === "string" && val.length > 2) {
    const trimmed = val.trim();
    // pgvector text format: [0.1,0.2,0.3] — also valid JSON
    // Also handle without brackets: 0.1,0.2,0.3
    const inner = trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;
    if (!inner) return null;
    // Fast path: split by comma and parse floats
    const parts = inner.split(",");
    if (parts.length < 2) return null;
    const nums: number[] = [];
    for (const p of parts) {
      const n = Number.parseFloat(p);
      if (Number.isNaN(n)) return null;
      nums.push(n);
    }
    return nums;
  }
  return null;
}

function rowToMemory(row: Record<string, unknown>): MemoryRecord {
  // Try explicit embedding/vector column first, then check ElizaOS dim_* columns
  let embeddingVal = row.embedding ?? row.vector ?? row.embeddings;
  if (!embeddingVal) {
    for (const dim of DIM_COLUMNS) {
      if (row[dim]) {
        embeddingVal = row[dim];
        break;
      }
    }
  }

  return {
    id: String(row.id ?? row.ID ?? row.memory_id ?? ""),
    content: parseContent(row.content ?? row.body ?? row.text ?? ""),
    roomId: String(row.roomId ?? row.room_id ?? row.roomID ?? ""),
    entityId: String(row.entityId ?? row.entity_id ?? row.entityID ?? row.userId ?? row.user_id ?? ""),
    type: String(row.type ?? row.memoryType ?? row.memory_type ?? ""),
    createdAt: String(row.createdAt ?? row.created_at ?? row.timestamp ?? ""),
    unique: row.unique === true || row.unique === 1 || row.isUnique === true,
    embedding: parseEmbedding(embeddingVal),
    raw: row,
  };
}

// ── Simple PCA-like 2D projection ──────────────────────────────────────

/** Project high-dimensional vectors to 2D using the first two principal axes. */
function projectTo2D(vectors: number[][]): [number, number][] {
  if (vectors.length === 0) return [];
  const dims = vectors[0].length;
  const n = vectors.length;

  // Compute mean
  const mean = new Float64Array(dims);
  for (const v of vectors) {
    for (let d = 0; d < dims; d++) mean[d] += v[d];
  }
  for (let d = 0; d < dims; d++) mean[d] /= n;

  // Center data
  const centered = vectors.map((v) => v.map((x, d) => x - mean[d]));

  // Power iteration for top-2 components
  const pc1 = powerIteration(centered, dims);
  // Deflate
  const proj1 = centered.map((v) => dot(v, pc1));
  const deflated = centered.map((v, i) => v.map((x, d) => x - proj1[i] * pc1[d]));
  const pc2 = powerIteration(deflated, dims);

  // Project
  return centered.map((v) => [dot(v, pc1), dot(v, pc2)] as [number, number]);
}

function dot(a: number[], b: Float64Array | number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * (b[i] ?? 0);
  return s;
}

function powerIteration(data: number[][], dims: number, iters = 30): Float64Array {
  const v = new Float64Array(dims);
  // Random init
  for (let d = 0; d < dims; d++) v[d] = Math.random() - 0.5;
  normalize(v);

  for (let iter = 0; iter < iters; iter++) {
    const w = new Float64Array(dims);
    for (const row of data) {
      const d = dot(row, v);
      for (let j = 0; j < dims; j++) w[j] += d * row[j];
    }
    normalize(w);
    for (let d = 0; d < dims; d++) v[d] = w[d];
  }
  return v;
}

function normalize(v: Float64Array) {
  let len = 0;
  for (let i = 0; i < v.length; i++) len += v[i] * v[i];
  len = Math.sqrt(len) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= len;
}

// ── Graph sub-component ────────────────────────────────────────────────

function VectorGraph({
  memories,
  onSelect,
}: {
  memories: MemoryRecord[];
  onSelect: (mem: MemoryRecord) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [points, setPoints] = useState<[number, number][]>([]);

  // Keep embeddings subset for the graph — memoize to avoid recomputation
  const withEmbeddings = useMemo(
    () => memories.filter((m) => m.embedding !== null),
    [memories],
  );

  useEffect(() => {
    if (withEmbeddings.length < 2) {
      setPoints([]);
      return;
    }
    const vecs = withEmbeddings.map((m) => m.embedding!);
    const projected = projectTo2D(vecs);
    setPoints(projected);
  }, [withEmbeddings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || points.length === 0) return;

    const rect = container.getBoundingClientRect();
    const W = rect.width;
    const H = 500;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Compute bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const pad = 40;

    const toScreenX = (x: number) => pad + ((x - minX) / rangeX) * (W - 2 * pad);
    const toScreenY = (y: number) => pad + ((y - minY) / rangeY) * (H - 2 * pad);

    // Background
    const style = getComputedStyle(document.documentElement);
    const bgColor = style.getPropertyValue("--bg").trim() || "#111";
    const borderColor = style.getPropertyValue("--border").trim() || "#333";
    const accentColor = style.getPropertyValue("--accent").trim() || "#6cf";
    const mutedColor = style.getPropertyValue("--muted").trim() || "#888";

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const x = pad + (i / 4) * (W - 2 * pad);
      const y = pad + (i / 4) * (H - 2 * pad);
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, H - pad); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    }

    // Axis labels
    ctx.fillStyle = mutedColor;
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("PC1", W / 2, H - 8);
    ctx.save();
    ctx.translate(12, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("PC2", 0, 0);
    ctx.restore();

    // Collect unique types for color mapping
    const types = [...new Set(withEmbeddings.map((m) => m.type))];
    const typeColors: Record<string, string> = {};
    const palette = [accentColor, "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
    for (let i = 0; i < types.length; i++) {
      typeColors[types[i]] = palette[i % palette.length];
    }

    // Draw points
    for (let i = 0; i < points.length; i++) {
      const sx = toScreenX(points[i][0]);
      const sy = toScreenY(points[i][1]);
      const mem = withEmbeddings[i];
      const color = typeColors[mem.type] || accentColor;
      const isHovered = hoveredIdx === i;

      ctx.beginPath();
      ctx.arc(sx, sy, isHovered ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = isHovered ? 1 : 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (isHovered) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Tooltip for hovered point
    if (hoveredIdx !== null && hoveredIdx < points.length) {
      const sx = toScreenX(points[hoveredIdx][0]);
      const sy = toScreenY(points[hoveredIdx][1]);
      const mem = withEmbeddings[hoveredIdx];
      const label = mem.content.slice(0, 60) + (mem.content.length > 60 ? "..." : "");

      ctx.font = "11px sans-serif";
      const metrics = ctx.measureText(label);
      const tw = metrics.width + 12;
      const th = 22;
      let tx = sx + 10;
      let ty = sy - 10 - th;
      if (tx + tw > W) tx = sx - tw - 10;
      if (ty < 0) ty = sy + 10;

      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.fillRect(tx, ty, tw, th);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.fillText(label, tx + 6, ty + 15);
    }

    // Legend
    if (types.length > 1) {
      let lx = pad;
      const ly = H - 4;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "left";
      for (const t of types) {
        if (!t || t === "undefined") continue;
        ctx.fillStyle = typeColors[t];
        ctx.fillRect(lx, ly - 8, 8, 8);
        ctx.fillStyle = mutedColor;
        ctx.fillText(t, lx + 11, ly);
        lx += ctx.measureText(t).width + 24;
      }
    }
  }, [points, hoveredIdx, withEmbeddings]);

  // Mouse interaction
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || points.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const W = rect.width;
      const H = rect.height;
      const pad = 40;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of points) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;

      const toScreenX = (x: number) => pad + ((x - minX) / rangeX) * (W - 2 * pad);
      const toScreenY = (y: number) => pad + ((y - minY) / rangeY) * (H - 2 * pad);

      let closest = -1;
      let closestDist = 15; // max pixel distance
      for (let i = 0; i < points.length; i++) {
        const sx = toScreenX(points[i][0]);
        const sy = toScreenY(points[i][1]);
        const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }
      setHoveredIdx(closest >= 0 ? closest : null);
    },
    [points],
  );

  const handleClick = useCallback(() => {
    if (hoveredIdx !== null && hoveredIdx < withEmbeddings.length) {
      onSelect(withEmbeddings[hoveredIdx]);
    }
  }, [hoveredIdx, withEmbeddings, onSelect]);

  if (withEmbeddings.length < 2) {
    return (
      <div className="text-center py-16">
        <div className="text-[var(--muted)] text-sm mb-2">Not enough embeddings for graph view</div>
        <div className="text-[var(--muted)] text-xs">
          Need at least 2 memories with embedding data. Found {withEmbeddings.length}.
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full">
      <div className="text-[11px] text-[var(--muted)] mb-2">
        {withEmbeddings.length} vectors projected to 2D via PCA — click a point to view details
      </div>
      <canvas
        ref={canvasRef}
        className="w-full border border-[var(--border)] cursor-crosshair"
        style={{ height: 500 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIdx(null)}
        onClick={handleClick}
      />
    </div>
  );
}

// ── Detail modal ───────────────────────────────────────────────────────

function MemoryDetailModal({
  memory,
  onClose,
}: {
  memory: MemoryRecord;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div
        className="bg-[var(--card)] border border-[var(--border)] max-w-[700px] w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
          <div className="text-xs font-medium text-[var(--txt)]">Memory Detail</div>
          <button
            className="text-[var(--muted)] hover:text-[var(--txt)] bg-transparent border-0 cursor-pointer text-lg px-2"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="text-[11px] text-[var(--muted)] mb-1 uppercase font-bold">Content</div>
          <div className="text-xs text-[var(--txt)] whitespace-pre-wrap break-words mb-4 p-2 bg-[var(--bg)] border border-[var(--border)] max-h-[200px] overflow-auto">
            {memory.content || "(empty)"}
          </div>

          {/* Metadata */}
          <div className="text-[11px] text-[var(--muted)] mb-1 uppercase font-bold">Metadata</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-4">
            <span className="text-[var(--muted)]">ID</span>
            <span className="text-[var(--txt)] font-mono truncate">{memory.id || "—"}</span>
            <span className="text-[var(--muted)]">Type</span>
            <span className="text-[var(--txt)]">{memory.type || "—"}</span>
            <span className="text-[var(--muted)]">Room</span>
            <span className="text-[var(--txt)] font-mono truncate">{memory.roomId || "—"}</span>
            <span className="text-[var(--muted)]">Entity</span>
            <span className="text-[var(--txt)] font-mono truncate">{memory.entityId || "—"}</span>
            <span className="text-[var(--muted)]">Created</span>
            <span className="text-[var(--txt)]">{memory.createdAt || "—"}</span>
            <span className="text-[var(--muted)]">Unique</span>
            <span className="text-[var(--txt)]">{memory.unique ? "Yes" : "No"}</span>
          </div>

          {/* Embedding */}
          {memory.embedding && (
            <>
              <div className="text-[11px] text-[var(--muted)] mb-1 uppercase font-bold">
                Embedding ({memory.embedding.length} dimensions)
              </div>
              <div className="p-2 bg-[var(--bg)] border border-[var(--border)] text-[10px] font-mono text-[var(--muted)] max-h-[150px] overflow-auto break-all mb-4">
                [{memory.embedding.map((v) => v.toFixed(6)).join(", ")}]
              </div>
            </>
          )}

          {/* Raw data */}
          <details>
            <summary className="text-[11px] text-[var(--muted)] cursor-pointer hover:text-[var(--txt)] uppercase font-bold mb-1">
              Raw Record
            </summary>
            <div className="p-2 bg-[var(--bg)] border border-[var(--border)] text-[10px] font-mono text-[var(--muted)] max-h-[200px] overflow-auto break-all">
              {JSON.stringify(memory.raw, null, 2)}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export function VectorBrowserView() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedMemory, setSelectedMemory] = useState<MemoryRecord | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [graphMemories, setGraphMemories] = useState<MemoryRecord[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);
  const [stats, setStats] = useState<{ total: number; dimensions: number; uniqueCount: number } | null>(null);

  // Track whether the `embeddings` table exists for JOIN queries
  const [hasEmbeddingsTable, setHasEmbeddingsTable] = useState(false);

  // Discover vector/memory tables
  const loadTables = useCallback(async () => {
    try {
      const { tables: allTables } = await client.getDatabaseTables();
      const vectorTables = allTables.filter((t) => {
        const n = t.name.toLowerCase();
        return n.includes("memor") || n.includes("embed") || n.includes("vector") || n.includes("knowledge");
      });
      const available = vectorTables.length > 0 ? vectorTables : allTables;
      setTables(available);

      // Check for separate embeddings table (ElizaOS stores vectors there)
      const embTbl = allTables.find((t) => t.name === "embeddings");
      setHasEmbeddingsTable(!!embTbl);

      if (available.length > 0 && !selectedTable) {
        const preferred = available.find((t) => t.name.toLowerCase() === "memories")
          ?? available.find((t) => t.name.toLowerCase().includes("memor"));
        setSelectedTable(preferred?.name ?? available[0].name);
      }
    } catch (err) {
      setError(`Failed to load tables: ${err instanceof Error ? err.message : "error"}`);
    }
  }, [selectedTable]);

  // Build a SELECT that casts any vector/embedding column to text so the raw
  // driver returns a parseable string instead of a binary blob.
  const buildSelect = useCallback(
    async (table: string): Promise<string> => {
      try {
        const colResult: QueryResult = await client.executeDatabaseQuery(
          `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table.replace(/'/g, "''")}' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY ordinal_position`,
        );
        const cols = colResult.rows.map((r) => {
          const name = String(r.column_name);
          const dtype = String(r.data_type).toLowerCase();
          // Cast USER-DEFINED types (pgvector) and bytea to text
          if (dtype === "user-defined" || dtype === "bytea" || dtype === "vector") {
            return `"${name}"::text AS "${name}"`;
          }
          return `"${name}"`;
        });
        if (cols.length > 0) return cols.join(", ");
      } catch {
        // fall through to SELECT *
      }
      return "*";
    },
    [],
  );

  /**
   * Build a query that JOINs memories with the embeddings table when applicable.
   * The embeddings table stores vectors in dim_* columns (pgvector), which we
   * cast to ::text so the driver returns a parseable string.
   */
  const buildJoinQuery = useCallback(
    (opts: { where?: string; limit: number; offset?: number }): string => {
      const isMemories = selectedTable === "memories" && hasEmbeddingsTable;
      const { where, limit, offset } = opts;

      if (isMemories) {
        // Build dim column selects with ::text cast
        const dimCols = DIM_COLUMNS.map((d) => `e."${d}"::text AS "${d}"`).join(", ");
        return [
          `SELECT m.*, ${dimCols}`,
          `FROM "memories" m`,
          `LEFT JOIN "embeddings" e ON e."memory_id" = m."id"`,
          where ? `WHERE ${where}` : "",
          `ORDER BY m."created_at" DESC`,
          `LIMIT ${limit}`,
          offset ? `OFFSET ${offset}` : "",
        ].filter(Boolean).join(" ");
      }

      // For other tables, use buildSelect to cast any vector columns
      return ""; // signal to caller to use the old path
    },
    [selectedTable, hasEmbeddingsTable],
  );

  // Load memory records for list view
  const loadMemories = useCallback(async () => {
    if (!selectedTable) return;
    setLoading(true);
    setError("");
    try {
      const offset = page * PAGE_SIZE;
      const searchEscaped = search.replace(/'/g, "''");
      const countWhere = search ? ` WHERE "content"::text LIKE '%${searchEscaped}%'` : "";
      const joinWhere = search
        ? `m."content"::text LIKE '%${searchEscaped}%'`
        : undefined;

      const countResult: QueryResult = await client.executeDatabaseQuery(
        `SELECT COUNT(*) as cnt FROM "${selectedTable}"${countWhere}`,
      );
      const total = Number(countResult.rows[0]?.cnt ?? 0);
      setTotalCount(total);

      // Try JOIN path for memories + embeddings
      const joinSql = buildJoinQuery({ where: joinWhere, limit: PAGE_SIZE, offset });
      let result: QueryResult;

      if (joinSql) {
        result = await client.executeDatabaseQuery(joinSql);
      } else {
        const selectCols = await buildSelect(selectedTable);
        const plainWhere = search ? ` WHERE "content"::text LIKE '%${searchEscaped}%'` : "";
        result = await client.executeDatabaseQuery(
          `SELECT ${selectCols} FROM "${selectedTable}"${plainWhere} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
        );
      }
      setMemories(result.rows.map(rowToMemory));

      // Stats on first load
      if (page === 0 && !search) {
        let dims = 0;
        let uniqueCount = 0;

        if (result.rows.length > 0) {
          const sample = rowToMemory(result.rows[0]);
          if (sample.embedding) dims = sample.embedding.length;
        }

        try {
          const uniqueResult: QueryResult = await client.executeDatabaseQuery(
            `SELECT COUNT(*) as cnt FROM "${selectedTable}" WHERE "unique" = true OR "unique" = 1`,
          );
          uniqueCount = Number(uniqueResult.rows[0]?.cnt ?? 0);
        } catch {
          // column might not exist
        }

        setStats({ total, dimensions: dims, uniqueCount });
      }
    } catch (err) {
      setError(`Failed to load memories: ${err instanceof Error ? err.message : "error"}`);
    }
    setLoading(false);
  }, [selectedTable, page, search, buildSelect, buildJoinQuery, hasEmbeddingsTable]);

  // Load embeddings for graph view (fetch more rows to make graph useful)
  // Only include rows that actually have embeddings (INNER JOIN or filter).
  const loadGraphData = useCallback(async () => {
    if (!selectedTable) return;
    setGraphLoading(true);
    try {
      const isMemories = selectedTable === "memories" && hasEmbeddingsTable;
      let result: QueryResult;

      if (isMemories) {
        // INNER JOIN ensures only rows with embeddings are returned
        const dimCols = DIM_COLUMNS.map((d) => `e."${d}"::text AS "${d}"`).join(", ");
        result = await client.executeDatabaseQuery(
          `SELECT m.*, ${dimCols} FROM "memories" m INNER JOIN "embeddings" e ON e."memory_id" = m."id" ORDER BY m."created_at" DESC LIMIT 500`,
        );
      } else {
        const selectCols = await buildSelect(selectedTable);
        result = await client.executeDatabaseQuery(
          `SELECT ${selectCols} FROM "${selectedTable}" LIMIT 500`,
        );
      }
      setGraphMemories(result.rows.map(rowToMemory));
    } catch (err) {
      setError(`Failed to load graph data: ${err instanceof Error ? err.message : "error"}`);
    }
    setGraphLoading(false);
  }, [selectedTable, buildSelect, hasEmbeddingsTable]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  useEffect(() => {
    if (viewMode === "list") loadMemories();
  }, [loadMemories, viewMode]);

  useEffect(() => {
    if (viewMode === "graph") loadGraphData();
  }, [loadGraphData, viewMode]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(0);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div>
      {/* Stats bar */}
      {stats && (
        <div className="flex gap-4 mb-4 text-[11px] text-[var(--muted)]">
          <span>{stats.total.toLocaleString()} memories</span>
          {stats.uniqueCount > 0 && <span>{stats.uniqueCount.toLocaleString()} unique</span>}
          {stats.dimensions > 0 && <span>{stats.dimensions} dimensions</span>}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {viewMode === "list" && (
          <div className="flex gap-1">
            <input
              type="text"
              placeholder="Search content..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--txt)] text-xs w-[220px]"
            />
            <button
              className="px-3 py-1.5 text-xs bg-[var(--accent)] text-[var(--accent-fg)] border border-[var(--accent)] cursor-pointer hover:opacity-80"
              onClick={handleSearch}
            >
              Search
            </button>
          </div>
        )}

        {tables.length > 1 && (
          <select
            value={selectedTable}
            onChange={(e) => {
              setSelectedTable(e.target.value);
              setPage(0);
              setSearch("");
              setSearchInput("");
            }}
            className="px-2 py-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--txt)] text-xs"
          >
            {tables.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.rowCount})
              </option>
            ))}
          </select>
        )}

        {/* View mode toggle */}
        <div className="flex gap-1 ml-auto">
          <button
            className={`px-3 py-1.5 text-xs cursor-pointer border transition-colors ${
              viewMode === "list"
                ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                : "bg-transparent text-[var(--muted)] border-[var(--border)] hover:text-[var(--txt)]"
            }`}
            onClick={() => setViewMode("list")}
          >
            List
          </button>
          <button
            className={`px-3 py-1.5 text-xs cursor-pointer border transition-colors ${
              viewMode === "graph"
                ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                : "bg-transparent text-[var(--muted)] border-[var(--border)] hover:text-[var(--txt)]"
            }`}
            onClick={() => setViewMode("graph")}
          >
            Graph
          </button>
        </div>

        {viewMode === "list" && (
          <span className="text-[11px] text-[var(--muted)]">
            {totalCount > 0
              ? `${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, totalCount)} of ${totalCount.toLocaleString()}`
              : ""}
          </span>
        )}
      </div>

      {error && (
        <div className="p-2.5 border border-[var(--danger)] text-[var(--danger)] text-xs mb-3">
          {error}
        </div>
      )}

      {/* Graph view */}
      {viewMode === "graph" && (
        graphLoading ? (
          <div className="text-center py-16 text-[var(--muted)] text-sm italic">Loading embeddings...</div>
        ) : (
          <VectorGraph memories={graphMemories} onSelect={setSelectedMemory} />
        )
      )}

      {/* List view */}
      {viewMode === "list" && (
        loading ? (
          <div className="text-center py-16 text-[var(--muted)] text-sm italic">Loading memories...</div>
        ) : memories.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-[var(--muted)] text-sm mb-2">No memories found</div>
            <div className="text-[var(--muted)] text-xs">
              {search
                ? "No records match your search query."
                : "No memory records detected in the database."}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {memories.map((mem) => (
              <button
                key={mem.id || `${mem.content.slice(0, 30)}-${mem.createdAt}`}
                className="border border-[var(--border)] bg-[var(--card)] p-3 cursor-pointer text-left hover:border-[var(--accent)] transition-colors w-full"
                onClick={() => setSelectedMemory(mem)}
              >
                {/* Content preview */}
                <div className="text-xs text-[var(--txt)] mb-2 whitespace-pre-wrap break-words">
                  {mem.content.length > 200 ? `${mem.content.slice(0, 200)}...` : mem.content}
                </div>

                {/* Metadata row */}
                <div className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--muted)]">
                  {mem.type && mem.type !== "undefined" && (
                    <span className="px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)]">
                      {mem.type}
                    </span>
                  )}
                  {mem.roomId && mem.roomId !== "undefined" && (
                    <span>Room: {mem.roomId.slice(0, 12)}</span>
                  )}
                  {mem.entityId && mem.entityId !== "undefined" && (
                    <span>Entity: {mem.entityId.slice(0, 12)}</span>
                  )}
                  {mem.createdAt && mem.createdAt !== "undefined" && (
                    <span>{mem.createdAt}</span>
                  )}
                  {mem.unique && (
                    <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 font-bold">unique</span>
                  )}
                  {mem.embedding && (
                    <span className="font-mono">
                      [{mem.embedding.length}d]
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {/* Pagination (list view only) */}
      {viewMode === "list" && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4 pb-4">
          <button
            className="px-3 py-1.5 text-xs bg-[var(--accent)] text-[var(--accent-fg)] border border-[var(--accent)] cursor-pointer hover:opacity-80 disabled:opacity-40 disabled:cursor-default"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </button>
          <span className="text-[11px] text-[var(--muted)]">
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="px-3 py-1.5 text-xs bg-[var(--accent)] text-[var(--accent-fg)] border border-[var(--accent)] cursor-pointer hover:opacity-80 disabled:opacity-40 disabled:cursor-default"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* Detail modal */}
      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
        />
      )}
    </div>
  );
}
