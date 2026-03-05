import * as telegramPluginModule from "@elizaos/plugin-telegram";

const TELEGRAM_MESSAGE_LIMIT = 4096;
const DEFAULT_HEADROOM = 120;

type TelegramChunkCandidate = { html?: string; text?: string };
type MarkdownChunker = (
  markdownText: string,
  maxChars?: number,
) => TelegramChunkCandidate[] | undefined;

function fallbackMarkdownChunker(
  markdownText: string,
  maxChars?: number,
): TelegramChunkCandidate[] {
  const limit = Math.max(
    1,
    maxChars ?? TELEGRAM_MESSAGE_LIMIT - DEFAULT_HEADROOM,
  );
  const chunks: TelegramChunkCandidate[] = [];
  let remaining = markdownText;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push({ html: remaining, text: remaining });
      break;
    }

    // Split on word boundary to avoid mid-word cuts
    let splitAt = remaining.lastIndexOf(" ", limit);
    if (splitAt <= 0) {
      splitAt = remaining.lastIndexOf("\n", limit);
    }
    if (splitAt <= 0) {
      splitAt = limit;
    }

    const piece = remaining.slice(0, splitAt);
    chunks.push({ html: piece, text: piece });
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

// biome-ignore lint/suspicious/noExplicitAny: untyped external module
const pluginAny = telegramPluginModule as any;
const markdownToTelegramChunks: MarkdownChunker =
  typeof pluginAny?.markdownToTelegramChunks === "function"
    ? pluginAny.markdownToTelegramChunks
    : fallbackMarkdownChunker;

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
