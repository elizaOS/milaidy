import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "../../lib/cloud-api";
import { generateMockLogs } from "../../lib/mock-data";

const LEVEL_STYLES = {
  info: "text-text-muted",
  warn: "text-amber-400",
  error: "text-red-400",
} as const;

export function LogsPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs(generateMockLogs(30));
    const interval = setInterval(() => {
      setLogs((prev) => [...prev, ...generateMockLogs(1)].slice(-100));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  return (
    <div className="space-y-3">
      <div
        ref={scrollRef}
        className="bg-dark border border-border/50 rounded-xl p-4 h-72 overflow-y-auto custom-scrollbar font-mono text-[12px] space-y-px"
      >
        {logs.map((log, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: logs lack unique IDs
            key={`${log.timestamp}-${i}`}
            className="flex gap-3 py-0.5 hover:bg-surface/50 px-1 -mx-1 rounded"
          >
            <span className="text-text-muted/40 flex-shrink-0 tabular-nums">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span
              className={`w-12 flex-shrink-0 uppercase ${LEVEL_STYLES[log.level]}`}
            >
              {log.level}
            </span>
            <span className="text-text-light/80">{log.message}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-muted/50 flex items-center gap-1.5">
        <svg
          aria-hidden="true"
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Simulated data — logs API not yet available
      </p>
    </div>
  );
}
