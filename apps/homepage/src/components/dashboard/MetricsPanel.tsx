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
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <MetricBar label="CPU" value={latest.cpu} max={100} unit="%" />
        <MetricBar
          label="Memory"
          value={latest.memoryMb}
          max={2048}
          unit="MB"
        />
        <MetricBar label="Disk" value={latest.diskMb} max={4096} unit="MB" />
      </div>
      <p className="text-[10px] font-mono text-text-muted">
        Mock data — metrics API not yet available
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
    pct > 80 ? "bg-red-500" : pct > 60 ? "bg-yellow-500" : "bg-brand";
  return (
    <div>
      <div className="flex justify-between text-[10px] font-mono text-text-muted mb-1">
        <span>{label}</span>
        <span>
          {value}
          {unit}
        </span>
      </div>
      <div className="h-2 bg-white/5 rounded overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
