import type React from "react";
import type { Tab } from "../../navigation";
import type { TranslatorFn } from "./walletUtils";

export function CompanionHubNav({
  setTab,
  t,
}: {
  setTab: (tab: Tab) => void;
  t: TranslatorFn;
}) {
  return (
    <nav className="anime-hub-menu">
      {/* Talents */}
      <button
        type="button"
        className="anime-hub-btn"
        onClick={() => setTab("skills")}
        style={
          {
            "--ac-accent": "#00e1ff",
            "--ac-accent-rgb": "0, 225, 255",
          } as React.CSSProperties
        }
      >
        <div className="anime-hub-btn-icon">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        <span className="anime-hub-btn-label">{t("nav.talents")}</span>
      </button>

      {/* Knowledge */}
      <button
        type="button"
        className="anime-hub-btn"
        onClick={() => setTab("knowledge")}
        style={
          {
            "--ac-accent": "#a78bfa",
            "--ac-accent-rgb": "167, 139, 250",
          } as React.CSSProperties
        }
      >
        <div className="anime-hub-btn-icon">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
          </svg>
        </div>
        <span className="anime-hub-btn-label">{t("nav.knowledge")}</span>
      </button>

      {/* Channels */}
      <button
        type="button"
        className="anime-hub-btn"
        onClick={() => setTab("connectors")}
        style={
          {
            "--ac-accent": "#f43f5e",
            "--ac-accent-rgb": "244, 63, 94",
          } as React.CSSProperties
        }
      >
        <div className="anime-hub-btn-icon">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>
        <span className="anime-hub-btn-label">{t("nav.channels")}</span>
      </button>

      {/* Plugins */}
      <button
        type="button"
        className="anime-hub-btn"
        onClick={() => setTab("plugins")}
        style={
          {
            "--ac-accent": "#f0b232",
            "--ac-accent-rgb": "240, 178, 50",
          } as React.CSSProperties
        }
      >
        <div className="anime-hub-btn-icon">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <circle cx="12" cy="11" r="3" />
            <path d="M12 8v1M12 13v1M9.5 9.5l.7.7M13.8 13.8l.7.7M9 11H8M16 11h-1M9.5 12.5l.7-.7M13.8 8.2l.7-.7" />
          </svg>
        </div>
        <span className="anime-hub-btn-label">{t("nav.plugins")}</span>
      </button>

      {/* Apps */}
      <button
        type="button"
        className="anime-hub-btn"
        onClick={() => setTab("apps")}
        style={
          {
            "--ac-accent": "#10b981",
            "--ac-accent-rgb": "16, 185, 129",
          } as React.CSSProperties
        }
      >
        <div className="anime-hub-btn-icon">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
        <span className="anime-hub-btn-label">{t("nav.apps")}</span>
      </button>

      {/* Wallets */}
      <button
        type="button"
        className="anime-hub-btn"
        onClick={() => setTab("wallets")}
        style={
          {
            "--ac-accent": "#f0b90b",
            "--ac-accent-rgb": "240, 185, 11",
          } as React.CSSProperties
        }
      >
        <div className="anime-hub-btn-icon">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
          </svg>
        </div>
        <span className="anime-hub-btn-label">
          {t("nav.wallets") || "Wallets"}
        </span>
      </button>

      {/* Stream */}
      <button
        type="button"
        className="anime-hub-btn"
        onClick={() => setTab("stream")}
        style={
          {
            "--ac-accent": "#ef4444",
            "--ac-accent-rgb": "239, 68, 68",
          } as React.CSSProperties
        }
      >
        <div className="anime-hub-btn-icon">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <span className="anime-hub-btn-label">
          {t("nav.stream") || "Stream"}
        </span>
      </button>

      {/* LIFO Sandbox */}
      <button
        type="button"
        className="anime-hub-btn"
        onClick={() => setTab("lifo")}
        style={
          {
            "--ac-accent": "#8b5cf6",
            "--ac-accent-rgb": "139, 92, 246",
          } as React.CSSProperties
        }
      >
        <div className="anime-hub-btn-icon">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </div>
        <span className="anime-hub-btn-label">{t("nav.lifo") || "LIFO"}</span>
      </button>

      {/* Settings */}
      <button
        type="button"
        className="anime-hub-btn"
        onClick={() => setTab("settings")}
        style={
          {
            "--ac-accent": "#e2e8f0",
            "--ac-accent-rgb": "226, 232, 240",
          } as React.CSSProperties
        }
      >
        <div className="anime-hub-btn-icon">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <span className="anime-hub-btn-label">{t("nav.settings")}</span>
      </button>

      {/* Advanced */}
      <button
        type="button"
        className="anime-hub-btn"
        onClick={() => setTab("advanced")}
        style={
          {
            "--ac-accent": "#38bdf8",
            "--ac-accent-rgb": "56, 189, 248",
          } as React.CSSProperties
        }
      >
        <div className="anime-hub-btn-icon">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </div>
        <span className="anime-hub-btn-label">{t("nav.advanced")}</span>
      </button>
    </nav>
  );
}
