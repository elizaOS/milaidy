import process from "node:process";
import { WebSocket } from "ws";

const WS_OPEN = 1;
const WS_CONNECTING = 0;
const WS_CLOSED = 3;

export interface WsSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  on(event: "open", listener: () => void): this;
  on(event: "close", listener: () => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "message", listener: (data: unknown) => void): this;
}

export interface WsSocketFactoryOptions {
  headers: Record<string, string>;
}

export type WsSocketFactory = (
  url: string,
  options: WsSocketFactoryOptions,
) => WsSocketLike;

export interface ApiModeWsClientOptions {
  apiBaseUrl: string;
  onMessage: (data: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
  getAuthToken?: () => string | null;
  queueLimit?: number;
  reconnectInitialDelayMs?: number;
  reconnectMaxDelayMs?: number;
  socketFactory?: WsSocketFactory;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

function defaultSocketFactory(
  url: string,
  options: WsSocketFactoryOptions,
): WsSocketLike {
  return new WebSocket(url, { headers: options.headers }) as WsSocketLike;
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function decodeWsMessage(data: unknown): string {
  if (typeof data === "string") return data;

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
      "utf8",
    );
  }

  if (Array.isArray(data)) {
    const buffers = data.map((part) => {
      if (typeof part === "string") return Buffer.from(part, "utf8");
      if (part instanceof ArrayBuffer) return Buffer.from(part);
      if (ArrayBuffer.isView(part)) {
        return Buffer.from(part.buffer, part.byteOffset, part.byteLength);
      }
      return Buffer.from(String(part), "utf8");
    });
    return Buffer.concat(buffers).toString("utf8");
  }

  return String(data);
}

export class ApiModeWsClient {
  private ws: WsSocketLike | null = null;
  private wsSendQueue: string[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs: number;
  private closed = false;

  private latestActiveConversationId: string | null = null;
  private lastSentActiveConversationId: string | null = null;

  private readonly queueLimit: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly wsUrl: string;
  private readonly socketFactory: WsSocketFactory;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;

  constructor(private readonly options: ApiModeWsClientOptions) {
    this.queueLimit = Math.max(1, options.queueLimit ?? 32);
    this.backoffMs = options.reconnectInitialDelayMs ?? 500;
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 10_000;

    this.wsUrl = this.buildWsUrl(options.apiBaseUrl);
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  }

  connect(): void {
    if (this.closed) return;

    if (
      this.ws &&
      (this.ws.readyState === WS_OPEN || this.ws.readyState === WS_CONNECTING)
    ) {
      return;
    }

    const token = this.getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      this.ws = this.socketFactory(this.wsUrl, { headers });
    } catch (error) {
      const rootCause = normalizeError(error);
      if (token) {
        this.handleError(
          new Error(
            `Failed to connect websocket with Authorization header. ` +
              `When MILADY_API_TOKEN is set, TUI websocket auth requires header-capable websocket support. ` +
              `Root cause: ${rootCause.message}`,
          ),
        );
      } else {
        this.handleError(rootCause);
      }
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      this.backoffMs = this.options.reconnectInitialDelayMs ?? 500;
      this.flushSendQueue();
      this.syncActiveConversation();
    });

    this.ws.on("message", (data) => {
      this.handleIncomingMessage(data);
    });

    this.ws.on("close", () => {
      this.ws = null;
      this.lastSentActiveConversationId = null;
      this.scheduleReconnect();
    });

    this.ws.on("error", (error) => {
      this.handleError(error);
    });
  }

  close(): void {
    this.closed = true;

    if (this.reconnectTimer) {
      this.clearTimeoutFn(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.ws?.close();
    this.ws = null;
  }

  sendMessage(data: Record<string, unknown>): void {
    const payload = JSON.stringify(data);
    if (this.ws?.readyState === WS_OPEN) {
      try {
        this.ws.send(payload);
        this.noteSentActiveConversation(data);
        return;
      } catch {
        // Fall through to queueing + reconnect.
      }
    }

    this.queuePayload(payload, data);

    if (!this.ws || this.ws.readyState === WS_CLOSED) {
      this.connect();
    }
  }

  setActiveConversationId(conversationId: string | null): void {
    const normalized = conversationId?.trim() || null;
    this.latestActiveConversationId = normalized;

    if (!normalized) {
      this.wsSendQueue = this.wsSendQueue.filter((queued) => {
        try {
          const parsed = JSON.parse(queued) as { type?: unknown };
          return parsed.type !== "active-conversation";
        } catch {
          return true;
        }
      });
      this.lastSentActiveConversationId = null;
      return;
    }

    this.sendMessage({
      type: "active-conversation",
      conversationId: normalized,
    });
  }

  private buildWsUrl(apiBaseUrl: string): string {
    const base = new URL(apiBaseUrl);
    const wsUrl = new URL("/ws", base);
    wsUrl.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    wsUrl.search = "";
    wsUrl.hash = "";
    return wsUrl.toString();
  }

  private getAuthToken(): string | null {
    const explicit = this.options.getAuthToken?.()?.trim();
    if (explicit) return explicit;

    const envToken = process.env.MILADY_API_TOKEN?.trim();
    return envToken || null;
  }

  private flushSendQueue(): void {
    if (
      !this.ws ||
      this.ws.readyState !== WS_OPEN ||
      this.wsSendQueue.length < 1
    ) {
      return;
    }

    const pending = this.wsSendQueue;
    this.wsSendQueue = [];

    for (let i = 0; i < pending.length; i++) {
      if (!this.ws || this.ws.readyState !== WS_OPEN) {
        this.wsSendQueue = pending.slice(i).concat(this.wsSendQueue);
        break;
      }

      const payload = pending[i];
      try {
        this.ws.send(payload);
        this.noteSentActiveConversationFromPayload(payload);
      } catch {
        this.wsSendQueue = pending.slice(i).concat(this.wsSendQueue);
        break;
      }
    }
  }

  private syncActiveConversation(): void {
    if (!this.latestActiveConversationId) return;
    if (this.lastSentActiveConversationId === this.latestActiveConversationId) {
      return;
    }

    this.sendMessage({
      type: "active-conversation",
      conversationId: this.latestActiveConversationId,
    });
  }

  private queuePayload(payload: string, data: Record<string, unknown>): void {
    if (data.type === "active-conversation") {
      this.wsSendQueue = this.wsSendQueue.filter((queued) => {
        try {
          const parsed = JSON.parse(queued) as { type?: unknown };
          return parsed.type !== "active-conversation";
        } catch {
          return true;
        }
      });
    }

    if (this.wsSendQueue.length >= this.queueLimit) {
      this.wsSendQueue.shift();
    }

    this.wsSendQueue.push(payload);
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;

    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoffMs);

    this.backoffMs = Math.min(this.backoffMs * 1.5, this.reconnectMaxDelayMs);
  }

  private handleIncomingMessage(rawData: unknown): void {
    const encoded = decodeWsMessage(rawData);

    let parsed: unknown;
    try {
      parsed = JSON.parse(encoded);
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return;
    }

    this.options.onMessage(parsed as Record<string, unknown>);
  }

  private handleError(error: unknown): void {
    this.options.onError?.(normalizeError(error));
  }

  private noteSentActiveConversation(data: Record<string, unknown>): void {
    if (data.type !== "active-conversation") return;

    const id =
      typeof data.conversationId === "string" ? data.conversationId.trim() : "";

    this.lastSentActiveConversationId = id || null;
  }

  private noteSentActiveConversationFromPayload(payload: string): void {
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      this.noteSentActiveConversation(parsed);
    } catch {
      // Ignore malformed queued payloads.
    }
  }
}
