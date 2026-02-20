import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiModeWsClient,
  type WsSocketFactoryOptions,
  type WsSocketLike,
} from "./ws-client";

type Listener<TArgs extends unknown[]> = (...args: TArgs) => void;

class ControlledWsSocket implements WsSocketLike {
  readyState = 0;
  sent: string[] = [];

  private openListeners: Array<Listener<[]>> = [];
  private closeListeners: Array<Listener<[]>> = [];
  private errorListeners: Array<Listener<[Error]>> = [];
  private messageListeners: Array<Listener<[unknown]>> = [];

  send(data: string): void {
    if (this.readyState !== 1) {
      throw new Error("socket not open");
    }
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    for (const listener of this.closeListeners) {
      listener();
    }
  }

  on(event: "open", listener: () => void): this;
  on(event: "close", listener: () => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "message", listener: (data: unknown) => void): this;
  on(
    event: "open" | "close" | "error" | "message",
    listener:
      | (() => void)
      | ((error: Error) => void)
      | ((data: unknown) => void),
  ): this {
    if (event === "open") this.openListeners.push(listener as () => void);
    if (event === "close") this.closeListeners.push(listener as () => void);
    if (event === "error") {
      this.errorListeners.push(listener as (error: Error) => void);
    }
    if (event === "message") {
      this.messageListeners.push(listener as (data: unknown) => void);
    }
    return this;
  }

  open(): void {
    this.readyState = 1;
    for (const listener of this.openListeners) {
      listener();
    }
  }

  emitClose(): void {
    this.readyState = 3;
    for (const listener of this.closeListeners) {
      listener();
    }
  }

  emitMessage(data: unknown): void {
    for (const listener of this.messageListeners) {
      listener(data);
    }
  }
}

describe("ApiModeWsClient", () => {
  let sockets: ControlledWsSocket[];

  const socketFactory = (
    _url: string,
    _options: WsSocketFactoryOptions,
  ): WsSocketLike => {
    const socket = new ControlledWsSocket();
    sockets.push(socket);
    return socket;
  };

  beforeEach(() => {
    sockets = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps only the newest queued active-conversation while disconnected", () => {
    const client = new ApiModeWsClient({
      apiBaseUrl: "http://localhost:3137",
      onMessage: vi.fn(),
      socketFactory,
    });

    client.setActiveConversationId("conv-1");
    client.setActiveConversationId("conv-2");

    expect(sockets).toHaveLength(1);

    sockets[0].open();

    expect(sockets[0].sent).toEqual([
      JSON.stringify({ type: "active-conversation", conversationId: "conv-2" }),
    ]);

    client.close();
  });

  it("resends the latest active conversation after reconnect", () => {
    vi.useFakeTimers();

    const client = new ApiModeWsClient({
      apiBaseUrl: "http://localhost:3137",
      onMessage: vi.fn(),
      socketFactory,
    });

    client.setActiveConversationId("conv-1");
    sockets[0].open();
    expect(sockets[0].sent).toEqual([
      JSON.stringify({ type: "active-conversation", conversationId: "conv-1" }),
    ]);

    sockets[0].emitClose();
    client.setActiveConversationId("conv-2");

    vi.advanceTimersByTime(500);

    expect(sockets).toHaveLength(2);

    sockets[1].open();

    expect(sockets[1].sent).toEqual([
      JSON.stringify({ type: "active-conversation", conversationId: "conv-2" }),
    ]);

    client.close();
  });

  it("forwards parsed inbound websocket events", () => {
    const onMessage = vi.fn();
    const client = new ApiModeWsClient({
      apiBaseUrl: "http://localhost:3137",
      onMessage,
      socketFactory,
    });

    client.connect();
    sockets[0].open();

    sockets[0].emitMessage(
      JSON.stringify({ type: "proactive-message", conversationId: "conv-1" }),
    );

    expect(onMessage).toHaveBeenCalledWith({
      type: "proactive-message",
      conversationId: "conv-1",
    });

    client.close();
  });
});
