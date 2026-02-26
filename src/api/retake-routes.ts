/**
 * Retake.tv streaming destination adapter.
 *
 * Provides `createRetakeDestination()` — a factory that returns a
 * `StreamingDestination` for the Retake.tv platform. Handles RTMP
 * credential fetching and session start/stop via the retake.tv API.
 */

import type { StreamingDestination } from "./stream-routes";

export function createRetakeDestination(config?: {
  accessToken?: string;
  apiUrl?: string;
}): StreamingDestination {
  return {
    id: "retake",
    name: "Retake.tv",

    async getCredentials() {
      const token = (
        config?.accessToken ??
        process.env.RETAKE_AGENT_TOKEN ??
        ""
      ).trim();
      if (!token) throw new Error("Retake access token not configured");

      const apiUrl = (
        config?.apiUrl ??
        process.env.RETAKE_API_URL ??
        "https://retake.tv/api/v1"
      ).trim();
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      const rtmpRes = await fetch(`${apiUrl}/agent/rtmp`, {
        method: "POST",
        headers,
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

      const apiUrl = (
        config?.apiUrl ??
        process.env.RETAKE_API_URL ??
        "https://retake.tv/api/v1"
      ).trim();
      const res = await fetch(`${apiUrl}/agent/stream/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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

      const apiUrl = (
        config?.apiUrl ??
        process.env.RETAKE_API_URL ??
        "https://retake.tv/api/v1"
      ).trim();
      await fetch(`${apiUrl}/agent/stream/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => {});
    },
  };
}
