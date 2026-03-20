import { useEffect, useState } from "react";
import { CloudClient, type CreditBalance } from "../../lib/cloud-api";
import { useAuth } from "../../lib/useAuth";

const SECTIONS = [
  { id: "agents", label: "Agents", shortcut: "1" },
  { id: "metrics", label: "Metrics", shortcut: "2" },
  { id: "logs", label: "Logs", shortcut: "3" },
  { id: "credits", label: "Credits", shortcut: "4", requiresAuth: true },
] as const;

export type DashboardSection = (typeof SECTIONS)[number]["id"] | "billing";

interface SidebarProps {
  active: DashboardSection;
  onChange: (section: DashboardSection) => void;
}

export function Sidebar({ active, onChange }: SidebarProps) {
  const { isAuthenticated: authed, token, signOut } = useAuth();
  const visibleSections = SECTIONS.filter((s) => !s.requiresAuth || authed);
  const [credits, setCredits] = useState<CreditBalance | null>(null);

  useEffect(() => {
    if (!authed || !token) {
      setCredits(null);
      return;
    }
    const cc = new CloudClient(token);
    cc.getCreditsBalance()
      .then(setCredits)
      .catch(() => setCredits(null));
  }, [authed, token]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-52 border-r border-border flex-shrink-0 bg-dark-secondary">
        {/* Brand header */}
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand/10 border border-brand/20 flex items-center justify-center">
              <span className="font-mono text-brand text-sm font-bold">M</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs font-medium text-text-light tracking-wide">
                MILADY
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    authed ? "bg-emerald-400 status-pulse" : "bg-text-muted/40"
                  }`}
                />
                <span className="font-mono text-[10px] text-text-subtle tracking-wide">
                  {authed ? "CLOUD CONNECTED" : "LOCAL MODE"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2">
          <p className="px-2 mb-3 font-mono text-[9px] font-medium text-text-subtle tracking-[0.15em]">
            WORKSPACE
          </p>
          <div className="space-y-0.5">
            {visibleSections.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => onChange(s.id)}
                className={`group w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 
                  font-mono text-xs tracking-wide transition-all duration-150 relative
                  ${
                    active === s.id
                      ? "text-text-light bg-surface"
                      : "text-text-muted hover:text-text-light hover:bg-surface/50"
                  }`}
              >
                {/* Active indicator */}
                {active === s.id && (
                  <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-brand" />
                )}
                <span>{s.label.toUpperCase()}</span>
                <span
                  className={`text-[10px] ${active === s.id ? "text-brand" : "text-text-subtle"}`}
                >
                  {s.shortcut}
                </span>
              </button>
            ))}
          </div>
        </nav>

        {/* Footer: Credits + Sign out */}
        <div className="border-t border-border">
          {/* Credit balance */}
          {authed && (
            <button
              type="button"
              onClick={() => onChange("credits")}
              className="w-full flex items-center gap-3 px-4 py-3 
                hover:bg-surface/50 transition-all duration-150"
            >
              <div className="flex-1 text-left">
                <p className="font-mono text-[9px] tracking-[0.15em] text-text-subtle mb-0.5">
                  BALANCE
                </p>
                <p className="font-mono text-lg font-semibold text-brand tabular-nums">
                  {credits?.balance?.toLocaleString() ?? "—"}
                </p>
              </div>
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5 text-text-subtle"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          )}

          {/* Sign out */}
          {authed && (
            <button
              type="button"
              onClick={() => signOut()}
              className="w-full flex items-center gap-2 px-4 py-3 
                font-mono text-[11px] text-text-subtle hover:text-red-400 
                border-t border-border-subtle transition-colors"
            >
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              SIGN OUT
            </button>
          )}
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden sticky top-[56px] z-30 border-b border-border bg-dark/95 backdrop-blur">
        <div className="flex items-center overflow-x-auto px-2 py-1.5">
          {visibleSections.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => onChange(s.id)}
              className={`flex-shrink-0 px-3 py-2 font-mono text-[11px] tracking-wide transition-all duration-150
                ${
                  active === s.id
                    ? "text-brand"
                    : "text-text-muted hover:text-text-light"
                }`}
            >
              {s.label.toUpperCase()}
            </button>
          ))}
          {authed && credits && (
            <span className="flex-shrink-0 ml-auto px-2.5 py-1.5 font-mono text-xs text-brand tabular-nums">
              {credits.balance?.toLocaleString()}
            </span>
          )}
          {authed && (
            <button
              type="button"
              onClick={() => signOut()}
              className="flex-shrink-0 px-3 py-2 font-mono text-[11px] text-text-subtle hover:text-red-400 transition-colors"
            >
              EXIT
            </button>
          )}
        </div>
      </div>
    </>
  );
}
