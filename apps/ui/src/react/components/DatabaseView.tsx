/**
 * Database View — wrapper for the database viewer.
 *
 * This is a placeholder that delegates to the existing database viewer
 * functionality. The full database viewer with tables, queries, and
 * config can be expanded here.
 */

import { useState, useEffect, useCallback } from "react";
import {
  client,
  type DatabaseStatus,
  type TableInfo,
  type TableRowsResponse,
  type QueryResult,
} from "../../ui/api-client.js";
import { useApp } from "../AppContext.js";

type DbView = "tables" | "query";

export function DatabaseView() {
  const _app = useApp();
  void _app; // context available for future use

  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [tableData, setTableData] = useState<TableRowsResponse | null>(null);
  const [view, setView] = useState<DbView>("tables");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const status = await client.getDatabaseStatus();
      setDbStatus(status);
    } catch {
      /* ignore */
    }
  }, []);

  const loadTables = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const { tables: t } = await client.getDatabaseTables();
      setTables(t);
    } catch (err) {
      setErrorMessage(`Failed to load tables: ${err instanceof Error ? err.message : "error"}`);
    }
    setLoading(false);
  }, []);

  const loadTableData = useCallback(async (tableName: string) => {
    setLoading(true);
    try {
      const data = await client.getDatabaseRows(tableName);
      setTableData(data);
      setSelectedTable(tableName);
    } catch (err) {
      setErrorMessage(`Failed to load table: ${err instanceof Error ? err.message : "error"}`);
    }
    setLoading(false);
  }, []);

  const runQuery = useCallback(async () => {
    if (!queryText.trim()) return;
    setQueryLoading(true);
    setErrorMessage("");
    try {
      const result = await client.executeDatabaseQuery(queryText);
      setQueryResult(result);
    } catch (err) {
      setErrorMessage(`Query failed: ${err instanceof Error ? err.message : "error"}`);
    }
    setQueryLoading(false);
  }, [queryText]);

  useEffect(() => {
    loadStatus();
    loadTables();
  }, [loadStatus, loadTables]);

  const filteredTables = tables.filter((t) =>
    !sidebarSearch || t.name.toLowerCase().includes(sidebarSearch.toLowerCase()),
  );

  return (
    <div>
      <h2 className="text-lg font-normal text-txt-strong mb-2">Database</h2>
      <p className="text-[13px] text-muted mb-5">
        {dbStatus
          ? `${dbStatus.provider} — ${dbStatus.tableCount} tables`
          : "Loading status..."}
      </p>

      <div className="flex gap-1 mb-3.5">
        <button
          className={`text-xs px-3 py-1 bg-accent text-accent-fg cursor-pointer ${view === "tables" ? "font-bold" : ""}`}
          onClick={() => setView("tables")}
        >
          Tables
        </button>
        <button
          className={`text-xs px-3 py-1 bg-accent text-accent-fg cursor-pointer ${view === "query" ? "font-bold" : ""}`}
          onClick={() => setView("query")}
        >
          SQL Query
        </button>
        <span className="flex-1" />
        <button
          className="text-xs px-3 py-1 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover"
          onClick={loadTables}
        >
          Refresh
        </button>
      </div>

      {errorMessage && (
        <div className="p-2.5 border border-danger text-danger text-xs mb-3">
          {errorMessage}
        </div>
      )}

      {view === "tables" ? (
        <div className="flex gap-4 min-h-[400px]">
          {/* Table sidebar */}
          <div className="w-[220px] border-r border-border pr-3">
            <input
              type="text"
              placeholder="Search tables..."
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="w-full px-2 py-1.5 border border-border bg-card text-txt text-xs mb-2"
            />
            {loading && tables.length === 0 ? (
              <div className="text-xs text-muted">Loading...</div>
            ) : (
              filteredTables.map((t) => (
                <div
                  key={t.name}
                  onClick={() => loadTableData(t.name)}
                  className={`px-2 py-1.5 cursor-pointer text-xs hover:bg-bg-hover ${
                    selectedTable === t.name
                      ? "bg-bg-hover font-bold border-l-2 border-l-accent"
                      : ""
                  }`}
                >
                  {t.name}
                  <span className="text-muted ml-1 text-[10px]">({t.rowCount})</span>
                </div>
              ))
            )}
          </div>

          {/* Table data */}
          <div className="flex-1 min-w-0 overflow-auto">
            {!selectedTable ? (
              <div className="text-center py-10 text-muted italic">Select a table to view its data.</div>
            ) : loading ? (
              <div className="text-center py-10 text-muted italic">Loading...</div>
            ) : tableData ? (
              <div className="overflow-auto">
                <div className="text-[11px] text-muted mb-2">
                  {tableData.total} rows total (showing {tableData.rows.length})
                </div>
                <table className="w-full border-collapse text-xs font-mono">
                  <thead>
                    <tr>
                      {tableData.columns.map((col: string) => (
                        <th
                          key={col}
                          className="text-left px-2 py-1.5 border-b-2 border-border text-[11px] font-bold whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.rows.map((row: Record<string, unknown>, i: number) => (
                      <tr key={i}>
                        {tableData.columns.map((col: string) => (
                          <td
                            key={col}
                            className="px-2 py-1 border-b border-border max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap"
                          >
                            {String(row[col] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div>
          <textarea
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="SELECT * FROM ..."
            rows={6}
            className="w-full px-2.5 py-2 border border-border bg-card text-txt text-xs font-mono resize-y"
          />
          <div className="flex gap-2 mt-2">
            <button
              className="px-4 py-1.5 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
              disabled={queryLoading || !queryText.trim()}
              onClick={runQuery}
            >
              {queryLoading ? "Running..." : "Run Query"}
            </button>
          </div>

          {queryResult && (
            <div className="mt-4 overflow-auto">
              <div className="text-[11px] text-muted mb-2">
                {queryResult.rowCount} rows — {queryResult.durationMs}ms
              </div>
              <table className="w-full border-collapse text-xs font-mono">
                <thead>
                  <tr>
                    {queryResult.columns.map((col: string) => (
                      <th
                        key={col}
                        className="text-left px-2 py-1.5 border-b-2 border-border text-[11px] font-bold whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryResult.rows.map((row: Record<string, unknown>, i: number) => (
                    <tr key={i}>
                      {queryResult.columns.map((col: string) => (
                        <td
                          key={col}
                          className="px-2 py-1 border-b border-border max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap"
                        >
                          {String(row[col] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
