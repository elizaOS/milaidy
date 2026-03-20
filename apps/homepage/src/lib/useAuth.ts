import { useCallback, useSyncExternalStore } from "react";
import {
  CLOUD_AUTH_CHANGED_EVENT,
  clearToken,
  getToken,
  isAuthenticated,
} from "./auth";
import { getCloudTokenStorageKey } from "./runtime-config";

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  signOut: () => void;
}

// Module-level snapshot cache for stable references
let cachedSnapshot: { isAuthenticated: boolean; token: string | null } | null =
  null;

function getSnapshot(): { isAuthenticated: boolean; token: string | null } {
  const token = getToken();
  const authed = isAuthenticated();

  // Return cached snapshot if values haven't changed (stable reference)
  if (
    cachedSnapshot &&
    cachedSnapshot.isAuthenticated === authed &&
    cachedSnapshot.token === token
  ) {
    return cachedSnapshot;
  }

  cachedSnapshot = { isAuthenticated: authed, token };
  return cachedSnapshot;
}

function getServerSnapshot(): {
  isAuthenticated: boolean;
  token: string | null;
} {
  return { isAuthenticated: false, token: null };
}

function subscribe(callback: () => void): () => void {
  // Subscribe to custom auth changed event
  window.addEventListener(CLOUD_AUTH_CHANGED_EVENT, callback);

  // Subscribe to storage events for cross-tab sync
  const handleStorage = (event: StorageEvent) => {
    // Only trigger callback if the changed key is our auth token
    const tokenKey = getCloudTokenStorageKey();
    if (event.key === tokenKey || event.key === null) {
      callback();
    }
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(CLOUD_AUTH_CHANGED_EVENT, callback);
    window.removeEventListener("storage", handleStorage);
  };
}

/**
 * React hook for reactive auth state.
 * Subscribes to CLOUD_AUTH_CHANGED_EVENT and storage events for cross-tab sync.
 * Returns stable references via module-level snapshot caching.
 */
export function useAuth(): AuthState {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const signOut = useCallback(() => {
    clearToken();
  }, []);

  return {
    isAuthenticated: snapshot.isAuthenticated,
    token: snapshot.token,
    signOut,
  };
}
