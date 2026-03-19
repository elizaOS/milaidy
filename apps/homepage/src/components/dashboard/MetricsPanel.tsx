import { useEffect, useState } from "react";
import type { MetricsData } from "../../lib/cloud-api";
import { generateMockMetrics } from "../../lib/mock-data";

export function MetricsPanel() {
  const [metrics, setMetrics] = useState<MetricsData[]>([]);

  useEffect(() => {
    setMetrics(generateMockMetrics(12));
    const interval = setInterval(() => {
      setMetrics((prev) => [...prev.slice(1), ...generateMockMetrics(1)]);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const latest = metrics[metrics.length - 1];
  if (!latest) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricBar label="CPU" value={latest.cpu} max={100} unit="%" />
        <MetricBar
          label="Memory"
          value={latest.memoryMb}
          max={2048}
          unit=" MB"
        />
        <MetricBar label="Disk" value={latest.diskMb} max={4096} unit=" MB" />
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
        Simulated data — metrics API not yet available
      </p>
    </div>
  );
}

function MetricBar({
  label,
  value,
  max,
  unit,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const color =
    pct > 80 ? "bg-red-400" : pct > 60 ? "bg-amber-400" : "bg-brand";

  return (
    <div className="bg-dark rounded-xl p-4 border border-border/50">
      <div className="flex justify-between text-sm mb-3">
        <span className="text-text-muted">{label}</span>
        <span className="text-text-light font-medium tabular-nums">
          {Math.round(value)}
          {unit}
        </span>
      </div>
      <div className="h-1.5 bg-border/50 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
