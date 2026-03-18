const TOKEN_KEY = "milady-cloud-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

export async function fetchWithAuth(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(opts.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    clearToken();
  }
  return res;
}
