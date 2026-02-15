/**
 * retake.tv chat poller.
 *
 * Polls the stream chat for new messages and detects first-time viewers.
 * When a new viewer sends their first message, fires a callback so the
 * plugin can greet them with animation + text.
 */

import { logger } from "@elizaos/core";
import type { RetakeClient } from "./client.js";
import type { ChatMessage, ChatPollerOptions } from "./types.js";

const TAG = "[retake-tv:chat-poller]";

export type NewViewerCallback = (viewer: ChatMessage["author"]) => void;
export type NewMessageCallback = (message: ChatMessage) => void;

export class ChatPoller {
  private readonly intervalMs: number;
  private readonly limit: number;

  private client: RetakeClient | null = null;
  private userDbId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Message IDs we've already processed. */
  private seenMessageIds = new Set<string>();
  /** Wallet addresses we've already greeted. */
  private knownViewers = new Set<string>();

  private onNewViewer: NewViewerCallback | null = null;
  private onNewMessage: NewMessageCallback | null = null;

  constructor(opts?: ChatPollerOptions) {
    this.intervalMs = opts?.intervalMs ?? 5000;
    this.limit = opts?.limit ?? 20;
  }

  /**
   * Start polling for new chat messages.
   * @param client  Initialized RetakeClient
   * @param userDbId  The agent's userDbId for fetching chat history
   * @param callbacks  Handlers for new viewers and messages
   */
  start(
    client: RetakeClient,
    userDbId: string,
    callbacks: {
      onNewViewer?: NewViewerCallback;
      onNewMessage?: NewMessageCallback;
    },
  ): void {
    if (this.timer) {
      logger.debug(`${TAG} Already polling, ignoring start()`);
      return;
    }

    this.client = client;
    this.userDbId = userDbId;
    this.onNewViewer = callbacks.onNewViewer ?? null;
    this.onNewMessage = callbacks.onNewMessage ?? null;

    logger.info(
      `${TAG} Started polling (interval: ${this.intervalMs}ms, limit: ${this.limit})`,
    );

    this.timer = setInterval(() => {
      void this.poll();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.debug(`${TAG} Stopped polling`);
    }
  }

  /** Reset known viewers (e.g. on new stream session). */
  reset(): void {
    this.seenMessageIds.clear();
    this.knownViewers.clear();
    logger.debug(`${TAG} State reset`);
  }

  get isPolling(): boolean {
    return this.timer !== null;
  }

  get viewerCount(): number {
    return this.knownViewers.size;
  }

  private async poll(): Promise<void> {
    if (!this.client || !this.userDbId) return;

    try {
      const resp = await this.client.getChatHistory(this.userDbId, {
        limit: this.limit,
      });

      const messages = resp.comments;
      if (!messages || messages.length === 0) return;

      for (const msg of messages) {
        // Skip already-processed messages
        if (this.seenMessageIds.has(msg._id)) continue;
        this.seenMessageIds.add(msg._id);

        // Fire new message callback
        if (this.onNewMessage) {
          try {
            this.onNewMessage(msg);
          } catch (err) {
            logger.warn(`${TAG} onNewMessage error: ${String(err)}`);
          }
        }

        // Detect first-time viewer
        const wallet = msg.author?.walletAddress;
        if (wallet && !this.knownViewers.has(wallet)) {
          this.knownViewers.add(wallet);

          logger.info(`${TAG} New viewer: ${msg.author.fusername ?? wallet}`);

          if (this.onNewViewer) {
            try {
              this.onNewViewer(msg.author);
            } catch (err) {
              logger.warn(`${TAG} onNewViewer error: ${String(err)}`);
            }
          }
        }
      }

      // Prune old message IDs to prevent unbounded growth
      if (this.seenMessageIds.size > 2000) {
        const ids = [...this.seenMessageIds];
        this.seenMessageIds = new Set(ids.slice(ids.length - 1000));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.debug(`${TAG} Poll failed: ${msg}`);
    }
  }
}
