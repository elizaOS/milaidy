/**
 * Type definitions for the retake.tv streaming API.
 *
 * @see https://retake.tv/skill.md
 */

// ---------------------------------------------------------------------------
// Credentials & Registration
// ---------------------------------------------------------------------------

export type RetakeCredentials = {
  access_token: string;
  agent_id: string;
  userDbId: string;
  wallet_address: string;
  token_address: string;
  token_ticker: string;
};

export type RegisterAgentRequest = {
  agent_name: string;
  agent_description: string;
  image_url?: string;
  wallet_address: string;
};

// ---------------------------------------------------------------------------
// RTMP / Stream
// ---------------------------------------------------------------------------

export type RtmpCredentials = {
  url: string;
  key: string;
};

export type StreamStartResponse = {
  success: boolean;
  token: {
    name: string;
    ticker: string;
    imageUrl: string;
    tokenAddress: string;
    tokenType: string;
  };
};

export type StreamStatus = {
  is_live: boolean;
  viewers: number;
  uptime_seconds: number;
  token_address: string;
  userDbId: string;
};

export type StreamStopResponse = {
  status: string;
  duration_seconds: number;
  viewers: number;
};

export type ThumbnailResponse = {
  message: string;
  thumbnail_url: string;
};

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export type ChatMessage = {
  _id: string;
  streamId: string;
  text: string;
  timestamp: string;
  author: {
    walletAddress: string;
    fusername: string;
    fid: number;
    favatar: string;
  };
};

export type ChatSendRequest = {
  message: string;
  destination_user_id: string;
};

export type ChatHistoryResponse = {
  comments: ChatMessage[];
};

// ---------------------------------------------------------------------------
// Public Discovery
// ---------------------------------------------------------------------------

export type LiveStreamer = {
  userDbId: string;
  username: string;
  is_live: boolean;
  viewers: number;
  token_address: string;
  [key: string]: unknown;
};

export type TokenStats = {
  name: string;
  ticker: string;
  tokenAddress: string;
  marketCap: number;
  [key: string]: unknown;
};

export type TradeEntry = {
  tokenAddress: string;
  type: string;
  amount: number;
  timestamp: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Plugin Options
// ---------------------------------------------------------------------------

export type ChatPollerOptions = {
  /** Poll interval in ms. Default: 5000 */
  intervalMs?: number;
  /** Max messages per poll. Default: 20 */
  limit?: number;
};

export type RetakePluginOptions = {
  /** Pre-loaded credentials. If omitted, plugin reads from credentials file. */
  credentials?: RetakeCredentials;
  /** API base URL. Default: https://retake.tv/api/v1 */
  baseUrl?: string;
  /** Request timeout in ms. Default: 10000 */
  timeoutMs?: number;
  /** Stream manager options for FFmpeg/Xvfb pipeline. */
  stream?: StreamManagerOptions;
  /** Chat poller options for viewer detection. */
  chatPoller?: ChatPollerOptions;
};

// ---------------------------------------------------------------------------
// Stream Manager Options
// ---------------------------------------------------------------------------

export type StreamManagerOptions = {
  /** Virtual display number. Default: 99 */
  display?: number;
  /** Resolution width. Default: 1280 */
  width?: number;
  /** Resolution height. Default: 720 */
  height?: number;
  /** Framerate. Default: 30 */
  framerate?: number;
  /** Video bitrate (e.g. "1500k"). Default: "1500k" */
  videoBitrate?: string;
  /** Audio bitrate (e.g. "128k"). Default: "128k" */
  audioBitrate?: string;
  /** x264 preset. Default: "veryfast" */
  preset?: string;
  /** Watchdog check interval in ms. 0 to disable. Default: 15000 */
  watchdogIntervalMs?: number;
  /** Path for temporary thumbnail captures. Default: "/tmp/retake-thumbnail.png" */
  thumbnailPath?: string;
};
