interface ShortcutHint {
  keys: string;
  label: string;
}

interface ShortcutHintRailProps {
  hints: ShortcutHint[];
  className?: string;
  dataTestId?: string;
}

export function ShortcutHintRail({
  className = "",
  dataTestId,
  hints,
}: ShortcutHintRailProps) {
  if (hints.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-[11px] text-muted ${className}`.trim()}
      data-testid={dataTestId}
    >
      {hints.map((hint) => (
        <span
          key={`${hint.keys}-${hint.label}`}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-accent px-2 py-1"
        >
          <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-[10px] text-txt-strong">
            {hint.keys}
          </kbd>
          <span>{hint.label}</span>
        </span>
      ))}
    </div>
  );
}
