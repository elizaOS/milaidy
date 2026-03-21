export function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeReleaseNotesUrl(url?: string | null): string {
  const candidate = url?.trim() || "https://milady.ai/releases/";
  try {
    return new URL(candidate).toString();
  } catch {
    return "https://milady.ai/releases/";
  }
}

export function formatTimestamp(timestamp?: number | null): string {
  if (!timestamp) {
    return "Not yet";
  }
  return new Date(timestamp).toLocaleString();
}

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "good" | "warning";
}) {
  const className =
    tone === "good"
      ? "border-ok/40 bg-ok/10 text-ok"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-border bg-bg-accent text-muted";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}
    >
      {label}
    </span>
  );
}

export function DefinitionRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-right text-xs text-txt break-all">
        {value ?? "Unavailable"}
      </div>
    </div>
  );
}

export function partitionDescription(partition: string): string {
  return partition === "persist:default"
    ? "Renderer default session"
    : "Sandboxed release notes session";
}
