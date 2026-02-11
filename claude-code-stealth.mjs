/**
 * Claude Code Stealth Mode
 *
 * Preload hook used by `scripts/dev-ui.mjs` when running the dev server under
 * plain Node (no Bun).
 *
 * This mirrors `src/auth/claude-code-stealth.ts`, but is shipped as a root-level
 * .mjs so it can be loaded via `node --import ./claude-code-stealth.mjs`.
 *
 * It monkey-patches global fetch to support Anthropic "Claude Code" setup tokens
 * (sk-ant-oat...).
 */

const STEALTH_GUARD = Symbol.for("milaidy.claudeCodeStealthInstalled");
const CLAUDE_CODE_VERSION = "2.1.2";
const CLAUDE_CODE_SYSTEM_PREFIX =
  "You are Claude Code, Anthropic's official CLI for Claude.";
const ANTHROPIC_BETA =
  "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14";

function isSetupToken(value) {
  return typeof value === "string" && value.startsWith("sk-ant-oat");
}

function getUrl(input) {
  try {
    if (typeof input === "string") return new URL(input);
    if (input instanceof URL) return input;
    return new URL(input.url);
  } catch {
    return null;
  }
}

function addSystemPrefix(body) {
  if (!body || typeof body !== "object") return body;

  const next = body;
  const prefix = { type: "text", text: CLAUDE_CODE_SYSTEM_PREFIX };

  if (Array.isArray(next.system)) {
    const hasPrefix = next.system.some((block) =>
      block?.text?.startsWith("You are Claude Code"),
    );
    if (!hasPrefix) next.system.unshift(prefix);
  } else if (typeof next.system === "string") {
    next.system = [prefix, { type: "text", text: next.system }];
  } else {
    next.system = [prefix];
  }

  return next;
}

export function installClaudeCodeStealthFetchInterceptor() {
  if (globalThis[STEALTH_GUARD]) return;

  const originalFetch = globalThis.fetch.bind(globalThis);

  const stealthFetch = async function stealthFetch(input, init) {
    const url = getUrl(input);
    if (!url || url.hostname !== "api.anthropic.com") {
      return originalFetch(input, init);
    }

    const request = input instanceof Request ? input : null;
    const headers = new Headers(init?.headers ?? request?.headers ?? undefined);
    const apiKey = headers.get("x-api-key");
    const authHeader = headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    const setupToken = isSetupToken(apiKey)
      ? apiKey
      : isSetupToken(bearerToken)
        ? bearerToken
        : null;

    if (!setupToken) {
      return originalFetch(input, init);
    }

    headers.delete("x-api-key");
    headers.set("authorization", `Bearer ${setupToken}`);
    headers.set("anthropic-beta", ANTHROPIC_BETA);
    headers.set(
      "user-agent",
      `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`,
    );
    headers.set("x-app", "cli");

    let body = init?.body ?? request?.body;

    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body);
        const updated = addSystemPrefix(parsed);
        body = JSON.stringify(updated);
        // eslint-disable-next-line no-console
        console.log(
          `[stealth] Patched Anthropic request for ${String(updated.model ?? "unknown-model")}`,
        );
      } catch {
        // eslint-disable-next-line no-console
        console.log(
          "[stealth] Anthropic request body was not JSON; skipping system prefix",
        );
      }
    }

    const nextInit = {
      ...init,
      headers,
      body: init ? body : undefined,
    };

    if (request && !init) {
      const nextRequest = new Request(request, {
        headers,
        body: typeof body === "string" ? body : undefined,
      });
      return originalFetch(nextRequest);
    }

    return originalFetch(input, nextInit);
  };

  // Preserve Bun-specific properties like `preconnect` from the original fetch.
  if (globalThis.fetch && "preconnect" in globalThis.fetch) {
    stealthFetch.preconnect = globalThis.fetch.preconnect;
  }

  globalThis.fetch = stealthFetch;
  globalThis[STEALTH_GUARD] = true;

  // eslint-disable-next-line no-console
  console.log("[stealth] Claude Code setup token runtime support enabled");
}

// Install immediately when preloaded.
installClaudeCodeStealthFetchInterceptor();
