/**
 * Small status indicator dot with label text.
 */

export function StatusDot({
  ready,
  label,
  title,
}: {
  ready: boolean;
  label: string;
  title?: string;
}) {
  return (
    <span
      className={`wt__status-dot ${ready ? "is-ready" : "is-off"}`}
      title={title}
    >
      <span className="wt__status-indicator" />
      {label}
    </span>
  );
}
