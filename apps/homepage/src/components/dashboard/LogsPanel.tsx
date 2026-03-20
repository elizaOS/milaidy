export function LogsPanel() {
  return (
    <div className="animate-fade-up">
      {/* Terminal-style container */}
      <div className="border border-border bg-surface">
        <div className="px-4 py-2.5 bg-dark-secondary border-b border-border flex items-center justify-between">
          <span className="font-mono text-xs text-text-muted">
            $ tail -f agent.log
          </span>
          <div className="flex items-center gap-2 text-[10px] font-mono text-text-subtle">
            <span className="w-1.5 h-1.5 rounded-full bg-text-muted/30" />
            DISCONNECTED
          </div>
        </div>
        
        <div className="p-6 min-h-[320px]">
          {/* Fake log lines - decorative preview */}
          <div className="space-y-2 mb-8 opacity-30">
            {[
              { time: "00:00:00", level: "INFO", msg: "Agent initialized" },
              { time: "00:00:01", level: "INFO", msg: "Loading character..." },
              { time: "00:00:02", level: "INFO", msg: "Connecting to providers" },
              { time: "00:00:03", level: "DEBUG", msg: "Memory store ready" },
              { time: "00:00:04", level: "INFO", msg: "Ready to receive messages" },
            ].map((line, i) => (
              <div key={i} className="flex items-start gap-3 font-mono text-[11px]">
                <span className="text-text-subtle tabular-nums">{line.time}</span>
                <span className={
                  line.level === "DEBUG" 
                    ? "text-text-subtle" 
                    : line.level === "WARN" 
                      ? "text-amber-400" 
                      : line.level === "ERROR" 
                        ? "text-red-400" 
                        : "text-emerald-400/70"
                }>
                  [{line.level}]
                </span>
                <span className="text-text-muted">{line.msg}</span>
              </div>
            ))}
            <div className="flex items-start gap-3 font-mono text-[11px]">
              <span className="text-text-subtle tabular-nums">00:00:05</span>
              <span className="text-text-subtle">[...]</span>
              <span className="text-text-muted/50">waiting for connection</span>
              <span className="inline-block w-2 h-3.5 bg-text-muted/20 ml-1" />
            </div>
          </div>

          {/* Info message */}
          <div className="text-center py-6">
            <h3 className="font-mono text-sm text-text-light mb-2">
              NO LOG STREAM
            </h3>
            <p className="font-mono text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
              Select an agent from the Agents panel to stream live logs.
              <br />
              Log levels, timestamps, and structured output will appear here.
            </p>
          </div>
        </div>

        {/* Bottom status bar */}
        <div className="px-4 py-2 bg-dark-secondary border-t border-border flex items-center justify-between">
          <span className="font-mono text-[10px] text-text-subtle">
            0 lines
          </span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-text-subtle">
              FILTER: ALL
            </span>
            <span className="font-mono text-[10px] text-text-subtle">
              LEVEL: DEBUG+
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
