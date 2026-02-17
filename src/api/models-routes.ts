import type http from "node:http";

export interface ModelsRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  url: URL;
  json: (res: http.ServerResponse, data: object, status?: number) => void;
  providerCachePath: (provider: string) => string;
  getOrFetchProvider: (provider: string, force: boolean) => Promise<unknown[]>;
  getOrFetchAllProviders: (
    force: boolean,
  ) => Promise<Record<string, unknown[]>>;
  resolveModelsCacheDir: () => string;
  pathExists: (targetPath: string) => boolean;
  readDir: (targetPath: string) => string[];
  unlinkFile: (targetPath: string) => void;
  joinPath: (left: string, right: string) => string;
}

export async function handleModelsRoutes(
  ctx: ModelsRouteContext,
): Promise<boolean> {
  const {
    res,
    method,
    pathname,
    url,
    json,
    providerCachePath,
    getOrFetchProvider,
    getOrFetchAllProviders,
    resolveModelsCacheDir,
    pathExists,
    readDir,
    unlinkFile,
    joinPath,
  } = ctx;

  // ── GET /api/models ───────────────────────────────────────────────────
  // Optional ?provider=openai to fetch a single provider, or all if omitted.
  // ?refresh=true busts the cache for the requested provider(s).
  if (method !== "GET" || pathname !== "/api/models") return false;

  const force = url.searchParams.get("refresh") === "true";
  const specificProvider = url.searchParams.get("provider");

  if (specificProvider) {
    if (force) {
      try {
        unlinkFile(providerCachePath(specificProvider));
      } catch {
        // Ignore cache-bust errors and continue with a fresh fetch.
      }
    }
    const models = await getOrFetchProvider(specificProvider, force);
    json(res, { provider: specificProvider, models });
    return true;
  }

  if (force) {
    // Bust all cache files
    try {
      const dir = resolveModelsCacheDir();
      if (pathExists(dir)) {
        for (const file of readDir(dir)) {
          if (file.endsWith(".json")) unlinkFile(joinPath(dir, file));
        }
      }
    } catch {
      // Ignore cache-bust errors and continue with a fresh fetch.
    }
  }

  const all = await getOrFetchAllProviders(force);
  json(res, { providers: all });
  return true;
}
