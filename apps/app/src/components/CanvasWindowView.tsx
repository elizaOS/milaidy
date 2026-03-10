/**
 * CanvasWindowView
 *
 * A transparent placeholder <div> that a floating native BrowserWindow
 * (created via the Electrobun canvas RPC) is positioned on top of.
 *
 * From the React tree's perspective this is just a div.  The actual web
 * content lives in the BrowserWindow that is kept aligned to this div by
 * useCanvasWindow's RAF loop + ResizeObserver.
 *
 * While the window is not yet ready (e.g. still being created) a subtle
 * loading state is shown so the placeholder isn't invisible.
 */

import { useCanvasWindow } from "../hooks/useCanvasWindow";
import { useApp } from "../AppContext";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CanvasWindowViewProps {
  /** URL to load in the floating BrowserWindow. */
  url: string;
  /** When false, the window is not created and the component is effectively empty. */
  enabled: boolean;
  /** Optional window title. */
  title?: string;
  /** Tailwind / CSS classes applied to the outer placeholder div. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner() {
    const { t } = useApp();
  return (
    <svg
      className="animate-spin h-3 w-3 text-muted"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CanvasWindowView({
  url,
  enabled,
  title,
  className,
}: CanvasWindowViewProps) {
    const { t } = useApp();
  const { containerRef, isReady } = useCanvasWindow({ url, enabled, title });

  const showLoading = enabled && !isReady;

  return (
    <div
      ref={containerRef}
      className={className}
      style={
        // When ready the native window sits on top — make the div invisible
        // so it acts purely as a position/size anchor.
        isReady ? { opacity: 0, pointerEvents: "none" } : undefined
      }
    >
      {showLoading && (
        <div className="flex items-center justify-center gap-2 w-full h-full border border-dashed border-border rounded">
          <Spinner />
          <span className="text-muted text-xs">{t("canvaswindowview.Loading")}</span>
        </div>
      )}
    </div>
  );
}
