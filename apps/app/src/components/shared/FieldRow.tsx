import type { ReactNode } from "react";

interface FieldRowProps {
  label: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function FieldRow({ action, children, hint, label }: FieldRowProps) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-txt">
      <span className="flex items-center justify-between gap-3">
        <span className="font-semibold text-txt-strong">{label}</span>
        {action ? <span className="shrink-0">{action}</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}
