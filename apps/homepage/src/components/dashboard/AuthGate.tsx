import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  clearToken,
  cloudLogin,
  cloudLoginPoll,
  isAuthenticated,
  setToken,
} from "../../lib/auth";

type AuthState =
  | "checking"
  | "unauthenticated"
  | "polling"
  | "authenticated"
  | "error";

/**
 * CloudLoginBanner — an inline, dismissible banner that lets users optionally
 * sign in to Eliza Cloud for hosted agent management. Does NOT block the UI.
 */
export function CloudLoginBanner({ onAuthenticated }: { onAuthenticated?: () => void }) {
  const [state, setState] = useState<AuthState>("checking");
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    setState(isAuthenticated() ? "authenticated" : "unauthenticated");
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleLogin = useCallback(async () => {
    setState("polling");
    setError(null);
    try {
      const { sessionId, browserUrl } = await cloudLogin();
      window.open(browserUrl, "_blank", "noopener,noreferrer");

      const deadline = Date.now() + 5 * 60 * 1000;
      pollRef.current = setInterval(async () => {
        try {
          if (Date.now() > deadline) {
            clearInterval(pollRef.current);
            setState("error");
            setError("Login timed out. Please try again.");
            return;
          }
          const result = await cloudLoginPoll(sessionId);
          if (result.status === "authenticated" && result.apiKey) {
            clearInterval(pollRef.current);
            setToken(result.apiKey);
            setState("authenticated");
            onAuthenticated?.();
          }
        } catch (err) {
          if (String(err).includes("expired")) {
            clearInterval(pollRef.current);
            setState("error");
            setError("Session expired. Please try again.");
          }
        }
      }, 2000);
    } catch (err) {
      setState("error");
      setError(`Failed to start login: ${err}`);
    }
  }, [onAuthenticated]);

  // Don't show anything if already authenticated or dismissed
  if (state === "authenticated" || state === "checking" || dismissed) {
    return null;
  }

  return (
    <div className="mx-6 md:mx-8 mt-4 px-4 py-3 bg-surface/50 border border-border rounded-xl flex items-center gap-4">
      <div className="flex-1">
        {state === "polling" ? (
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
            <span className="text-text-light text-sm">
              Waiting for authentication — complete login in the browser tab.
            </span>
          </div>
        ) : (
          <>
            <p className="text-sm text-text-muted">
              <span className="text-text-light font-medium">Want cloud agents?</span>{" "}
              Sign in to Eliza Cloud to create and manage hosted agents alongside your local ones.
            </p>
            {error && (
              <p className="text-xs text-red-400 mt-1">{error}</p>
            )}
          </>
        )}
      </div>
      {state !== "polling" && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleLogin}
            className="px-4 py-2 bg-brand text-dark font-medium text-xs rounded-lg
              hover:bg-brand-hover active:scale-[0.98] transition-all duration-150"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="px-3 py-2 text-text-muted text-xs rounded-lg
              hover:text-text-light hover:bg-surface transition-all duration-150"
          >
            Dismiss
          </button>
        </div>
      )}
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
