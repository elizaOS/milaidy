import { type ReactNode, useState } from "react";
import { useCloudLogin } from "./useCloudLogin";

/**
 * CloudLoginBanner — a terminal-style inline prompt that lets users optionally
 * sign in to Eliza Cloud for hosted agent management. Does NOT block the UI.
 */
export function CloudLoginBanner({
  onAuthenticated,
}: {
  onAuthenticated?: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const { error, manualLoginUrl, signIn, state } = useCloudLogin({
    onAuthenticated,
  });

  // Don't show anything if already authenticated or dismissed
  if (state === "authenticated" || state === "checking" || dismissed) {
    return null;
  }

  return (
    <div className="mx-4 sm:mx-5 md:mx-8 mt-4">
      <div className="border border-border bg-surface">
        {/* Terminal-style bar */}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {state === "polling" ? (
              // Polling state — deploy log style
              <div className="flex items-center gap-3 font-mono text-sm">
                <span className="text-brand animate-pulse">◌</span>
                <span className="text-text-muted">Authenticating</span>
                <span className="text-text-subtle">—</span>
                <span className="text-text-light">
                  complete login in browser
                </span>
                {manualLoginUrl && (
                  <a
                    href={manualLoginUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brand hover:text-brand-hover transition-colors ml-2"
                  >
                    [open]
                  </a>
                )}
              </div>
            ) : (
              // Idle state — terminal prompt style
              <div className="flex items-center gap-3 font-mono text-sm truncate">
                <span className="text-text-subtle flex-shrink-0">$</span>
                <span className="text-text-muted truncate">
                  <span className="text-text-light">milady cloud</span> —{" "}
                  <span className="hidden sm:inline">
                    deploy and manage hosted agents
                  </span>
                  <span className="sm:hidden">cloud agents</span>
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {state !== "polling" && (
              <button
                type="button"
                onClick={signIn}
                className="px-4 py-2 bg-brand text-dark font-mono text-[11px] font-semibold tracking-wide
                  hover:bg-brand-hover active:scale-[0.98] transition-all duration-150"
              >
                SIGN IN
              </button>
            )}
            <button
              type="button"
              onClick={() => setDismissed(true)}
              title="Dismiss"
              className="w-8 h-8 flex items-center justify-center text-text-subtle 
                hover:text-text-light hover:bg-surface-elevated transition-colors"
            >
              <span className="text-lg leading-none">×</span>
            </button>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="px-4 pb-3 -mt-1">
            <p className="font-mono text-xs text-red-400">
              <span className="text-red-500">ERROR:</span> {error}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * @deprecated Use CloudLoginBanner instead. This component used to block the
 * entire dashboard behind auth — we now show the dashboard immediately with
 * local agent discovery and offer cloud sign-in as an optional enhancement.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
