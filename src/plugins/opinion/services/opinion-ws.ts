/**
 * Opinion WebSocket service — monitors prices for position-held markets.
 */
import type { IAgentRuntime } from "@elizaos/core";
import { opinionClient } from "../client.js";
import type { OpinionPosition } from "../types.js";

const WS_URL = "wss://ws.opinion.trade";
const HEARTBEAT_INTERVAL_MS = 25_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;
const PRICE_ALERT_THRESHOLD = 0.1;

interface WsMessageData {
  channel?: string;
  data?: {
    tokenId?: string | number;
    price?: string | number;
    marketId?: string | number;
  };
}

export class OpinionWsService {
  static serviceType = "opinion-ws";

  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private runtime: IAgentRuntime | null = null;
  private subscribedMarkets = new Set<number>();
  private lastPrices = new Map<string, number>();
  private _connected = false;

  get isConnected(): boolean {
    return this._connected;
  }

  async initialize(runtime: IAgentRuntime) {
    this.runtime = runtime;
    const apiKey = process.env.OPINION_API_KEY;
    if (!apiKey) {
      runtime.logger?.warn?.("Opinion WS: no API key, skipping WebSocket");
      return;
    }
    this.connect(apiKey);
  }

  private connect(apiKey: string) {
    try {
      this.ws = new WebSocket(`${WS_URL}?apikey=${apiKey}`);
      this.ws.onopen = () => {
        this._connected = true;
        this.reconnectAttempts = 0;
        this.runtime?.logger?.info?.("Opinion WS: connected");
        this.startHeartbeat();
        this.subscribeToPositionMarkets();
      };
      this.ws.onmessage = (event) => {
        try {
          const data: unknown = JSON.parse(String(event.data));
          this.handleMessage(data);
        } catch {
          /* ignore parse errors */
        }
      };
      this.ws.onclose = () => {
        this._connected = false;
        this.stopHeartbeat();
        this.scheduleReconnect(apiKey);
      };
      this.ws.onerror = () => {
        this._connected = false;
      };
    } catch (err) {
      this.runtime?.logger?.warn?.(
        `Opinion WS: connection failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: "HEARTBEAT" }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(apiKey: string) {
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;
    this.runtime?.logger?.info?.(
      `Opinion WS: reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );
    this.reconnectTimer = setTimeout(() => this.connect(apiKey), delay);
  }

  private async subscribeToPositionMarkets() {
    if (!opinionClient.isReady || !this.ws) return;
    try {
      const response = await opinionClient.getPositions();
      const positions = response?.result ?? [];
      const marketIds = new Set<number>(
        positions
          .map((p: OpinionPosition) => Number(p.marketId))
          .filter(Boolean),
      );
      for (const marketId of marketIds) {
        if (!this.subscribedMarkets.has(marketId)) {
          this.ws.send(
            JSON.stringify({
              action: "SUBSCRIBE",
              channel: "market.last.price",
              marketId,
            }),
          );
          this.subscribedMarkets.add(marketId);
        }
      }
    } catch {
      this.runtime?.logger?.warn?.(
        "Opinion WS: failed to subscribe to position markets",
      );
    }
  }

  private handleMessage(data: unknown) {
    if (typeof data !== "object" || data === null) return;
    const msg = data as WsMessageData;
    if (msg.channel === "market.last.price" && msg.data) {
      const tokenId = String(msg.data.tokenId ?? "");
      const newPrice = Number(msg.data.price ?? 0);
      const oldPrice = this.lastPrices.get(tokenId);
      if (oldPrice !== undefined && oldPrice > 0) {
        const change = Math.abs(newPrice - oldPrice) / oldPrice;
        if (change >= PRICE_ALERT_THRESHOLD) {
          const direction = newPrice > oldPrice ? "up" : "down";
          const pct = (change * 100).toFixed(1);
          this.runtime?.logger?.warn?.(
            `Opinion price alert: market ${msg.data.marketId} moved ${direction} ${pct}%`,
          );
        }
      }
      this.lastPrices.set(tokenId, newPrice);
    }
  }

  async stop(): Promise<void> {
    await this.cleanup();
  }

  async cleanup() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }
}
