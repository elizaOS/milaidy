/**
 * retake.tv API client.
 *
 * Handles all HTTP communication with the retake.tv platform.
 * Stateless — credentials are passed per-call or held by the caller.
 *
 * @see https://retake.tv/skill.md
 */

import { logger } from "@elizaos/core";
import type {
  ChatHistoryResponse,
  ChatSendRequest,
  LiveStreamer,
  RegisterAgentRequest,
  RetakeCredentials,
  RtmpCredentials,
  StreamStartResponse,
  StreamStatus,
  StreamStopResponse,
  ThumbnailResponse,
  TokenStats,
  TradeEntry,
} from "./types.js";

const DEFAULT_BASE_URL = "https://retake.tv/api/v1";
const DEFAULT_TIMEOUT_MS = 10_000;
const TAG = "[retake-tv]";

export class RetakeClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private accessToken: string | null;

  constructor(opts?: {
    baseUrl?: string;
    timeoutMs?: number;
    accessToken?: string;
  }) {
    this.baseUrl = (opts?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.accessToken = opts?.accessToken ?? null;
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  // -------------------------------------------------------------------------
  // Internal HTTP helpers
  // -------------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    opts?: {
      body?: unknown;
      auth?: boolean;
      formData?: FormData;
    },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {};
    if (opts?.auth !== false && this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    let body: string | FormData | undefined;
    if (opts?.formData) {
      body = opts.formData;
    } else if (opts?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    try {
      const resp = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`${TAG} ${method} ${path} → ${resp.status}: ${text}`);
      }

      return (await resp.json()) as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(
          `${TAG} ${method} ${path} timed out (${this.timeoutMs}ms)`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  async register(req: RegisterAgentRequest): Promise<RetakeCredentials> {
    logger.info(`${TAG} Registering agent "${req.agent_name}"`);
    const creds = await this.request<RetakeCredentials>(
      "POST",
      "/agent/register",
      { body: req, auth: false },
    );
    this.accessToken = creds.access_token;
    return creds;
  }

  // -------------------------------------------------------------------------
  // Stream lifecycle
  // -------------------------------------------------------------------------

  async getRtmpCredentials(): Promise<RtmpCredentials> {
    logger.debug(`${TAG} Fetching fresh RTMP credentials`);
    return this.request<RtmpCredentials>("POST", "/agent/rtmp");
  }

  async startStream(): Promise<StreamStartResponse> {
    logger.info(`${TAG} Starting stream`);
    return this.request<StreamStartResponse>("POST", "/agent/stream/start");
  }

  async getStreamStatus(): Promise<StreamStatus> {
    return this.request<StreamStatus>("GET", "/agent/stream/status");
  }

  async stopStream(): Promise<StreamStopResponse> {
    logger.info(`${TAG} Stopping stream`);
    return this.request<StreamStopResponse>("POST", "/agent/stream/stop");
  }

  async updateThumbnail(
    imageBuffer: Buffer,
    filename = "thumbnail.png",
  ): Promise<ThumbnailResponse> {
    const formData = new FormData();
    formData.append("image", new Blob([new Uint8Array(imageBuffer.buffer, imageBuffer.byteOffset, imageBuffer.byteLength)]), filename);

    logger.debug(`${TAG} Uploading thumbnail`);
    return this.request<ThumbnailResponse>("POST", "/agent/update-thumbnail", {
      formData,
    });
  }

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------

  async sendChat(destinationUserId: string, message: string): Promise<unknown> {
    const body: ChatSendRequest & { access_token?: string } = {
      message,
      destination_user_id: destinationUserId,
    };
    return this.request("POST", "/agent/stream/chat/send", { body });
  }

  async getChatHistory(
    userDbId: string,
    opts?: { limit?: number; beforeId?: string },
  ): Promise<ChatHistoryResponse> {
    const params = new URLSearchParams({ userDbId });
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.beforeId) params.set("beforeId", opts.beforeId);
    return this.request<ChatHistoryResponse>(
      "GET",
      `/agent/stream/comments?${params}`,
    );
  }

  // -------------------------------------------------------------------------
  // Public discovery (no auth required)
  // -------------------------------------------------------------------------

  async getLiveStreamers(): Promise<LiveStreamer[]> {
    return this.request<LiveStreamer[]>("GET", "/users/live/", { auth: false });
  }

  async searchUsers(query: string): Promise<unknown> {
    return this.request("GET", `/users/search/${encodeURIComponent(query)}`, {
      auth: false,
    });
  }

  async getTopTokens(): Promise<TokenStats[]> {
    return this.request<TokenStats[]>("GET", "/tokens/top/", { auth: false });
  }

  async getTrendingTokens(): Promise<TokenStats[]> {
    return this.request<TokenStats[]>("GET", "/tokens/trending/", {
      auth: false,
    });
  }

  async getTokenStats(tokenAddress: string): Promise<TokenStats> {
    return this.request<TokenStats>(
      "GET",
      `/tokens/${encodeURIComponent(tokenAddress)}/stats`,
      { auth: false },
    );
  }

  async getRecentTrades(tokenAddress?: string): Promise<TradeEntry[]> {
    const path = tokenAddress
      ? `/trades/recent/${encodeURIComponent(tokenAddress)}/`
      : "/trades/recent/";
    return this.request<TradeEntry[]>("GET", path, { auth: false });
  }

  async getPublicChat(
    streamerId: string,
    limit = 50,
  ): Promise<ChatHistoryResponse> {
    const params = new URLSearchParams({
      streamer_id: streamerId,
      limit: String(limit),
    });
    return this.request<ChatHistoryResponse>("GET", `/chat/?${params}`, {
      auth: false,
    });
  }
}
