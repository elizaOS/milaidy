const SPARKLINE_BARS = [
  { id: "bar-1", height: 22 },
  { id: "bar-2", height: 28 },
  { id: "bar-3", height: 24 },
  { id: "bar-4", height: 31 },
  { id: "bar-5", height: 26 },
  { id: "bar-6", height: 34 },
  { id: "bar-7", height: 29 },
  { id: "bar-8", height: 37 },
  { id: "bar-9", height: 25 },
  { id: "bar-10", height: 33 },
  { id: "bar-11", height: 27 },
  { id: "bar-12", height: 35 },
  { id: "bar-13", height: 23 },
  { id: "bar-14", height: 30 },
  { id: "bar-15", height: 26 },
  { id: "bar-16", height: 36 },
  { id: "bar-17", height: 24 },
  { id: "bar-18", height: 32 },
  { id: "bar-19", height: 28 },
  { id: "bar-20", height: 34 },
  { id: "bar-21", height: 25 },
  { id: "bar-22", height: 31 },
  { id: "bar-23", height: 27 },
  { id: "bar-24", height: 33 },
] as const;

export function MetricsPanel() {
  return (
    <div className="animate-fade-up">
      {/* Terminal-style header */}
      <div className="border border-border bg-surface">
        <div className="px-4 py-2.5 bg-dark-secondary border-b border-border">
          <span className="font-mono text-xs text-text-muted">
            $ metrics --watch
          </span>
        </div>

        <div className="p-8 text-center">
          {/* Decorative metric preview */}
          <div className="max-w-md mx-auto mb-8">
            <div className="grid grid-cols-3 gap-px bg-border mb-6">
              {[
                { label: "CPU", value: "—%", sub: "idle" },
                { label: "MEM", value: "—MB", sub: "allocated" },
                { label: "REQ/S", value: "—", sub: "throughput" },
              ].map((metric) => (
                <div key={metric.label} className="bg-surface p-4 text-left">
                  <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1">
                    {metric.label}
                  </p>
                  <p className="font-mono text-xl text-text-muted/30 tabular-nums">
                    {metric.value}
                  </p>
                  <p className="font-mono text-[10px] text-text-subtle mt-0.5">
                    {metric.sub}
                  </p>
                </div>
              ))}
            </div>

            {/* Sparkline placeholder */}
            <div className="h-16 border border-border-subtle bg-dark-secondary/50 flex items-end justify-center gap-1 px-4 pb-3">
              {SPARKLINE_BARS.map((bar) => (
                <div
                  key={bar.id}
                  className="w-1.5 bg-text-muted/10 rounded-sm"
                  style={{ height: `${bar.height}%` }}
                />
              ))}
            </div>
          </div>

          <h3 className="font-mono text-sm text-text-light mb-2">
            NO ACTIVE METRICS
          </h3>
          <p className="font-mono text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
            Connect to a running agent to stream real-time performance data.
            <br />
            CPU, memory, request throughput, and latency will appear here.
          </p>

          <div className="mt-6 flex items-center justify-center gap-4">
            <div className="flex items-center gap-2 text-[10px] font-mono text-text-subtle">
              <span className="w-2 h-2 rounded-full bg-emerald-500/30" />
              WAITING FOR DATA
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
