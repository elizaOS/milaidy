import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links";
import { theme } from "../../terminal/theme";
import { runCommandWithRuntime } from "../cli-utils";

const defaultRuntime = { error: console.error, exit: process.exit };

function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

interface MiladyApiProbe {
  baseUrl: string;
  reachable: boolean;
  runtimeState: string | null;
  onboardingComplete: boolean | null;
  pluginCount: number | null;
  authDenied: boolean;
}

interface ResolvedTuiApiBase {
  baseUrl: string;
  source: "cli" | "env" | "auto";
  reachableCandidateCount: number;
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs = 1200,
  headers?: Record<string, string>,
): Promise<{ ok: boolean; status: number; body: unknown | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers,
    });

    let body: unknown | null = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

function getMiladyApiProbeHeaders(
  includeAuth: boolean,
): Record<string, string> | undefined {
  if (!includeAuth) return undefined;

  const token = process.env.MILADY_API_TOKEN?.trim();
  if (!token) return undefined;

  return { Authorization: `Bearer ${token}` };
}

async function probeMiladyApi(
  baseUrl: string,
  includeAuth = false,
): Promise<MiladyApiProbe> {
  const headers = getMiladyApiProbeHeaders(includeAuth);
  const statusRes = await fetchJsonWithTimeout(
    `${baseUrl}/api/status`,
    1200,
    headers,
  );
  const reachable = statusRes.status !== 0 && statusRes.status !== 404;

  if (!reachable) {
    return {
      baseUrl,
      reachable: false,
      runtimeState: null,
      onboardingComplete: null,
      pluginCount: null,
      authDenied: false,
    };
  }

  const statusBody =
    statusRes.body && typeof statusRes.body === "object"
      ? (statusRes.body as Record<string, unknown>)
      : null;
  const runtimeState =
    typeof statusBody?.state === "string" ? statusBody.state : null;

  const conversationsRes = await fetchJsonWithTimeout(
    `${baseUrl}/api/conversations`,
    1200,
    headers,
  );

  const onboardingRes = await fetchJsonWithTimeout(
    `${baseUrl}/api/onboarding/status`,
    1200,
    headers,
  );
  const onboardingBody =
    onboardingRes.body && typeof onboardingRes.body === "object"
      ? (onboardingRes.body as Record<string, unknown>)
      : null;
  const onboardingComplete =
    typeof onboardingBody?.complete === "boolean"
      ? onboardingBody.complete
      : null;

  const pluginsRes = await fetchJsonWithTimeout(
    `${baseUrl}/api/plugins`,
    1200,
    headers,
  );
  const pluginsBody =
    pluginsRes.body && typeof pluginsRes.body === "object"
      ? (pluginsRes.body as Record<string, unknown>)
      : null;
  const pluginCount = Array.isArray(pluginsBody?.plugins)
    ? pluginsBody.plugins.length
    : null;

  const authDenied = [statusRes.status, conversationsRes.status].some(
    (status) => status === 401 || status === 403,
  );

  return {
    baseUrl,
    reachable,
    runtimeState,
    onboardingComplete,
    pluginCount,
    authDenied,
  };
}

async function resolveTuiApiBaseUrl(
  cliValue?: string,
): Promise<ResolvedTuiApiBase | null> {
  const explicit = cliValue?.trim();
  if (explicit) {
    return {
      baseUrl: normalizeApiBaseUrl(explicit),
      source: "cli",
      reachableCandidateCount: 1,
    };
  }

  const envValue =
    process.env.MILADY_API_BASE_URL?.trim() ||
    process.env.MILADY_API_BASE?.trim();
  if (envValue) {
    return {
      baseUrl: normalizeApiBaseUrl(envValue),
      source: "env",
      reachableCandidateCount: 1,
    };
  }

  const candidates = [
    process.env.MILADY_PORT?.trim()
      ? `http://127.0.0.1:${process.env.MILADY_PORT.trim()}`
      : null,
    "http://127.0.0.1:31337",
    "http://127.0.0.1:2138",
  ].filter((candidate): candidate is string => Boolean(candidate));

  const normalizedCandidates: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = normalizeApiBaseUrl(candidate);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    normalizedCandidates.push(normalized);
  }

  const probes: MiladyApiProbe[] = [];
  for (const candidate of normalizedCandidates) {
    probes.push(await probeMiladyApi(candidate, false));
  }

  const reachableCandidateCount = probes.filter(
    (probe) => probe.reachable,
  ).length;

  const ready = probes.find(
    (probe) =>
      probe.reachable &&
      !probe.authDenied &&
      probe.runtimeState === "running" &&
      probe.onboardingComplete === true &&
      (probe.pluginCount ?? 0) > 0,
  );
  if (ready) {
    return {
      baseUrl: ready.baseUrl,
      source: "auto",
      reachableCandidateCount,
    };
  }

  const onboarded = probes.find(
    (probe) =>
      probe.reachable &&
      !probe.authDenied &&
      probe.runtimeState === "running" &&
      probe.onboardingComplete === true,
  );
  if (onboarded) {
    return {
      baseUrl: onboarded.baseUrl,
      source: "auto",
      reachableCandidateCount,
    };
  }

  const reachable = probes.find((probe) => probe.reachable);
  if (reachable) {
    return {
      baseUrl: reachable.baseUrl,
      source: "auto",
      reachableCandidateCount,
    };
  }

  return null;
}

async function tuiAction(options: {
  model?: string;
  apiBaseUrl?: string;
  localRuntime?: boolean;
}) {
  await runCommandWithRuntime(defaultRuntime, async () => {
    const { launchTUI } = await import("../../tui/index");

    if (options.localRuntime) {
      const { bootElizaRuntime } = await import("../../runtime/eliza");
      const runtime = await bootElizaRuntime({ requireConfig: true });
      await launchTUI(runtime, {
        modelOverride: options.model,
      });
      return;
    }

    const resolvedApi = await resolveTuiApiBaseUrl(options.apiBaseUrl);
    if (!resolvedApi) {
      throw new Error(
        "No Milady API runtime detected. Start frontend/API first, pass --api-base-url, or use --local-runtime.",
      );
    }

    const apiBaseUrl = resolvedApi.baseUrl;
    const hasToken = Boolean(process.env.MILADY_API_TOKEN?.trim());
    const includeAuthProbe =
      resolvedApi.source !== "auto" ||
      resolvedApi.reachableCandidateCount === 1;
    const suppressApiTokenForwarding =
      hasToken &&
      resolvedApi.source === "auto" &&
      resolvedApi.reachableCandidateCount > 1;

    const probe = await probeMiladyApi(apiBaseUrl, includeAuthProbe);
    if (!probe.reachable) {
      throw new Error(
        `Could not reach Milady API runtime at ${apiBaseUrl}. Check port and network connectivity.`,
      );
    }

    if (probe.authDenied) {
      if (!hasToken) {
        throw new Error(
          `Milady API runtime at ${apiBaseUrl} requires authentication. Set MILADY_API_TOKEN and retry.`,
        );
      }

      if (suppressApiTokenForwarding) {
        throw new Error(
          `Milady API runtime at ${apiBaseUrl} requires authentication, but multiple local API candidates were detected. For token safety, auto-discovery does not send MILADY_API_TOKEN to all ports. Re-run with --api-base-url ${apiBaseUrl} to opt in explicitly.`,
        );
      }

      throw new Error(
        `Milady API runtime at ${apiBaseUrl} rejected MILADY_API_TOKEN (401/403). Verify token scope/value and retry.`,
      );
    }

    if (probe.runtimeState !== "running") {
      throw new Error(
        `Milady API runtime at ${apiBaseUrl} is not ready (state=${probe.runtimeState ?? "unknown"}). Wait for runtime startup to complete and resolve backend errors in frontend logs.`,
      );
    }

    if (probe.onboardingComplete === false) {
      throw new Error(
        `Milady API runtime at ${apiBaseUrl} is not onboarded yet (complete=false). Complete onboarding in the frontend for this runtime.`,
      );
    }

    if (probe.pluginCount === 0) {
      throw new Error(
        `Milady API runtime at ${apiBaseUrl} has no model/provider plugins loaded. Configure a provider in onboarding first.`,
      );
    }

    await launchTUI(null, {
      modelOverride: options.model,
      apiBaseUrl,
      apiToken: suppressApiTokenForwarding ? null : undefined,
    });
  });
}

export function registerTuiCommand(program: Command) {
  program
    .command("tui", { isDefault: true })
    .description("Start Milady with the interactive TUI")
    .option(
      "-m, --model <model>",
      "Model to use (e.g. anthropic/claude-sonnet-4-20250514)",
    )
    .option(
      "--api-base-url <url>",
      "API runtime base URL (default: env vars, then auto-detect 31337/2138)",
    )
    .option(
      "--local-runtime",
      "Boot a standalone local runtime (advanced; API mode is default)",
    )
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/tui", "docs.milady.ai/tui")}\n${theme.muted("Default mode:")} API runtime mode (shared with frontend).\n${theme.muted("API auth:")} Set MILADY_API_TOKEN when the API/websocket server requires auth.\n`,
    )
    .action(tuiAction);
}
