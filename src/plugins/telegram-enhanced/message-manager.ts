import { logger } from "@elizaos/core";
// @ts-expect-error - plugin package currently ships without type declarations
import { MessageManager } from "@elizaos/plugin-telegram";
import { Markup } from "telegraf";
import { smartChunkTelegramText } from "./chunking.js";
import { DraftStreamer, simulateSentenceStream } from "./draft-stream.js";

const TYPING_INTERVAL_MS = 4000;
const SIMULATED_STREAM_DELAY_MS = 200;
const RECEIPT_REACTIONS = ["👀", "⏳"] as const;

/** Minimal shape for a Telegram inline button. */
interface TelegramButton {
  text: string;
  url: string;
  kind?: string;
}

function toTelegramButtons(buttons: TelegramButton[] | undefined) {
  if (!Array.isArray(buttons)) return [];

  const rows: (
    | ReturnType<typeof Markup.button.url>
    | ReturnType<typeof Markup.button.login>
  )[] = [];
  for (const button of buttons) {
    if (!button || !button.text || !button.url) continue;

    if (button.kind === "login") {
      rows.push(Markup.button.login(button.text, button.url));
      continue;
    }

    rows.push(Markup.button.url(button.text, button.url));
  }

  return rows;
}

/** Minimal Telegram context shape for message handling. */
interface TelegramContext {
  chat?: { id: number };
  from?: Record<string, unknown>;
  message?: { message_id?: number };
  telegram: {
    sendMessage: (
      chatId: number,
      text: string,
      extra?: Record<string, unknown>,
    ) => Promise<object | boolean | null | undefined>;
    editMessageText?: (
      chatId: number,
      messageId: number,
      inlineMessageId: undefined,
      text: string,
      extra?: Record<string, unknown>,
    ) => Promise<object | boolean | null | undefined>;
    setMessageReaction?: (
      chatId: number,
      messageId: number,
      reactions: Array<{ type: string; emoji: string }>,
    ) => Promise<object | boolean | null | undefined>;
    sendChatAction: (
      chatId: number,
      action: string,
    ) => Promise<object | boolean | null | undefined>;
  };
}

/** Minimal content shape for message sending. */
interface MessageContent {
  text?: string;
  attachments?: unknown[];
  buttons?: TelegramButton[];
}

export class EnhancedTelegramMessageManager extends MessageManager {
  async sendMessageInChunks(
    ctx: TelegramContext,
    content: MessageContent,
    replyToMessageId?: number,
  ) {
    if (content?.attachments?.length) {
      return super.sendMessageInChunks(ctx, content, replyToMessageId);
    }

    const finalText = content?.text ?? "";
    const chunks = smartChunkTelegramText(finalText);
    if (!ctx?.chat || chunks.length === 0) {
      return [];
    }

    const telegramButtons = toTelegramButtons(content?.buttons);
    const finalReplyMarkup = telegramButtons.length
      ? Markup.inlineKeyboard(telegramButtons)
      : undefined;

    if (typeof ctx.telegram.editMessageText !== "function") {
      const sentMessages: Array<object | boolean | null | undefined> = [];
      for (let i = 0; i < chunks.length; i += 1) {
        const sent = await ctx.telegram.sendMessage(
          ctx.chat.id,
          chunks[i].html,
          {
            parse_mode: "HTML",
            reply_parameters:
              i === 0 && replyToMessageId
                ? { message_id: replyToMessageId }
                : undefined,
            ...(i === 0 && finalReplyMarkup ? finalReplyMarkup : {}),
          },
        );
        sentMessages.push(sent);
      }
      return sentMessages;
    }

    const streamer = new DraftStreamer({
      chatId: ctx.chat.id,
      telegram: {
        sendMessage: ctx.telegram.sendMessage,
        editMessageText: ctx.telegram.editMessageText,
      },
      replyToMessageId,
    });

    try {
      await simulateSentenceStream(
        finalText,
        (partialText) => {
          streamer.update(partialText);
        },
        SIMULATED_STREAM_DELAY_MS,
      );

      return await streamer.finalize(finalText, {
        ...(finalReplyMarkup ?? {}),
      });
    } finally {
      streamer.stop();
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: Telegram context type from untyped external library
  async handleMessage(ctx: any) {
    if (!ctx?.message || !ctx?.from || !ctx?.chat) {
      return;
    }

    const chatId = ctx.chat.id;
    const reactionEmoji =
      RECEIPT_REACTIONS[Math.floor(Math.random() * RECEIPT_REACTIONS.length)];

    try {
      if (
        ctx.message?.message_id &&
        typeof ctx.telegram?.setMessageReaction === "function"
      ) {
        await ctx.telegram.setMessageReaction(chatId, ctx.message.message_id, [
          { type: "emoji", emoji: reactionEmoji },
        ]);
      }
    } catch (err) {
      logger.debug(
        `[telegram-enhanced] Reaction failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    let stopped = false;
    const sendTyping = async () => {
      if (stopped) return;
      try {
        await ctx.telegram.sendChatAction(chatId, "typing");
      } catch (err) {
        logger.debug(
          `[telegram-enhanced] Typing indicator failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    };

    await sendTyping();
    const interval = setInterval(() => {
      void sendTyping();
    }, TYPING_INTERVAL_MS);

    try {
      await super.handleMessage(ctx);
    } catch (error) {
      logger.error(
        { error },
        "[telegram-enhanced] Failed to handle telegram message",
      );

      const fallbackText =
        "Sorry — I hit an error while generating that response. Please try again in a moment.";

      try {
        await ctx.telegram.sendMessage(chatId, fallbackText, {
          reply_parameters: ctx.message?.message_id
            ? { message_id: ctx.message.message_id }
            : undefined,
        });
      } catch (sendErr) {
        logger.error(
          `[telegram-enhanced] Failed to send fallback message: ${sendErr instanceof Error ? sendErr.message : sendErr}`,
        );
      }
    } finally {
      stopped = true;
      clearInterval(interval);
    }
  }
}
