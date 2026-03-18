import { useEffect, useState } from "react";
import type { LogEntry } from "../../lib/cloud-api";
import { generateMockLogs } from "../../lib/mock-data";

const LEVEL_COLORS = {
  info: "text-text-muted",
  warn: "text-yellow-500",
  error: "text-red-500",
} as const;

export function LogsPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    setLogs(generateMockLogs(30));
    const interval = setInterval(() => {
      setLogs((prev) => [...prev, ...generateMockLogs(1)].slice(-100));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="bg-dark border border-white/10 rounded p-3 h-64 overflow-y-auto custom-scrollbar font-mono text-[11px] space-y-0.5">
        {logs.map((log) => (
          <div
            key={`${log.timestamp}-${log.agentName}-${log.message}`}
            className="flex gap-3"
          >
            <span className="text-text-muted/50 flex-shrink-0">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span
              className={`uppercase w-10 flex-shrink-0 ${LEVEL_COLORS[log.level]}`}
            >
              {log.level}
            </span>
            <span className="text-text-muted/30 flex-shrink-0">
              {log.agentName}
            </span>
            <span className="text-text-light">{log.message}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] font-mono text-text-muted mt-2">
        Mock data — logs API not yet available
      </p>
    </div>
  );
}
