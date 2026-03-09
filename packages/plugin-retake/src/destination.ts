/**
 * Retake.tv streaming destination adapter.
 *
 * Provides `createRetakeDestination()` — a factory that returns a
 * `StreamingDestination` for the Retake.tv platform. Handles RTMP
 * credential fetching and session start/stop via the retake.tv API.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";
import { buildPresetLayout } from "@milady/plugin-streaming-base";
import type { StreamingDestination } from "./types.ts";

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

function isBlockedIp(address: string): boolean {
  if (address === "::1") return true;
  if (address.startsWith("fe80:") || address.startsWith("fc")) return true;
  if (!net.isIPv4(address)) return false;

  const [a, b] = address.split(".").map((part) => Number.parseInt(part, 10));
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

async function resolveRetakeApiBaseUrl(
  configuredApiUrl: string,
): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(configuredApiUrl);
  } catch {
    throw new Error("RETAKE_API_URL must be a valid absolute URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("RETAKE_API_URL must use http:// or https://");
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname) {
    throw new Error("RETAKE_API_URL host is required");
  }
  if (
    BLOCKED_HOSTS.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error(`RETAKE_API_URL host \"${hostname}\" is blocked`);
  }

  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error(`RETAKE_API_URL host \"${hostname}\" is blocked`);
    }
  } else {
    const resolved = await dnsLookup(hostname, { all: true });
    if (resolved.length === 0) {
      throw new Error(`Could not resolve RETAKE_API_URL host \"${hostname}\"`);
    }
    for (const entry of resolved) {
      if (isBlockedIp(entry.address)) {
        throw new Error(
          `RETAKE_API_URL host \"${hostname}\" resolves to blocked address`,
        );
      }
    }
  }

  return parsed.toString().replace(/\/+$/, "");
}

export function createRetakeDestination(config?: {
  accessToken?: string;
  apiUrl?: string;
}): StreamingDestination {
  return {
    id: "retake",
    name: "Retake.tv",
    defaultOverlayLayout: buildPresetLayout("Retake", [
      "thought-bubble",
      "alert-popup",
      "branding",
    ]),

    async getCredentials() {
      const token = (
        config?.accessToken ??
        process.env.RETAKE_AGENT_TOKEN ??
        ""
      ).trim();
      if (!token) throw new Error("Retake access token not configured");

      const apiUrl = await resolveRetakeApiBaseUrl(
        config?.apiUrl ??
          process.env.RETAKE_API_URL ??
          "https://retake.tv/api/v1",
      );
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      const rtmpRes = await fetch(`${apiUrl}/agent/rtmp`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (!rtmpRes.ok) {
        throw new Error(`RTMP creds failed: ${rtmpRes.status}`);
      }
      const { url: rtmpUrl, key: rtmpKey } = (await rtmpRes.json()) as {
        url: string;
        key: string;
      };
      return { rtmpUrl, rtmpKey };
    },

    async onStreamStart() {
      const token = (
        config?.accessToken ??
        process.env.RETAKE_AGENT_TOKEN ??
        ""
      ).trim();
      if (!token) return;

      const apiUrl = await resolveRetakeApiBaseUrl(
        config?.apiUrl ??
          process.env.RETAKE_API_URL ??
          "https://retake.tv/api/v1",
      );
      const res = await fetch(`${apiUrl}/agent/stream/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`retake.tv start failed: ${res.status} ${text}`);
      }
    },

    async onStreamStop() {
      const token = (
        config?.accessToken ??
        process.env.RETAKE_AGENT_TOKEN ??
        ""
      ).trim();
      if (!token) return;

      const apiUrl = await resolveRetakeApiBaseUrl(
        config?.apiUrl ??
          process.env.RETAKE_API_URL ??
          "https://retake.tv/api/v1",
      );
      await fetch(`${apiUrl}/agent/stream/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(15_000),
      }).catch(() => {});
    },
  };
}
