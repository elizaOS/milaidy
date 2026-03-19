import {
  CLOUD_BASE,
  getCloudTokenStorageKey,
  isHostedRuntime,
  LEGACY_CLOUD_TOKEN_STORAGE_KEY,
} from "./runtime-config";

export const CLOUD_AUTH_CHANGED_EVENT = "milady-cloud-auth-changed";

function emitAuthChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CLOUD_AUTH_CHANGED_EVENT));
}

function getActiveTokenStorageKey(): string {
  return getCloudTokenStorageKey();
}

export function getToken(): string | null {
  const scopedToken = localStorage.getItem(getActiveTokenStorageKey());
  if (scopedToken != null) return scopedToken;
  if (!isHostedRuntime()) {
    return localStorage.getItem(LEGACY_CLOUD_TOKEN_STORAGE_KEY);
  }
  return null;
}

export function setToken(token: string): void {
  localStorage.setItem(getActiveTokenStorageKey(), token);
  localStorage.removeItem(LEGACY_CLOUD_TOKEN_STORAGE_KEY);
  emitAuthChanged();
}

export function clearToken(): void {
  localStorage.removeItem(getActiveTokenStorageKey());
  localStorage.removeItem(LEGACY_CLOUD_TOKEN_STORAGE_KEY);
  emitAuthChanged();
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

export async function cloudLogin(): Promise<{
  sessionId: string;
  browserUrl: string;
}> {
  const sessionId = crypto.randomUUID();
  const res = await fetch(`${CLOUD_BASE}/api/auth/cli-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
    redirect: "manual",
  });
  if (!res.ok) throw new Error(`Failed to create auth session: ${res.status}`);
  return {
    sessionId,
    browserUrl: `${CLOUD_BASE}/auth/cli-login?session=${encodeURIComponent(sessionId)}`,
  };
}

export async function cloudLoginPoll(
  sessionId: string,
): Promise<{ status: string; apiKey?: string }> {
  const res = await fetch(
    `${CLOUD_BASE}/api/auth/cli-session/${encodeURIComponent(sessionId)}`,
    {
      redirect: "manual",
    },
  );
  if (res.status === 404) throw new Error("Session expired");
  if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
  return res.json();
}

export interface CloudAgent {
  id: string;
  name: string;
  /** Backend returns agentName; normalized to name by fetchCloudAgents(). */
  agentName?: string;
  status: string;
  model?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function fetchCloudAgents(): Promise<CloudAgent[]> {
  const token = getToken();
  if (!token) return [];
  try {
    const res = await fetch(`${CLOUD_BASE}/api/v1/milady/agents`, {
      headers: { "X-Api-Key": token },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const raw: CloudAgent[] = Array.isArray(data)
      ? data
      : (data.agents ?? data.data ?? []);
    // Backend returns agentName; normalize to name
    return raw.map((a) => ({ ...a, name: a.name || a.agentName || a.id }));
  } catch {
    return [];
  }
}

export async function fetchWithAuth(
  url: string,
  opts: RequestInit = {},
): Promise<Response> {
  const token = getToken();
  const headers = new Headers(opts.headers);
  if (token) {
    headers.set("X-Api-Key", token);
  }
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    clearToken();
  }
  return res;
}
