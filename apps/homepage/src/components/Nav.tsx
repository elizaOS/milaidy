import { Link, useLocation, useNavigate } from "react-router-dom";
import { releaseData } from "../generated/release-data";

export function Nav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isOnDashboard = location.pathname === "/dashboard";

  /** Navigate to homepage and scroll to a section anchor. */
  function scrollTo(anchor: string) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      if (isOnDashboard) {
        navigate("/");
        // Wait for route to render, then scroll
        setTimeout(() => {
          document
            .getElementById(anchor)
            ?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } else {
        document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
      }
    };
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex flex-col bg-dark/95 backdrop-blur-md border-b border-sharp">
      <div className="flex items-center justify-between px-6 py-4 md:px-12">
        <button
          type="button"
          onClick={scrollTo("top")}
          className="group text-4xl font-black text-[#1a1a1a] hover:text-white tracking-tighter uppercase flex items-center gap-2 mt-1 transition-colors duration-300"
        >
          <img
            src="/logo.png"
            alt="Milady"
            className="w-8 h-8 rounded-full brightness-[0.3] group-hover:brightness-100 transition-all duration-300"
          />
          MILADY
        </button>
        <div className="hidden md:flex items-center gap-8 font-mono text-xs uppercase tracking-widest">
          <button
            type="button"
            onClick={scrollTo("install")}
            className="text-text-muted hover:text-brand transition-colors duration-300"
          >
            Install
          </button>
          <Link
            to="/dashboard"
            className={`transition-colors duration-300 ${isOnDashboard ? "text-brand" : "text-text-muted hover:text-brand"}`}
          >
            Cloud
          </Link>
          <button
            type="button"
            onClick={scrollTo("privacy")}
            className="text-text-muted hover:text-brand transition-colors duration-300"
          >
            Privacy
          </button>
          <button
            type="button"
            onClick={scrollTo("features")}
            className="text-text-muted hover:text-brand transition-colors duration-300"
          >
            Features
          </button>
          <button
            type="button"
            onClick={scrollTo("comparison")}
            className="text-text-muted hover:text-brand transition-colors duration-300"
          >
            Why Local
          </button>
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
