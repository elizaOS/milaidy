import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { isAuthenticated, setToken } from "../../lib/auth";
import { CloudApiClient } from "../../lib/cloud-api";

type AuthState = "checking" | "unauthenticated" | "polling" | "authenticated" | "error";

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("checking");
  const [agentUrl, setAgentUrl] = useState("http://localhost:2138");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    setState(isAuthenticated() ? "authenticated" : "unauthenticated");
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleLogin = useCallback(async () => {
    setState("polling");
    setError(null);
    try {
      const client = new CloudApiClient({ url: agentUrl, type: "local" });
      const { sessionId, browserUrl } = await client.cloudLogin();
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
          const result = await client.cloudLoginPoll(sessionId);
          if (result.status === "authenticated" && result.apiKey) {
            clearInterval(pollRef.current);
            setToken(result.apiKey);
            setState("authenticated");
          }
        } catch {
          // Keep polling on network errors
        }
      }, 2000);
    } catch (err) {
      setState("error");
      setError(`Failed to start login: ${err}`);
    }
  }, [agentUrl]);

  const handleSkip = useCallback(() => {
    setState("authenticated");
  }, []);

  if (state === "checking") {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="text-text-muted font-mono text-sm">Loading...</div>
      </div>
    );
  }

  if (state === "authenticated") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center pt-20">
      <div className="max-w-sm w-full space-y-6 p-6">
        <div className="text-center">
          <h2 className="text-xl font-medium text-text-light mb-2">Milady Cloud</h2>
          <p className="text-text-muted text-sm">
            Connect to a running Milady agent to authenticate with Eliza Cloud.
          </p>
        </div>

        <label className="block">
          <span className="text-text-muted text-xs font-mono">Agent URL</span>
          <input
            value={agentUrl}
            onChange={(e) => setAgentUrl(e.target.value)}
            placeholder="http://localhost:2138"
            className="mt-1 w-full bg-dark border border-white/10 px-3 py-2 text-sm text-text-light font-mono rounded focus:border-brand focus:outline-none"
          />
        </label>

        {state === "polling" ? (
          <div className="text-center space-y-3">
            <div className="text-brand font-mono text-sm animate-pulse">
              Waiting for authentication...
            </div>
            <p className="text-text-muted text-xs">
              Complete the login in the browser tab that opened.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handleLogin}
              className="w-full px-4 py-2 bg-brand text-dark font-mono text-xs uppercase tracking-widest rounded hover:bg-brand-hover transition-colors"
            >
              Login with Eliza Cloud
            </button>
            <button
              onClick={handleSkip}
              className="w-full px-4 py-2 border border-white/10 text-text-muted font-mono text-xs uppercase tracking-widest rounded hover:border-white/30 transition-colors"
            >
              Skip (local only)
            </button>
          </div>
        )}

        {error && (
          <div className="text-red-500 font-mono text-xs text-center">{error}</div>
        )}
      </div>
    </div>
  );
}
