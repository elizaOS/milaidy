import { describe, expect, test, vi } from "vitest";
import { handleModelsRoutes } from "./models-routes";

describe("models routes", () => {
  const providerCachePath = vi.fn(
    (provider: string) => `/cache/${provider}.json`,
  );
  const getOrFetchProvider = vi.fn(async () => [{ id: "gpt-4.1-mini" }]);
  const getOrFetchAllProviders = vi.fn(async () => ({
    openai: [{ id: "gpt-4.1-mini" }],
    anthropic: [{ id: "claude-sonnet-4" }],
  }));
  const resolveModelsCacheDir = vi.fn(() => "/cache");
  const pathExists = vi.fn(() => true);
  const readDir = vi.fn(() => ["openai.json", "notes.txt", "anthropic.json"]);
  const unlinkFile = vi.fn();
  const joinPath = vi.fn((left: string, right: string) => `${left}/${right}`);

  async function invoke(args: {
    method: string;
    pathname: string;
    url?: string;
  }): Promise<{
    handled: boolean;
    status: number;
    payload: Record<string, unknown> | null;
  }> {
    let status = 200;
    let payload: Record<string, unknown> | null = null;

    const handled = await handleModelsRoutes({
      req: {} as never,
      res: {} as never,
      method: args.method,
      pathname: args.pathname,
      url: new URL(args.url ?? args.pathname, "http://localhost:2138"),
      json: (_res, data, code = 200) => {
        status = code;
        payload = data as Record<string, unknown>;
      },
      providerCachePath,
      getOrFetchProvider,
      getOrFetchAllProviders,
      resolveModelsCacheDir,
      pathExists,
      readDir,
      unlinkFile,
      joinPath,
    });

    return { handled, status, payload };
  }

  test("returns false for non-model routes", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/status",
    });

    expect(result.handled).toBe(false);
  });

  test("returns provider models without cache bust by default", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/models",
      url: "/api/models?provider=openai",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      provider: "openai",
      models: [{ id: "gpt-4.1-mini" }],
    });
    expect(getOrFetchProvider).toHaveBeenCalledWith("openai", false);
    expect(unlinkFile).not.toHaveBeenCalled();
  });

  test("busts single-provider cache when refresh=true", async () => {
    await invoke({
      method: "GET",
      pathname: "/api/models",
      url: "/api/models?provider=openai&refresh=true",
    });

    expect(providerCachePath).toHaveBeenCalledWith("openai");
    expect(unlinkFile).toHaveBeenCalledWith("/cache/openai.json");
    expect(getOrFetchProvider).toHaveBeenCalledWith("openai", true);
  });

  test("busts all json caches for full refresh", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/models",
      url: "/api/models?refresh=true",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      providers: {
        openai: [{ id: "gpt-4.1-mini" }],
      },
    });
    expect(resolveModelsCacheDir).toHaveBeenCalledTimes(1);
    expect(unlinkFile).toHaveBeenCalledWith("/cache/openai.json");
    expect(unlinkFile).toHaveBeenCalledWith("/cache/anthropic.json");
    expect(unlinkFile).not.toHaveBeenCalledWith("/cache/notes.txt");
    expect(getOrFetchAllProviders).toHaveBeenCalledWith(true);
  });
});
