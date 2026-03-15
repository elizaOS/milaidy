/**
 * HTTP Utilities
 *
 * Request body parsing and response helpers for the cloud agent's
 * HTTP servers. Extracted from milaidy's src/api/http-helpers.ts.
 */

import type * as http from "node:http";

// ─── Constants ──────────────────────────────────────────────────────────

/** Default maximum request body size: 1 MB. */
export const DEFAULT_MAX_BODY_BYTES = 1_048_576;

// ─── Request Body Options ───────────────────────────────────────────────

export interface RequestBodyOptions {
  /** Maximum accepted body size in bytes. */
  maxBytes?: number;
  /** String encoding for text conversion. */
  encoding?: BufferEncoding;
  /** Error message when body exceeds maxBytes. */
  tooLargeMessage?: string;
  /** Resolve to null instead of rejecting on read failure. */
  returnNullOnError?: boolean;
  /** Resolve to null instead of rejecting on size limit. */
  returnNullOnTooLarge?: boolean;
  /** Destroy the request stream when size limit is exceeded. */
  destroyOnTooLarge?: boolean;
}

// ─── Read Request Body (Buffer) ─────────────────────────────────────────

/**
 * Read the full request body into a Buffer, with size limiting.
 */
export async function readRequestBodyBuffer(
  req: http.IncomingMessage,
  options: RequestBodyOptions = {},
): Promise<Buffer | null> {
  const {
    maxBytes = DEFAULT_MAX_BODY_BYTES,
    returnNullOnError = false,
    returnNullOnTooLarge = false,
    destroyOnTooLarge = false,
    tooLargeMessage,
  } = options;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let tooLarge = false;
    let settled = false;

    const message =
      tooLargeMessage ??
      `Request body exceeds maximum size (${maxBytes} bytes)`;

    const cleanup = (): void => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
    };

    const settle = (value: Buffer | null): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const onData = (chunk: Buffer) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        tooLarge = true;
        if (returnNullOnTooLarge) {
          if (destroyOnTooLarge) req.destroy();
          settle(null);
          return;
        }
        if (destroyOnTooLarge) {
          req.destroy();
          fail(new Error(message));
          return;
        }
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      if (settled) return;
      if (tooLarge) {
        if (returnNullOnTooLarge) {
          settle(null);
          return;
        }
        fail(new Error(message));
        return;
      }
      settle(Buffer.concat(chunks));
    };

    const onError = (err: Error) => {
      if (returnNullOnError) {
        settle(null);
        return;
      }
      fail(err);
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

// ─── Read Request Body (String) ─────────────────────────────────────────

/**
 * Read the full request body as a string.
 */
export async function readRequestBody(
  req: http.IncomingMessage,
  options: RequestBodyOptions = {},
): Promise<string> {
  const { encoding = "utf-8", ...rawOptions } = options;
  const body = await readRequestBodyBuffer(req, rawOptions);
  if (body === null) return "";
  return body.toString(encoding);
}

// ─── Response Helpers ───────────────────────────────────────────────────

/**
 * Write a JSON response with the given status code.
 */
export function writeJson(
  res: http.ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Write a HEAD-only response (no body).
 */
export function writeHeadOnly(
  res: http.ServerResponse,
  statusCode: number,
  headers: Record<string, string>,
): void {
  res.writeHead(statusCode, headers);
  res.end();
}

/**
 * Check if the request is a HEAD request.
 */
export function isHeadRequest(req: http.IncomingMessage): boolean {
  return req.method === "HEAD";
}

/**
 * Read and parse a JSON request body, writing an error response on failure.
 * Returns null if parsing fails (error already sent to client).
 */
export async function readJsonBody<T>(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<T | null> {
  const body = await readRequestBody(req);
  if (!body.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Invalid JSON body";
    writeJson(res, 400, { error: `Invalid JSON body: ${message}` });
    return null;
  }
}
