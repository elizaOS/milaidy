const SECTIONS = [
  { id: "agents", label: "Agents", icon: "\u25C9" },
  { id: "metrics", label: "Metrics", icon: "\u25EB" },
  { id: "logs", label: "Logs", icon: "\u25FB" },
  { id: "snapshots", label: "Snapshots", icon: "\u2913" },
  { id: "credits", label: "Credits", icon: "\u25C7" },
  { id: "billing", label: "Billing", icon: "\u25C8" },
] as const;

export type DashboardSection = (typeof SECTIONS)[number]["id"];

interface SidebarProps {
  active: DashboardSection;
  onChange: (section: DashboardSection) => void;
}

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-52 border-r border-white/10 px-4 py-6 flex-shrink-0">
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-text-muted/50 px-3 mb-4">
          Dashboard
        </h3>
        <nav className="space-y-1">
          {SECTIONS.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => onChange(s.id)}
              className={`w-full text-left px-3 py-2 font-mono text-xs uppercase tracking-widest transition-colors duration-200 rounded ${
                active === s.id
                  ? "text-brand bg-brand/10"
                  : "text-text-muted hover:text-text-light hover:bg-white/5"
              }`}
            >
              <span className="mr-2">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile tab bar */}
      <div className="md:hidden flex overflow-x-auto border-b border-white/10 px-2 gap-1">
        {SECTIONS.map((s) => (
          <button
            type="button"
            key={s.id}
            onClick={() => onChange(s.id)}
            className={`flex-shrink-0 px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors ${
              active === s.id
                ? "text-brand border-b-2 border-brand"
                : "text-text-muted"
            }`}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>
    </>
  );
}
