import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

export interface HyperscapeRelayOptions {
  rawBodyOverride?: string;
  contentTypeOverride?: string;
}

export interface AppsHyperscapeRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "readJsonBody" | "error"> {
  relayHyperscapeApi: (
    method: "GET" | "POST",
    path: string,
    options?: HyperscapeRelayOptions,
  ) => Promise<void>;
}

export async function handleAppsHyperscapeRoutes(
  ctx: AppsHyperscapeRouteContext,
): Promise<boolean> {
  const {
    req,
    res,
    method,
    pathname,
    relayHyperscapeApi,
    readJsonBody,
    error,
  } = ctx;

  if (method === "GET" && pathname === "/api/apps/hyperscape/embedded-agents") {
    await relayHyperscapeApi("GET", "/api/embedded-agents");
    return true;
  }

  if (
    method === "POST" &&
    pathname === "/api/apps/hyperscape/embedded-agents"
  ) {
    await relayHyperscapeApi("POST", "/api/embedded-agents");
    return true;
  }

  if (method === "POST") {
    const embeddedActionMatch = pathname.match(
      /^\/api\/apps\/hyperscape\/embedded-agents\/([^/]+)\/(start|stop|pause|resume|command)$/,
    );
    if (embeddedActionMatch) {
      const characterId = decodeURIComponent(embeddedActionMatch[1]);
      const action = embeddedActionMatch[2];
      await relayHyperscapeApi(
        "POST",
        `/api/embedded-agents/${encodeURIComponent(characterId)}/${action}`,
      );
      return true;
    }

    const messageMatch = pathname.match(
      /^\/api\/apps\/hyperscape\/agents\/([^/]+)\/message$/,
    );
    if (messageMatch) {
      const agentId = decodeURIComponent(messageMatch[1]);
      const body = await readJsonBody<{ content?: string }>(req, res);
      if (!body) return true;
      const content = body.content?.trim();
      if (!content) {
        error(res, "content is required");
        return true;
      }
      await relayHyperscapeApi(
        "POST",
        `/api/embedded-agents/${encodeURIComponent(agentId)}/command`,
        {
          rawBodyOverride: JSON.stringify({
            command: "chat",
            data: { message: content },
          }),
          contentTypeOverride: "application/json",
        },
      );
      return true;
    }
  }

  if (method === "GET") {
    const goalMatch = pathname.match(
      /^\/api\/apps\/hyperscape\/agents\/([^/]+)\/goal$/,
    );
    if (goalMatch) {
      const agentId = decodeURIComponent(goalMatch[1]);
      await relayHyperscapeApi(
        "GET",
        `/api/agents/${encodeURIComponent(agentId)}/goal`,
      );
      return true;
    }

    const quickActionsMatch = pathname.match(
      /^\/api\/apps\/hyperscape\/agents\/([^/]+)\/quick-actions$/,
    );
    if (quickActionsMatch) {
      const agentId = decodeURIComponent(quickActionsMatch[1]);
      await relayHyperscapeApi(
        "GET",
        `/api/agents/${encodeURIComponent(agentId)}/quick-actions`,
      );
      return true;
    }
  }

  return false;
}
