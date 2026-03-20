import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { releaseData } from "../generated/release-data";

const NAV_ITEMS = [
  { label: "Install", anchor: "install" },
  { label: "Privacy", anchor: "privacy" },
  { label: "Features", anchor: "features" },
  { label: "Compare", anchor: "comparison" },
] as const;

export function Nav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isOnDashboard = location.pathname === "/dashboard";

  const scrollTo = useMemo(
    () => (anchor: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      setMobileOpen(false);

      if (isOnDashboard) {
        navigate("/");
        window.setTimeout(() => {
          document
            .getElementById(anchor)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
        return;
      }

      document
        .getElementById(anchor)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [isOnDashboard, navigate],
  );

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-dark/95 backdrop-blur-md border-b border-border">
      <div className="flex items-center justify-between px-4 sm:px-5 md:px-8 h-[56px]">
        {/* Brand mark — square logo container */}
        <button
          type="button"
          onClick={scrollTo("top")}
          className="group flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <div className="w-10 h-10 rounded-sm overflow-hidden bg-surface flex items-center justify-center">
            <img src="/logo.png" alt="Milady" className="w-full h-full object-cover" />
          </div>
          <span className="text-lg sm:text-xl font-black tracking-tighter uppercase text-white">
            MILADY
          </span>
        </button>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.anchor} onClick={scrollTo(item.anchor)}>
              {item.label.toUpperCase()}
            </NavLink>
          ))}

          <span className="w-px h-4 bg-border mx-3" />

          <Link
            to="/dashboard"
            className={`px-4 py-2 font-mono text-[11px] tracking-wide transition-all duration-150
              ${
                isOnDashboard
                  ? "text-brand bg-brand/10 border border-brand/30"
                  : "text-text-muted border border-transparent hover:text-text-light hover:border-border"
              }`}
          >
            DASHBOARD
          </Link>

          <a
            href={releaseData.release.url}
            target="_blank"
            rel="noreferrer"
            className="ml-2 px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase text-brand border border-brand/40 rounded-sm
              hover:bg-brand hover:text-dark hover:border-brand transition-all duration-150"
          >
            RELEASES
          </a>

          {/* Version indicator */}
          <div className="ml-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand status-pulse" />
            <span className="font-mono text-[10px] text-text-subtle tracking-wider">
              {releaseData.release.tagName}
            </span>
          </div>
        </div>

        {/* Mobile nav toggle */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            to="/dashboard"
            className={`px-3 py-2 font-mono text-[10px] tracking-wide transition-all duration-150 ${
              isOnDashboard
                ? "text-brand"
                : "text-text-muted hover:text-text-light"
            }`}
            onClick={() => setMobileOpen(false)}
          >
            DASH
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation menu"
            className="inline-flex items-center justify-center w-10 h-10 border border-border text-text-light 
              hover:bg-surface transition-colors"
          >
            <svg
              aria-hidden="true"
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              {mobileOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 7h16M4 12h16M4 17h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-dark-secondary px-4 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.anchor}
              onClick={(e) => scrollTo(item.anchor)(e)}
              className="w-full text-left px-4 py-3 font-mono text-xs tracking-wide text-text-muted 
                hover:text-text-light hover:bg-surface transition-colors"
            >
              {item.label.toUpperCase()}
            </button>
          ))}

          <div className="pt-3 border-t border-border-subtle">
            <a
              href={releaseData.release.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between px-4 py-3 font-mono text-xs tracking-wide 
                text-brand bg-brand/5 border border-brand/20"
              onClick={() => setMobileOpen(false)}
            >
              <span>DOWNLOAD</span>
              <span className="text-[10px] text-text-subtle">
                {releaseData.release.tagName}
              </span>
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}

function NavLink({
  onClick,
  children,
}: {
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 font-mono text-[11px] tracking-wide text-text-muted 
        hover:text-text-light transition-colors duration-150"
    >
      {children}
    </button>
  );
}
