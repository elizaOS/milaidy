import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { releaseData } from "../generated/release-data";

const NAV_ITEMS = [
  { label: "Download", anchor: "install" },
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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-dark/90 backdrop-blur-xl border-b border-border">
      <div className="flex items-center justify-between px-4 sm:px-5 md:px-8 h-[56px]">
        <button
          type="button"
          onClick={scrollTo("top")}
          className="group flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <img src="/logo.png" alt="Milady" className="w-7 h-7 rounded-lg" />
          <span className="text-base sm:text-lg font-semibold tracking-tight text-text-light">
            Milady
          </span>
        </button>

        <div className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.anchor} onClick={scrollTo(item.anchor)}>
              {item.label}
            </NavLink>
          ))}

          <Link
            to="/dashboard"
            className={`px-3 py-1.5 text-sm rounded-lg transition-all duration-150
              ${
                isOnDashboard
                  ? "text-brand bg-brand/10"
                  : "text-text-muted hover:text-text-light hover:bg-surface"
              }`}
          >
            Dashboard
          </Link>

          <span className="w-px h-5 bg-border mx-2" />

          <a
            href={releaseData.release.url}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 text-sm font-medium text-brand border border-brand/40 rounded-lg
              hover:bg-brand hover:text-dark hover:border-brand transition-all duration-150"
          >
            Releases
          </a>
          <span className="version-clock ml-2">
            <span className="version-clock-dot" />
            {releaseData.release.prerelease ? "canary" : "stable"}{" "}
            {releaseData.release.tagName}
          </span>
        </div>

        <div className="flex md:hidden items-center gap-2">
          <Link
            to="/dashboard"
            className={`px-3 py-2 text-xs rounded-lg transition-all duration-150 ${
              isOnDashboard
                ? "text-brand bg-brand/10"
                : "text-text-muted hover:text-text-light hover:bg-surface"
            }`}
            onClick={() => setMobileOpen(false)}
          >
            Dashboard
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation menu"
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-border text-text-light hover:bg-surface transition-colors"
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

      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-dark/95 px-4 py-4 space-y-2 shadow-2xl">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.anchor}
              onClick={(e) => scrollTo(item.anchor)(e)}
              className="w-full text-left px-3 py-3 rounded-xl text-sm text-text-light bg-surface/60 hover:bg-surface transition-colors"
            >
              {item.label}
            </button>
          ))}

          <a
            href={releaseData.release.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-3 py-3 rounded-xl text-sm text-brand border border-brand/30 bg-brand/5"
            onClick={() => setMobileOpen(false)}
          >
            <span>Latest release</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
              {releaseData.release.tagName}
            </span>
          </a>
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
      className="px-3 py-1.5 text-sm text-text-muted hover:text-text-light rounded-lg
        hover:bg-surface transition-all duration-150"
    >
      {children}
    </button>
  );
}
