export type CloudSourceMode = "cloud" | "own-key";

export function CloudSourceModeToggle({
  mode,
  onChange,
  cloudLabel = "Eliza Cloud",
  ownKeyLabel = "Own API Key",
}: {
  mode: CloudSourceMode;
  onChange: (mode: CloudSourceMode) => void;
  cloudLabel?: string;
  ownKeyLabel?: string;
}) {
  return (
    <div className="flex border border-[var(--border)]">
      <button
        type="button"
        className={`px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
          mode === "cloud"
            ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
            : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
        }`}
        onClick={() => onChange("cloud")}
      >
        {cloudLabel}
      </button>
      <button
        type="button"
        className={`px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors border-l border-[var(--border)] ${
          mode === "own-key"
            ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
            : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
        }`}
        onClick={() => onChange("own-key")}
      >
        {ownKeyLabel}
      </button>
    </div>
  );
}

export function CloudConnectionStatus({
  connected,
  connectedText = "Connected to Eliza Cloud",
  disconnectedText,
}: {
  connected: boolean;
  connectedText?: string;
  disconnectedText: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 border border-[var(--border)] bg-[var(--bg-muted)]">
      {connected ? (
        <>
          <span className="text-xs text-[var(--text)]">{connectedText}</span>
          <span className="text-[10px] px-1.5 py-0.5 border border-green-600 text-green-600">
            Active
          </span>
        </>
      ) : (
        <>
          <span className="text-xs text-[var(--muted)]">
            {disconnectedText}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 border border-yellow-600 text-yellow-600">
            Offline
          </span>
        </>
      )}
    </div>
  );
}
