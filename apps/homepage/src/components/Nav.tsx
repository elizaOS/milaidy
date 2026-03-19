import { Link, useLocation, useNavigate } from "react-router-dom";
import { releaseData } from "../generated/release-data";

export function Nav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isOnDashboard = location.pathname === "/dashboard";

  function scrollTo(anchor: string) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      if (isOnDashboard) {
        navigate("/");
        requestAnimationFrame(() => {
          document
            .getElementById(anchor)
            ?.scrollIntoView({ behavior: "smooth" });
        });
      } else {
        document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
      }
    };
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-dark/90 backdrop-blur-xl border-b border-border">
      <div className="flex items-center justify-between px-5 md:px-8 h-[56px]">
        <button
          type="button"
          onClick={scrollTo("top")}
          className="group flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <img src="/logo.png" alt="Milady" className="w-7 h-7 rounded-lg" />
          <span className="text-lg font-semibold tracking-tight text-text-light">
            Milady
          </span>
        </button>

        <div className="hidden md:flex items-center gap-1">
          <NavLink onClick={scrollTo("install")}>Get the app</NavLink>
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
          <NavLink onClick={scrollTo("privacy")}>Privacy</NavLink>
          <NavLink onClick={scrollTo("features")}>Features</NavLink>
          <NavLink onClick={scrollTo("comparison")}>Why Local</NavLink>

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
      </div>
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
