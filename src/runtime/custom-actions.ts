/**
 * Custom Actions runtime loader.
 *
 * Converts `CustomActionDef[]` from config into ElizaOS `Action[]` objects
 * so the agent can use them in conversations.
 *
 * @module runtime/custom-actions
 */

import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";
import type { Action, HandlerOptions, IAgentRuntime } from "@elizaos/core";
import { loadMiladyConfig } from "../config/config";
import type {
  CustomActionDef,
  CustomActionHandler,
} from "../config/types.milady";
import {
  isBlockedPrivateOrLinkLocalIp,
  normalizeHostLike,
} from "../security/network-policy";

/** Cached runtime reference for hot-registration of new actions. */
let _runtime: IAgentRuntime | null = null;

/**
 * Store the runtime reference so we can hot-register actions later.
 * Called once from plugin.init().
 */
export function setCustomActionsRuntime(runtime: IAgentRuntime): void {
  _runtime = runtime;
}

/**
 * Hot-register a CustomActionDef into the running agent.
 * Returns the ElizaOS Action that was registered, or null if no runtime.
 */
export function registerCustomActionLive(def: CustomActionDef): Action | null {
  if (!_runtime) return null;
  const action = defToAction(def);
  _runtime.registerAction(action);
  return action;
}

/** API port for shell handler requests. */
const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

/** Valid handler types that we actually support. */
const VALID_HANDLER_TYPES = new Set(["http", "shell", "code"]);

type VmRunner = {
  runInNewContext: (
    code: string,
    contextObject: Record<string, unknown>,
    options?: { filename?: string; timeout?: number },
  ) => unknown;
};

let vmRunner: VmRunner | null = null;

async function runCodeHandler(
  code: string,
  params: Record<string, string>,
): Promise<unknown> {
  if (typeof process === "undefined" || !process.versions?.node) {
    throw new Error("Code actions are only supported in Node runtimes.");
  }

  if (!vmRunner) {
    vmRunner = (await import("node:vm")) as VmRunner;
  }

  const script = `(async () => { ${code} })();`;
  const context: Record<string, unknown> = { params, fetch };
  return await vmRunner.runInNewContext(`"use strict"; ${script}`, context, {
    filename: "milady-custom-action",
    timeout: 30_000,
  });
}

/**
 * Shell-escape a value so it can be safely interpolated into a shell command.
 * Wraps in single quotes and escapes any embedded single quotes.
 */
function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isBlockedIp(ip: string): boolean {
  return isBlockedPrivateOrLinkLocalIp(ip);
}

/**
 * Check whether a URL targets a private/internal network (SSRF guard).
 * Blocks loopback, link-local, and RFC-1918 ranges except our own API.
 * Resolves hostnames to concrete IPs to prevent DNS-alias bypasses.
 */
async function isBlockedUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    const hostname = normalizeHostLike(parsed.hostname);

    // Allow requests to our own API (terminal/run endpoint etc.)
    if (
      (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1") &&
      parsed.port === String(API_PORT)
    ) {
      return false;
    }

    // Block common internal targets
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local") ||
      hostname === "[::1]" ||
      hostname === "metadata.google.internal" ||
      hostname === "169.254.169.254"
    ) {
      return true;
    }

    // Direct IP literals can be checked immediately.
    if (net.isIP(hostname)) {
      return isBlockedIp(hostname);
    }

    // Resolve hostnames to catch aliases (e.g. nip.io) pointing at blocked IPs.
    const records = await dnsLookup(hostname, { all: true });
    const addresses = Array.isArray(records) ? records : [records];
    for (const entry of addresses) {
      if (isBlockedIp(entry.address)) {
        return true;
      }
    }

    return false;
  } catch {
    // Malformed URL or failed resolution — block it
    return true;
  }
}

/**
 * Build an async handler function from a CustomActionHandler definition.
 */
function buildHandler(
  handler: CustomActionHandler,
  paramDefs: CustomActionDef["parameters"],
): (
  params: Record<string, string>,
) => Promise<{ ok: boolean; output: string }> {
  if (!VALID_HANDLER_TYPES.has(handler.type)) {
    return async () => ({
      ok: false,
      output: `Unsupported handler type: ${handler.type}`,
    });
  }

  switch (handler.type) {
    case "http":
      return async (params) => {
        let url = handler.url;
        let body = handler.bodyTemplate ?? "";
        const headers: Record<string, string> = { ...handler.headers };

        // Substitute {{paramName}} placeholders
        // URL values get URI-encoded, body values are left raw (JSON context)
        for (const p of paramDefs) {
          const value = params[p.name] ?? "";
          url = url.replaceAll(`{{${p.name}}}`, encodeURIComponent(value));
          body = body.replaceAll(`{{${p.name}}}`, value);
        }

        // SSRF guard — block requests to internal/private networks
        if (await isBlockedUrl(url)) {
          return {
            ok: false,
            output:
              "Blocked: cannot make requests to internal network addresses",
          };
        }

        if (!headers["Content-Type"] && body) {
          headers["Content-Type"] = "application/json";
        }

        const fetchOpts: RequestInit = {
          method: handler.method || "GET",
          headers,
          redirect: "manual",
        };
        if (body && handler.method !== "GET" && handler.method !== "HEAD") {
          fetchOpts.body = body;
        }

        const response = await fetch(url, fetchOpts);
        if (response.status >= 300 && response.status < 400) {
          return {
            ok: false,
            output:
              "Blocked: redirects are not allowed for HTTP custom actions",
          };
        }
        const text = await response.text();
        return { ok: response.ok, output: text.slice(0, 4000) };
      };

    case "shell":
      return async (params) => {
        let command = handler.command;
        // Shell-escape parameter values to prevent injection
        for (const p of paramDefs) {
          const value = params[p.name] ?? "";
          command = command.replaceAll(`{{${p.name}}}`, shellEscape(value));
        }

        const response = await fetch(
          `http://localhost:${API_PORT}/api/terminal/run`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command }),
          },
        );

        if (!response.ok) {
          return {
            ok: false,
            output: `Terminal request failed: HTTP ${response.status}`,
          };
        }

        return { ok: true, output: `Executed: ${command}` };
      };

    case "code":
      // NOTE: code handlers run user-authored code from local config with
      // the same privileges as the host process. This is intentional for a
      // desktop app — the owner wrote the code. We restrict the sandbox to
      // only expose `params` and `fetch`; no require/import/process/global.
      return async (params) => {
        const result = await runCodeHandler(handler.code, params);
        const output = result !== undefined ? String(result) : "Done";
        return { ok: true, output: output.slice(0, 4000) };
      };

    default:
      return async () => ({ ok: false, output: "Unknown handler type" });
  }
}

/**
 * Convert a single CustomActionDef into an ElizaOS Action.
 */
function defToAction(def: CustomActionDef): Action {
  const handler = buildHandler(def.handler, def.parameters);

  return {
    name: def.name,
    similes: def.similes ?? [],
    description: def.description,
    validate: async () => true,

    handler: async (_runtime, _message, _state, options) => {
      try {
        const opts = options as HandlerOptions | undefined;
        const params: Record<string, string> = {};

        for (const p of def.parameters) {
          const value = opts?.parameters?.[p.name];
          if (typeof value === "string") {
            params[p.name] = value;
          } else if (value !== undefined && value !== null) {
            params[p.name] = String(value);
          } else if (p.required) {
            return {
              text: `Missing required parameter: ${p.name}`,
              success: false,
            };
          }
        }

        const result = await handler(params);
        return {
          text: result.output,
          success: result.ok,
          data: { actionId: def.id, params },
        };
      } catch (err) {
        return {
          text: `Action failed: ${err instanceof Error ? err.message : String(err)}`,
          success: false,
        };
      }
    },

    parameters: def.parameters.map((p) => ({
      name: p.name,
      description: p.description,
      required: p.required,
      schema: { type: "string" as const },
    })),
  };
}

/**
 * Load custom actions from config and convert them to ElizaOS Action objects.
 * Only returns enabled actions.
 */
export function loadCustomActions(): Action[] {
  try {
    const config = loadMiladyConfig();
    const defs = config.customActions ?? [];
    return defs.filter((d) => d.enabled).map(defToAction);
  } catch {
    return [];
  }
}

/**
 * Build a temporary handler for testing a custom action definition.
 * Used by the test endpoint to execute an action with sample params.
 */
export function buildTestHandler(
  def: CustomActionDef,
): (
  params: Record<string, string>,
) => Promise<{ ok: boolean; output: string }> {
  return buildHandler(def.handler, def.parameters);
}
