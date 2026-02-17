/**
 * Database View — Supabase-style table browser + SQL editor.
 *
 * Two modes:
 *  - Table browser: sidebar with schema tree, spreadsheet-like data grid
 *  - SQL editor: code textarea with run button and results grid
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ColumnInfo,
  client,
  type DatabaseStatus,
  type QueryResult,
  type TableInfo,
  type TableRowsResponse,
} from "../api-client";

type DbView = "tables" | "query";
type SortDir = "asc" | "desc" | null;

/** Format a cell value for display. */
function formatCell(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "object") {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

/** Abbreviated type label for column badges. */
function typeLabel(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("int")) return "int";
  if (t.includes("serial")) return "serial";
  if (t.includes("bool")) return "bool";
  if (
    t.includes("float") ||
    t.includes("double") ||
    t.includes("numeric") ||
    t.includes("real")
  )
    return "float";
  if (t.includes("json")) return "json";
  if (t.includes("uuid")) return "uuid";
  if (t.includes("timestamp")) return "time";
  if (t.includes("date")) return "date";
  if (t.includes("text") || t.includes("char") || t.includes("varchar"))
    return "text";
  if (t.includes("vector")) return "vector";
  if (t.includes("bytea")) return "bytes";
  return type.slice(0, 6);
}

/** Color for column type badge. */
function typeBadgeColor(type: string): string {
  const t = type.toLowerCase();
  if (
    t.includes("int") ||
    t.includes("serial") ||
    t.includes("float") ||
    t.includes("numeric") ||
    t.includes("real") ||
    t.includes("double")
  )
    return "text-amber-400 bg-amber-400/10";
  if (t.includes("bool")) return "text-purple-400 bg-purple-400/10";
  if (t.includes("json")) return "text-orange-400 bg-orange-400/10";
  if (t.includes("uuid")) return "text-cyan-400 bg-cyan-400/10";
  if (t.includes("timestamp") || t.includes("date"))
    return "text-pink-400 bg-pink-400/10";
  if (t.includes("text") || t.includes("char"))
    return "text-green-400 bg-green-400/10";
  if (t.includes("vector")) return "text-blue-400 bg-blue-400/10";
  return "text-[var(--muted)] bg-[var(--muted)]/10";
}

// ── Cell inspect popover ──────────────────────────────────────────────

function CellPopover({
  value,
  onClose,
}: {
  value: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-[var(--card)] border border-[var(--border)] shadow-lg p-3 max-w-[500px] max-h-[300px] overflow-auto"
      style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-[var(--muted)] uppercase font-bold">
          Cell Value
        </span>
        <button
          type="button"
          className="text-[var(--muted)] hover:text-[var(--txt)] bg-transparent border-0 cursor-pointer text-sm"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <pre className="text-xs text-[var(--txt)] font-mono whitespace-pre-wrap break-all m-0">
        {value}
      </pre>
    </div>
  );
}

// ── Results grid (shared between table browser and SQL editor) ─────────

function ResultsGrid({
  columns,
  rows,
  columnMeta,
  sortCol,
  sortDir,
  onSort,
  onCellClick,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  columnMeta?: Map<string, ColumnInfo>;
  sortCol?: string;
  sortDir?: SortDir;
  onSort?: (col: string) => void;
  onCellClick?: (value: string) => void;
}) {
  return (
    <div
      className="overflow-auto border border-[var(--border)] bg-[var(--card)]"
      style={{ maxHeight: "calc(100vh - 340px)" }}
    >
      <table className="w-full border-collapse text-[12px] font-mono">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[var(--bg)]">
            {/* Row number column */}
            <th className="w-[50px] min-w-[50px] px-2 py-2 text-[10px] text-[var(--muted)] font-medium text-right border-b border-r border-[var(--border)] bg-[var(--bg)]">
              #
            </th>
            {columns.map((col) => {
              const meta = columnMeta?.get(col);
              const isSorted = sortCol === col;
              return (
                <th
                  key={col}
                  className="px-3 py-2 text-left border-b border-r border-[var(--border)] bg-[var(--bg)] whitespace-nowrap cursor-pointer select-none hover:bg-[var(--border)]/30 transition-colors"
                  onClick={() => onSort?.(col)}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[var(--txt)] font-semibold">
                      {col}
                    </span>
                    {meta && (
                      <span
                        className={`text-[9px] px-1 py-px rounded font-medium ${typeBadgeColor(meta.type)}`}
                      >
                        {typeLabel(meta.type)}
                      </span>
                    )}
                    {meta?.isPrimaryKey && (
                      <span className="text-[9px] px-1 py-px rounded font-bold text-yellow-400 bg-yellow-400/10">
                        PK
                      </span>
                    )}
                    {isSorted && (
                      <span className="text-[10px] text-[var(--accent)]">
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={JSON.stringify(row)}
              className="border-b border-[var(--border)] hover:bg-[var(--accent)]/5 transition-colors"
            >
              <td className="px-2 py-1.5 text-[10px] text-[var(--muted)] text-right border-r border-[var(--border)] bg-[var(--bg)]/50 tabular-nums">
                {i + 1}
              </td>
              {columns.map((col) => {
                const raw = row[col];
                const display = formatCell(raw);
                const isNull = raw === null || raw === undefined;
                const isExpandable = display.length > 40 && !!onCellClick;
                return (
                  <td
                    key={col}
                    className="px-3 py-1.5 border-r border-[var(--border)] max-w-[280px] truncate cursor-default"
                    title={display}
                    onClick={() => {
                      if (isExpandable) onCellClick(display);
                    }}
                    onKeyDown={(e) => {
                      if (!isExpandable) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onCellClick(display);
                      }
                    }}
                    role={isExpandable ? "button" : undefined}
                    tabIndex={isExpandable ? 0 : undefined}
                  >
                    {isNull ? (
                      <span className="text-[var(--muted)] italic opacity-50">
                        NULL
                      </span>
                    ) : (
                      <span className="text-[var(--txt)]">{display}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Pagination bar ────────────────────────────────────────────────────

function PaginationBar({
  total,
  offset,
  limit,
  onPrev,
  onNext,
}: {
  total: number;
  offset: number;
  limit: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const start = offset + 1;
  const end = Math.min(offset + limit, total);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div className="flex items-center justify-between px-3 py-2 border border-t-0 border-[var(--border)] bg-[var(--bg)] text-[11px] text-[var(--muted)]">
      <span>
        {total.toLocaleString()} row{total !== 1 ? "s" : ""}
        {total > 0 && ` · showing ${start}-${end}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="px-2 py-1 border border-[var(--border)] bg-[var(--card)] text-[var(--txt)] text-[11px] cursor-pointer disabled:opacity-30 disabled:cursor-default hover:bg-[var(--border)]/30"
          disabled={!hasPrev}
          onClick={onPrev}
        >
          Prev
        </button>
        <button
          type="button"
          className="px-2 py-1 border border-[var(--border)] bg-[var(--card)] text-[var(--txt)] text-[11px] cursor-pointer disabled:opacity-30 disabled:cursor-default hover:bg-[var(--border)]/30"
          disabled={!hasNext}
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function DatabaseView() {
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [tableData, setTableData] = useState<TableRowsResponse | null>(null);
  const [columnMeta, setColumnMeta] = useState<Map<string, ColumnInfo>>(
    new Map(),
  );
  const [view, setView] = useState<DbView>("tables");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [rowOffset, setRowOffset] = useState(0);
  const [cellInspect, setCellInspect] = useState<string | null>(null);

  // SQL editor state
  const [queryText, setQueryText] = useState("");
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);

  const ROW_LIMIT = 50;

  const loadStatus = useCallback(async (): Promise<DatabaseStatus | null> => {
    try {
      const status = await client.getDatabaseStatus();
      setDbStatus(status);
      return status;
    } catch {
      return null;
    }
  }, []);

  const loadTables = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const { tables: t } = await client.getDatabaseTables();
      setTables(t);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      // Don't show error if database is simply not connected (cloud mode, agent not running)
      if (!msg.includes("Database not available")) {
        setErrorMessage(`Failed to load tables: ${msg}`);
      }
    }
    setLoading(false);
  }, []);

  const loadTableData = useCallback(
    async (
      tableName: string,
      opts?: { sort?: string; order?: "asc" | "desc"; offset?: number },
    ) => {
      setLoading(true);
      setErrorMessage("");
      try {
        const data = await client.getDatabaseRows(tableName, {
          limit: ROW_LIMIT,
          offset: opts?.offset ?? 0,
          sort: opts?.sort,
          order: opts?.order,
        });
        setTableData(data);
        setSelectedTable(tableName);

        // Get column metadata for the table
        const info = tables.find((t) => t.name === tableName);
        if (info?.columns) {
          const meta = new Map<string, ColumnInfo>();
          for (const col of info.columns) meta.set(col.name, col);
          setColumnMeta(meta);
        }
      } catch (err) {
        setErrorMessage(
          `Failed to load table: ${err instanceof Error ? err.message : "error"}`,
        );
      }
      setLoading(false);
    },
    [tables],
  );

  const handleSort = useCallback(
    (col: string) => {
      let newDir: SortDir;
      if (sortCol !== col) {
        newDir = "asc";
      } else if (sortDir === "asc") {
        newDir = "desc";
      } else {
        newDir = null;
      }
      setSortCol(newDir ? col : "");
      setSortDir(newDir);
      setRowOffset(0);
      if (selectedTable) {
        loadTableData(selectedTable, {
          sort: newDir ? col : undefined,
          order: newDir ?? undefined,
          offset: 0,
        });
      }
    },
    [sortCol, sortDir, selectedTable, loadTableData],
  );

  const handleSelectTable = useCallback(
    (tableName: string) => {
      setSortCol("");
      setSortDir(null);
      setRowOffset(0);
      loadTableData(tableName);
    },
    [loadTableData],
  );

  const handlePrev = useCallback(() => {
    const newOffset = Math.max(0, rowOffset - ROW_LIMIT);
    setRowOffset(newOffset);
    loadTableData(selectedTable, {
      sort: sortDir ? sortCol : undefined,
      order: sortDir ?? undefined,
      offset: newOffset,
    });
  }, [rowOffset, selectedTable, sortCol, sortDir, loadTableData]);

  const handleNext = useCallback(() => {
    const newOffset = rowOffset + ROW_LIMIT;
    setRowOffset(newOffset);
    loadTableData(selectedTable, {
      sort: sortDir ? sortCol : undefined,
      order: sortDir ?? undefined,
      offset: newOffset,
    });
  }, [rowOffset, selectedTable, sortCol, sortDir, loadTableData]);

  const runQuery = useCallback(async () => {
    if (!queryText.trim()) return;
    setQueryLoading(true);
    setErrorMessage("");
    try {
      const result = await client.executeDatabaseQuery(queryText);
      setQueryResult(result);
      setQueryHistory((prev) => {
        const next = [queryText, ...prev.filter((q) => q !== queryText)];
        return next.slice(0, 20);
      });
    } catch (err) {
      setErrorMessage(
        `Query failed: ${err instanceof Error ? err.message : "error"}`,
      );
    }
    setQueryLoading(false);
  }, [queryText]);

  useEffect(() => {
    const init = async () => {
      const status = await loadStatus();
      if (status?.connected) {
        await loadTables();
      }
    };
    void init();
  }, [loadStatus, loadTables]);

  const filteredTables = tables.filter(
    (t) =>
      !sidebarSearch ||
      t.name.toLowerCase().includes(sidebarSearch.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
          {dbStatus ? (
            <>
              <span
                className={`w-1.5 h-1.5 rounded-full ${dbStatus.connected ? "bg-green-400" : "bg-red-400"}`}
              />
              <span>{dbStatus.provider}</span>
              <span className="opacity-40">·</span>
              <span>{dbStatus.tableCount} tables</span>
            </>
          ) : (
            <span>Connecting...</span>
          )}
        </div>

        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex border border-[var(--border)] rounded-sm overflow-hidden">
          <button
            type="button"
            className={`px-3 py-1 text-[11px] cursor-pointer border-0 transition-colors ${
              view === "tables"
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--txt)]"
            }`}
            onClick={() => setView("tables")}
          >
            Table Editor
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-[11px] cursor-pointer border-0 border-l border-[var(--border)] transition-colors ${
              view === "query"
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--txt)]"
            }`}
            onClick={() => setView("query")}
          >
            SQL Editor
          </button>
        </div>

        <button
          type="button"
          className="px-2.5 py-1 text-[11px] border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] cursor-pointer hover:text-[var(--txt)] hover:bg-[var(--border)]/30"
          onClick={async () => {
            const status = await loadStatus();
            if (status?.connected) {
              await loadTables();
            }
          }}
        >
          Refresh
        </button>
      </div>

      {dbStatus && !dbStatus.connected && (
        <div className="p-3 border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] text-xs mb-3">
          <p className="m-0 mb-1 font-medium text-[var(--txt)]">
            Database not available
          </p>
          <p className="m-0">
            The database viewer requires a local agent with a database
            connection. If you're running in cloud mode, the database is managed
            remotely.
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="p-2.5 border border-[var(--danger)] text-[var(--danger)] text-xs mb-3 flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            type="button"
            className="text-[var(--danger)] opacity-60 hover:opacity-100 bg-transparent border-0 cursor-pointer text-sm"
            onClick={() => setErrorMessage("")}
          >
            ×
          </button>
        </div>
      )}

      {view === "tables" ? (
        /* ── Table Editor ──────────────────────────────────────── */
        <div className="flex flex-1 min-h-0 gap-0">
          {/* Sidebar */}
          <div
            className={`flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg)] transition-all overflow-hidden ${sidebarCollapsed ? "w-0 border-r-0" : "w-[200px]"}`}
          >
            <div className="p-2">
              <div className="flex items-center gap-1 mb-2">
                <input
                  type="text"
                  placeholder="Filter tables..."
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  className="flex-1 px-2 py-1 border border-[var(--border)] bg-[var(--card)] text-[var(--txt)] text-[11px] min-w-0"
                />
              </div>
              <div className="text-[9px] text-[var(--muted)] uppercase font-bold tracking-wider mb-1 px-1">
                Tables ({filteredTables.length})
              </div>
              {loading && tables.length === 0 ? (
                <div className="text-[11px] text-[var(--muted)] px-1">
                  Loading...
                </div>
              ) : (
                <div className="flex flex-col gap-px max-h-[calc(100vh-280px)] overflow-auto">
                  {filteredTables.map((t) => (
                    <button
                      type="button"
                      key={t.name}
                      onClick={() => handleSelectTable(t.name)}
                      className={`flex items-center justify-between px-2 py-1.5 text-[11px] text-left border-0 cursor-pointer transition-colors rounded-sm w-full ${
                        selectedTable === t.name
                          ? "bg-[var(--accent)]/15 text-[var(--accent)] font-medium"
                          : "bg-transparent text-[var(--txt)] hover:bg-[var(--border)]/30"
                      }`}
                    >
                      <span className="truncate">{t.name}</span>
                      <span className="text-[9px] text-[var(--muted)] tabular-nums flex-shrink-0 ml-1">
                        {t.rowCount}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Toggle sidebar */}
          <button
            type="button"
            className="flex-shrink-0 w-4 flex items-center justify-center bg-transparent border-0 cursor-pointer text-[var(--muted)] hover:text-[var(--txt)] hover:bg-[var(--border)]/20"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            <span className="text-[10px]">{sidebarCollapsed ? "▶" : "◀"}</span>
          </button>

          {/* Main grid area */}
          <div className="flex-1 min-w-0 flex flex-col">
            {!selectedTable ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-[var(--muted)] text-sm mb-1">
                    Select a table
                  </div>
                  <div className="text-[var(--muted)] text-[11px] opacity-60">
                    Choose a table from the sidebar to browse its data
                  </div>
                </div>
              </div>
            ) : loading && !tableData ? (
              <div className="flex-1 flex items-center justify-center text-[var(--muted)] text-sm italic">
                Loading...
              </div>
            ) : tableData ? (
              <>
                {/* Table header bar */}
                <div className="flex items-center gap-2 px-1 py-1.5 text-[11px]">
                  <span className="text-[var(--txt)] font-semibold">
                    {selectedTable}
                  </span>
                  {columnMeta.size > 0 && (
                    <span className="text-[var(--muted)]">
                      ({columnMeta.size} columns)
                    </span>
                  )}
                </div>

                {/* Data grid */}
                <div className="flex-1 min-h-0">
                  {tableData.rows.length === 0 ? (
                    <div className="flex items-center justify-center h-full border border-[var(--border)] bg-[var(--card)]">
                      <div className="text-[var(--muted)] text-sm">
                        Table is empty
                      </div>
                    </div>
                  ) : (
                    <ResultsGrid
                      columns={tableData.columns}
                      rows={tableData.rows}
                      columnMeta={columnMeta}
                      sortCol={sortCol}
                      sortDir={sortDir}
                      onSort={handleSort}
                      onCellClick={(v) => setCellInspect(v)}
                    />
                  )}
                </div>

                {/* Pagination */}
                <PaginationBar
                  total={tableData.total}
                  offset={rowOffset}
                  limit={ROW_LIMIT}
                  onPrev={handlePrev}
                  onNext={handleNext}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : (
        /* ── SQL Editor ────────────────────────────────────────── */
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          {/* Editor area */}
          <div className="flex flex-col">
            <div className="relative">
              <textarea
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    runQuery();
                  }
                }}
                placeholder="SELECT * FROM memories LIMIT 50;"
                rows={6}
                className="w-full px-3 py-2.5 border border-[var(--border)] bg-[var(--card)] text-[var(--txt)] text-[12px] font-mono resize-y leading-relaxed"
                spellCheck={false}
              />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                className="px-4 py-1.5 text-[11px] font-medium bg-[var(--accent)] text-[var(--accent-foreground)] border border-[var(--accent)] cursor-pointer hover:opacity-80 disabled:opacity-30 disabled:cursor-default transition-opacity"
                disabled={queryLoading || !queryText.trim()}
                onClick={runQuery}
              >
                {queryLoading ? "Running..." : "Run"}
              </button>
              <span className="text-[10px] text-[var(--muted)]">
                {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter
              </span>
              {queryResult && (
                <span className="text-[10px] text-[var(--muted)] ml-auto">
                  {queryResult.rowCount} row
                  {queryResult.rowCount !== 1 ? "s" : ""} ·{" "}
                  {queryResult.durationMs}ms
                </span>
              )}
            </div>
          </div>

          {/* Query history dropdown */}
          {queryHistory.length > 0 && !queryResult && (
            <div className="border border-[var(--border)] bg-[var(--card)]">
              <div className="px-3 py-1.5 text-[9px] text-[var(--muted)] uppercase font-bold tracking-wider border-b border-[var(--border)]">
                Recent queries
              </div>
              {queryHistory.slice(0, 5).map((q) => (
                <button
                  type="button"
                  key={q}
                  className="w-full px-3 py-1.5 text-[11px] font-mono text-[var(--txt)] text-left bg-transparent border-0 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--accent)]/5 truncate"
                  onClick={() => setQueryText(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Results */}
          {queryResult && queryResult.rows.length > 0 && (
            <div className="flex-1 min-h-0">
              <ResultsGrid
                columns={queryResult.columns}
                rows={queryResult.rows}
                onCellClick={(v) => setCellInspect(v)}
              />
            </div>
          )}

          {queryResult && queryResult.rows.length === 0 && (
            <div className="flex items-center justify-center py-8 border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] text-sm">
              Query returned no rows
            </div>
          )}
        </div>
      )}

      {/* Cell inspect overlay */}
      {cellInspect !== null && (
        <CellPopover value={cellInspect} onClose={() => setCellInspect(null)} />
      )}
    </div>
  );
}
