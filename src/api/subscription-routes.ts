import { logger } from "@elizaos/core";
import type { MiladyConfig } from "../config/config";
import type { RouteRequestContext } from "./route-helpers";

export interface SubscriptionRouteState {
  config: MiladyConfig;
  _anthropicFlow?: import("../auth/index").AnthropicFlow;
  _codexFlow?: import("../auth/index").CodexFlow;
  _codexFlowTimer?: ReturnType<typeof setTimeout>;
}

export interface SubscriptionRouteContext extends RouteRequestContext {
  state: SubscriptionRouteState;
  saveConfig: (config: MiladyConfig) => void;
}

export async function handleSubscriptionRoutes(
  ctx: SubscriptionRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, state, readJsonBody, json, error } = ctx;
  if (!pathname.startsWith("/api/subscription/")) return false;

  // ── GET /api/subscription/status ──────────────────────────────────────
  // Returns the status of subscription-based auth providers
  if (method === "GET" && pathname === "/api/subscription/status") {
    try {
      const { getSubscriptionStatus } = await import("../auth/index");
      json(res, { providers: getSubscriptionStatus() });
    } catch (err) {
      error(res, `Failed to get subscription status: ${err}`, 500);
    }
    return true;
  }

  // ── POST /api/subscription/anthropic/start ──────────────────────────────
  // Start Anthropic OAuth flow — returns URL for user to visit
  if (method === "POST" && pathname === "/api/subscription/anthropic/start") {
    try {
      const { startAnthropicLogin } = await import("../auth/index");
      const flow = await startAnthropicLogin();
      // Store flow in server state for the exchange step
      state._anthropicFlow = flow;
      json(res, { authUrl: flow.authUrl });
    } catch (err) {
      error(res, `Failed to start Anthropic login: ${err}`, 500);
    }
    return true;
  }

  // ── POST /api/subscription/anthropic/exchange ───────────────────────────
  // Exchange Anthropic auth code for tokens
  if (
    method === "POST" &&
    pathname === "/api/subscription/anthropic/exchange"
  ) {
    const body = await readJsonBody<{ code: string }>(req, res);
    if (!body) return true;
    if (!body.code) {
      error(res, "Missing code", 400);
      return true;
    }
    try {
      const { saveCredentials, applySubscriptionCredentials } = await import(
        "../auth/index"
      );
      const flow = state._anthropicFlow;
      if (!flow) {
        error(res, "No active flow — call /start first", 400);
        return true;
      }
      // Submit the code and wait for credentials
      flow.submitCode(body.code);
      const credentials = await flow.credentials;
      saveCredentials("anthropic-subscription", credentials);
      await applySubscriptionCredentials();
      delete state._anthropicFlow;
      json(res, { success: true, expiresAt: credentials.expires });
    } catch (err) {
      error(res, `Anthropic exchange failed: ${err}`, 500);
    }
    return true;
  }

  // ── POST /api/subscription/anthropic/setup-token ────────────────────────
  // Accept an Anthropic setup-token (sk-ant-oat01-...) directly
  if (
    method === "POST" &&
    pathname === "/api/subscription/anthropic/setup-token"
  ) {
    const body = await readJsonBody<{ token: string }>(req, res);
    if (!body) return true;
    if (!body.token || !body.token.startsWith("sk-ant-")) {
      error(res, "Invalid token format — expected sk-ant-oat01-...", 400);
      return true;
    }
    try {
      // Setup tokens are direct API keys — set in env immediately
      process.env.ANTHROPIC_API_KEY = body.token.trim();
      // Also save to config so it persists across restarts
      if (!state.config.env) state.config.env = {};
      (state.config.env as Record<string, string>).ANTHROPIC_API_KEY =
        body.token.trim();
      ctx.saveConfig(state.config);
      json(res, { success: true });
    } catch (err) {
      error(res, `Failed to save setup token: ${err}`, 500);
    }
    return true;
  }

  // ── POST /api/subscription/openai/start ─────────────────────────────────
  // Start OpenAI Codex OAuth flow — returns URL and starts callback server
  if (method === "POST" && pathname === "/api/subscription/openai/start") {
    try {
      const { startCodexLogin } = await import("../auth/index");
      // Clean up unknown stale flow from a previous attempt
      if (state._codexFlow) {
        try {
          state._codexFlow.close();
        } catch (err) {
          logger.debug(
            `[api] OAuth flow cleanup failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      clearTimeout(state._codexFlowTimer);

      const flow = await startCodexLogin();
      // Store flow state + auto-cleanup after 10 minutes
      state._codexFlow = flow;
      state._codexFlowTimer = setTimeout(
        () => {
          try {
            flow.close();
          } catch (err) {
            logger.debug(
              `[api] OAuth flow cleanup failed: ${err instanceof Error ? err.message : err}`,
            );
          }
          delete state._codexFlow;
          delete state._codexFlowTimer;
        },
        10 * 60 * 1000,
      );
      json(res, {
        authUrl: flow.authUrl,
        state: flow.state,
        instructions:
          "Open the URL in your browser. After login, if auto-redirect doesn't work, paste the full redirect URL.",
      });
    } catch (err) {
      error(res, `Failed to start OpenAI login: ${err}`, 500);
    }
    return true;
  }

  // ── POST /api/subscription/openai/exchange ──────────────────────────────
  // Exchange OpenAI auth code or wait for callback
  if (method === "POST" && pathname === "/api/subscription/openai/exchange") {
    const body = await readJsonBody<{
      code?: string;
      waitForCallback?: boolean;
    }>(req, res);
    if (!body) return true;
    try {
      const { saveCredentials, applySubscriptionCredentials } = await import(
        "../auth/index"
      );
      const flow = state._codexFlow;

      if (!flow) {
        error(res, "No active flow — call /start first", 400);
        return true;
      }

      if (body.code) {
        // Manual code/URL paste — submit to flow
        flow.submitCode(body.code);
      } else if (!body.waitForCallback) {
        error(res, "Provide either code or set waitForCallback: true", 400);
        return true;
      }

      // Wait for credentials (either from callback server or manual submission)
      let credentials: import("../auth/index").OAuthCredentials;
      try {
        credentials = await flow.credentials;
      } catch (err) {
        try {
          flow.close();
        } catch (closeErr) {
          logger.debug(
            `[api] OAuth flow cleanup failed: ${closeErr instanceof Error ? closeErr.message : closeErr}`,
          );
        }
        delete state._codexFlow;
        clearTimeout(state._codexFlowTimer);
        delete state._codexFlowTimer;
        error(res, `OpenAI exchange failed: ${err}`, 500);
        return true;
      }
      saveCredentials("openai-codex", credentials);
      await applySubscriptionCredentials();
      flow.close();
      delete state._codexFlow;
      clearTimeout(state._codexFlowTimer);
      delete state._codexFlowTimer;
      json(res, {
        success: true,
        expiresAt: credentials.expires,
      });
    } catch (err) {
      error(res, `OpenAI exchange failed: ${err}`, 500);
    }
    return true;
  }

  // ── DELETE /api/subscription/:provider ───────────────────────────────────
  // Remove subscription credentials
  if (method === "DELETE" && pathname.startsWith("/api/subscription/")) {
    const provider = pathname.split("/").pop();
    if (provider === "anthropic-subscription" || provider === "openai-codex") {
      try {
        const { deleteCredentials } = await import("../auth/index");
        deleteCredentials(provider);
        json(res, { success: true });
      } catch (err) {
        error(res, `Failed to delete credentials: ${err}`, 500);
      }
    } else {
      error(res, `Unknown provider: ${provider}`, 400);
    }
    return true;
  }

  return false;
}
