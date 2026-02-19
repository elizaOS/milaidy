/**
 * Navigation — tabs + onboarding.
 */

export type Tab = "chat" | "inventory" | "accounts" | "ai-setup" | "apps" | "skills" | "config" | "logs";

export const TAB_GROUPS = [
  { label: "Chat", tabs: ["chat"] as Tab[] },
  { label: "Portfolio", tabs: ["inventory"] as Tab[] },
  { label: "Markets & Apps", tabs: ["apps"] as Tab[] },
  { label: "AI Settings", tabs: ["ai-setup"] as Tab[] },
  { label: "Account", tabs: ["accounts"] as Tab[] },
  { label: "Security", tabs: ["config"] as Tab[] },
] as const;

const TAB_PATHS: Record<Tab, string> = {
  chat: "/chat",
  inventory: "/inventory",
  accounts: "/accounts",
  "ai-setup": "/ai-setup",
  apps: "/apps",
  skills: "/skills",
  config: "/config",
  logs: "/logs",
};

const PATH_TO_TAB = new Map(
  Object.entries(TAB_PATHS).map(([tab, p]) => [p, tab as Tab]),
);

export function pathForTab(tab: Tab, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  const p = TAB_PATHS[tab];
  return base ? `${base}${p}` : p;
}

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const base = normalizeBasePath(basePath);
  let p = pathname || "/";
  if (base) {
    if (p === base) p = "/";
    else if (p.startsWith(`${base}/`)) p = p.slice(base.length);
  }
  let normalized = normalizePath(p).toLowerCase();
  if (normalized.endsWith("/index.html")) normalized = "/";
  if (normalized === "/") return "chat";
  if (normalized === "/plugins") return "accounts";
  return PATH_TO_TAB.get(normalized) ?? null;
}

export function normalizeBasePath(basePath: string): string {
  if (!basePath) return "";
  let base = basePath.trim();
  if (!base.startsWith("/")) base = `/${base}`;
  if (base === "/") return "";
  if (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

export function normalizePath(p: string): string {
  if (!p) return "/";
  let normalized = p.trim();
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  if (normalized.length > 1 && normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized;
}

export function basePathFromLocation(pathname: string): string {
  const normalized = normalizePath(pathname).toLowerCase();
  // Legacy URL alias support: "/plugins" now maps to "accounts".
  if (normalized === "/plugins") return "";
  if (normalized.endsWith("/plugins")) {
    const prefix = normalized.slice(0, -"/plugins".length);
    return normalizeBasePath(prefix);
  }
  for (const p of Object.values(TAB_PATHS)) {
    if (normalized === p) return "";
    if (normalized.endsWith(p)) {
      const prefix = normalized.slice(0, -p.length);
      return normalizeBasePath(prefix);
    }
  }
  return "";
}

export function titleForTab(tab: Tab): string {
  switch (tab) {
    case "chat": return "Chat";
    case "inventory": return "Portfolio";
    case "accounts": return "Account";
    case "ai-setup": return "AI Settings";
    case "apps": return "Markets & Apps";
    case "skills": return "Skills";
    case "config": return "Security";
    case "logs": return "Activity";
    default: return "Milaidy";
  }
}

export function subtitleForTab(tab: Tab): string {
  switch (tab) {
    case "chat": return "Chat with Milaidy.";
    case "inventory": return "Your tokens and NFTs in one place.";
    case "accounts": return "Manage account-level connections and identity settings.";
    case "ai-setup": return "Configure Milaidy model and memory settings.";
    case "apps": return "Use user-facing actions like markets and social apps.";
    case "skills": return "View available skills.";
    case "config": return "Confirmations, wallet status, and security audit.";
    case "logs": return "Recent system activity.";
    default: return "";
  }
}
