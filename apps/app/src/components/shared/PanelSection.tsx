import type { ReactNode } from "react";

interface PanelSectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PanelSection({
  action,
  children,
  className = "",
  description,
  title,
}: PanelSectionProps) {
  return (
    <section
      className={`border border-border bg-card p-3 sm:p-4 ${className}`.trim()}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-txt-strong">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs text-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
