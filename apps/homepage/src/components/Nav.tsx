import { Link, useLocation } from "react-router-dom";
import { releaseData } from "../generated/release-data";

export function Nav() {
  const location = useLocation();
  const isOnDashboard = location.pathname === "/dashboard";

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex flex-col bg-dark/95 backdrop-blur-md border-b border-sharp">
      <div className="flex items-center justify-between px-6 py-4 md:px-12">
        <a
          href="#top"
          className="group text-4xl font-black text-[#1a1a1a] hover:text-white tracking-tighter uppercase flex items-center gap-2 mt-1 transition-colors duration-300"
        >
          <img
            src="/logo.png"
            alt="Milady"
            className="w-8 h-8 rounded-full brightness-[0.3] group-hover:brightness-100 transition-all duration-300"
          />
          MILADY
        </a>
        <div className="hidden md:flex items-center gap-8 font-mono text-xs uppercase tracking-widest">
          <a
            href="#install"
            className="text-text-muted hover:text-brand transition-colors duration-300"
          >
            Install
          </a>
          <Link
            to="/dashboard"
            className={`transition-colors duration-300 ${isOnDashboard ? "text-brand" : "text-text-muted hover:text-brand"}`}
          >
            Cloud
          </Link>
          <a
            href="#privacy"
            className="text-text-muted hover:text-brand transition-colors duration-300"
          >
            Privacy
          </a>
          <a
            href="#features"
            className="text-text-muted hover:text-brand transition-colors duration-300"
          >
            Features
          </a>
          <a
            href="#comparison"
            className="text-text-muted hover:text-brand transition-colors duration-300"
          >
            Why Local
          </a>
          <a
            href={releaseData.release.url}
            target="_blank"
            rel="noreferrer"
            className="border-sharp px-4 py-2 hover:bg-brand hover:text-dark hover:border-brand transition-all duration-300"
          >
            Releases
          </a>
        </div>
      </div>
      <div className="hidden md:flex justify-end px-3 pb-2">
        <span className="version-clock">
          <span className="version-clock-dot" />
          {releaseData.release.prerelease ? "canary" : "stable"}{" "}
          {releaseData.release.tagName}
        </span>
      </div>
    </nav>
  );
}
