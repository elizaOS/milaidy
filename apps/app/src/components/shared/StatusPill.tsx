import type { LucideIcon } from "lucide-react";

type StatusTone = "ok" | "warn" | "danger" | "muted" | "accent";

interface StatusPillProps {
  icon?: LucideIcon;
  label: string;
  pulse?: boolean;
  tone?: StatusTone;
}

const TONE_CLASS: Record<StatusTone, string> = {
  ok: "chip-status border-ok text-ok bg-ok/10",
  warn: "chip-status border-warn text-warn bg-warn/10",
  danger: "chip-status border-danger text-danger bg-danger/10",
  muted: "chip-status border-muted text-muted bg-muted/10",
  accent: "chip-status border-accent text-accent bg-accent-subtle",
};

export function StatusPill({
  icon: Icon,
  label,
  pulse = false,
  tone = "muted",
}: StatusPillProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${TONE_CLASS[tone]}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full bg-current ${pulse ? "animate-pulse" : ""}`}
        aria-hidden
      />
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
      <span>{label}</span>
    </span>
  );
}
