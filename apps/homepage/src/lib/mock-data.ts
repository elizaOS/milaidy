import type { MetricsData, LogEntry } from "./cloud-api";

const AGENT_NAMES = ["Milady-1", "Milady-2", "Chen", "Kei", "Momo"];
const LOG_MESSAGES = [
  "Agent initialized successfully",
  "Processing message from user",
  "Model inference completed in 342ms",
  "Memory consolidated: 128 entries",
  "Plugin loaded: plugin-knowledge",
  "Health check passed",
  "PGLite database synced",
  "Connection established to gateway",
  "Warning: memory usage above 80%",
  "Error: failed to reach external API",
  "Retrying connection in 5s",
  "Agent paused by operator",
];

export function generateMockMetrics(count: number): MetricsData[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    cpu: Math.round(Math.random() * 80 + 5),
    memoryMb: Math.round(Math.random() * 1024 + 256),
    diskMb: Math.round(Math.random() * 2048 + 512),
    timestamp: new Date(now - (count - i) * 60_000).toISOString(),
  }));
}

export function generateMockLogs(count: number): LogEntry[] {
  const now = Date.now();
  const levels: LogEntry["level"][] = ["info", "info", "info", "info", "warn", "error"];
  return Array.from({ length: count }, (_, i) => ({
    level: levels[Math.floor(Math.random() * levels.length)],
    message: LOG_MESSAGES[Math.floor(Math.random() * LOG_MESSAGES.length)],
    timestamp: new Date(now - (count - i) * 5_000).toISOString(),
    agentName: AGENT_NAMES[Math.floor(Math.random() * AGENT_NAMES.length)],
  }));
}
