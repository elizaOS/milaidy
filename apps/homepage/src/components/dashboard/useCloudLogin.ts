import { useCallback, useEffect, useRef, useState } from "react";
import {
  CLOUD_AUTH_CHANGED_EVENT,
  cloudLogin,
  cloudLoginPoll,
  isAuthenticated,
  setToken,
} from "../../lib/auth";
import { CLOUD_BASE } from "../../lib/runtime-config";

export type CloudLoginState =
  | "checking"
  | "unauthenticated"
  | "polling"
  | "authenticated"
  | "error";

interface UseCloudLoginOptions {
  onAuthenticated?: () => void;
}

export function useCloudLogin(options: UseCloudLoginOptions = {}) {
  const { onAuthenticated } = options;
  const [state, setState] = useState<CloudLoginState>(() =>
    isAuthenticated() ? "authenticated" : "unauthenticated",
  );
  const [error, setError] = useState<string | null>(null);
  const [manualLoginUrl, setManualLoginUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const syncAuthState = () => {
      const authenticated = isAuthenticated();
      setState(authenticated ? "authenticated" : "unauthenticated");
      if (authenticated) {
        if (pollRef.current) clearInterval(pollRef.current);
        setError(null);
        setManualLoginUrl(null);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      syncAuthState();
    };

    syncAuthState();
    window.addEventListener(CLOUD_AUTH_CHANGED_EVENT, syncAuthState);
    window.addEventListener("storage", handleStorage);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      window.removeEventListener(CLOUD_AUTH_CHANGED_EVENT, syncAuthState);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const signIn = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);

    setState("polling");
    setError(null);
    setManualLoginUrl(null);

    try {
      const { sessionId, browserUrl } = await cloudLogin();
      const loginWindow = window.open(
        browserUrl,
        "_blank",
        "noopener,noreferrer",
      );

      if (!loginWindow) {
        setError(
          "Couldn't open the sign-in window. Open the sign-in page and finish there.",
        );
        setManualLoginUrl(browserUrl);
      }

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
      setManualLoginUrl(`${CLOUD_BASE}/auth`);
    }
  }, [onAuthenticated]);

  return {
    error,
    isAuthenticated: state === "authenticated",
    manualLoginUrl,
    signIn,
    state,
  };
}
