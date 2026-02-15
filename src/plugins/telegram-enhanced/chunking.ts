import { createRequire } from "node:module";
import { logger } from "@elizaos/core";

const TELEGRAM_MESSAGE_LIMIT = 4096;
const DEFAULT_HEADROOM = 120;

type TelegramChunkCandidate = { html?: string; text?: string };
type MarkdownChunker = (
  markdownText: string,
  maxChars?: number,
) => TelegramChunkCandidate[] | undefined;
type TelegramPluginLike = { markdownToTelegramChunks?: MarkdownChunker };

function fallbackMarkdownChunker(
  markdownText: string,
  maxChars?: number,
): TelegramChunkCandidate[] {
  const safeMax = maxChars ?? TELEGRAM_MESSAGE_LIMIT - DEFAULT_HEADROOM;
  const limit = Math.max(1, safeMax);
  const chunks: TelegramChunkCandidate[] = [];

  for (let offset = 0; offset < markdownText.length; offset += limit) {
    const end = offset + limit;
    const piece = markdownText.slice(offset, end);
    chunks.push({ html: piece, text: piece });
  }
  return chunks;
}

const markdownToTelegramChunks = (() => {
  try {
    const requireFromModule = createRequire(import.meta.url);
    const pluginModule = requireFromModule(
      "@elizaos/plugin-telegram",
    ) as TelegramPluginLike;

    const chunker = pluginModule?.markdownToTelegramChunks;
    if (typeof chunker === "function") {
      return chunker;
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error?.message ?? error?.toString?.() ?? error);
    logger.warn(
      `[milaidy] Telegram plugin load failed: ${
        errorMessage
      }; using fallback chunker`,
    );
    return fallbackMarkdownChunker;
  }
  return fallbackMarkdownChunker;
})();

export type TelegramChunk = {
  html: string;
  text: string;
};

export function smartChunkTelegramText(
  markdown: string,
  maxChars: number = TELEGRAM_MESSAGE_LIMIT - DEFAULT_HEADROOM,
): TelegramChunk[] {
  const safeText = (markdown ?? "").trim();
  if (!safeText) return [];

  const chunks = markdownToTelegramChunks(safeText, maxChars);
  if (Array.isArray(chunks) && chunks.length > 0) {
    return chunks.map((chunk: { html?: string; text?: string }) => ({
      html: chunk.html ?? "",
      text: chunk.text ?? "",
    }));
  }

  return [{ html: safeText, text: safeText }];
}
