import { clearToken, isAuthenticated } from "../../lib/auth";

const SECTIONS = [
  {
    id: "agents",
    label: "Agents",
    icon: (
      <svg
        aria-hidden="true"
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
        />
      </svg>
    ),
  },
  {
    id: "metrics",
    label: "Metrics",
    icon: (
      <svg
        aria-hidden="true"
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
        />
      </svg>
    ),
  },
  {
    id: "logs",
    label: "Logs",
    icon: (
      <svg
        aria-hidden="true"
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
    ),
  },
  {
    id: "billing",
    label: "Billing",
    icon: (
      <svg
        aria-hidden="true"
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v12m-3-9h6m4.5 9.75h-15a2.25 2.25 0 01-2.25-2.25v-9a2.25 2.25 0 012.25-2.25h15a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25z"
        />
      </svg>
    ),
  },
  {
    id: "credits",
    label: "Credits",
    icon: (
      <svg
        aria-hidden="true"
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
        />
      </svg>
    ),
  },
] as const;

export type DashboardSection = (typeof SECTIONS)[number]["id"];

interface SidebarProps {
  active: DashboardSection;
  onChange: (section: DashboardSection) => void;
}

export function Sidebar({ active, onChange }: SidebarProps) {
  const authed = isAuthenticated();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r border-border px-3 py-6 flex-shrink-0">
        <nav className="space-y-1 flex-1">
          {SECTIONS.filter(
            (s) => (s.id !== "credits" && s.id !== "billing") || authed,
          ).map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => onChange(s.id)}
              className={`w-full flex items-center gap-3 text-left px-3 py-2.5 text-sm rounded-xl transition-all duration-150
                ${
                  active === s.id
                    ? "text-text-light bg-brand/10"
                    : "text-text-muted hover:text-text-light hover:bg-surface"
                }`}
            >
              <span className={active === s.id ? "text-brand" : ""}>
                {s.icon}
              </span>
              {s.label}
            </button>
          ))}
        </nav>

        {/* Auth status at bottom */}
        {authed && (
          <div className="pt-4 border-t border-border mt-4">
            <button
              type="button"
              onClick={() => {
                clearToken();
                window.location.reload();
              }}
              className="w-full text-left px-3 py-2 text-xs text-text-muted hover:text-red-400 rounded-lg transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>

      {/* Mobile tab bar */}
      <div className="md:hidden flex overflow-x-auto border-b border-border px-2 gap-1 bg-dark">
        {SECTIONS.filter(
          (s) => (s.id !== "credits" && s.id !== "billing") || authed,
        ).map((s) => (
          <button
            type="button"
            key={s.id}
            onClick={() => onChange(s.id)}
            className={`flex-shrink-0 px-4 py-3 text-xs transition-all duration-150 relative
              ${active === s.id ? "text-text-light" : "text-text-muted"}`}
          >
            {s.label}
            {active === s.id && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand rounded-full" />
            )}
          </button>
        ))}
      </div>
    </>
  );
}
