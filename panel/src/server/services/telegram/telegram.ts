import type {
    SendMessageParams,
    SendPhotoParams,
    TelegramMessageResponse,
    TelegramUpdate,
} from '@/server/interfaces/telegram';
import { TRPCError, type TRPC_ERROR_CODE_KEY } from '@trpc/server';
import { logsService } from '../logs';

class TelegramService {
    private readonly baseUrl: string;
    private readonly maxRetries = 3;
    private readonly retryDelay = 1000;

    constructor() {
        this.baseUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
    }

    private getFetchOptions(method: string = 'POST'): RequestInit {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'User-Agent': 'TelegramBotClient/1.0',
        };

        return {
            method,
            headers,
        };
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private getTrpcErrorCodeFromTelegram(
        description: string,
        errorCode?: number
    ): TRPC_ERROR_CODE_KEY {
        if (errorCode === 403) {
            return 'FORBIDDEN';
        }

        if (errorCode === 400) {
            if (
                description.includes('chat not found') ||
                description.includes('user not found') ||
                description.includes('PEER_ID_INVALID')
            ) {
                return 'NOT_FOUND';
            }
            return 'BAD_REQUEST';
        }

        if (description.includes('Too Many Requests')) {
            return 'TOO_MANY_REQUESTS';
        }

        return 'INTERNAL_SERVER_ERROR';
    }

    /**
     * Refuses before any network call when the integration is not configured, so a
     * missing token reads as "you have not set this up" rather than as a Telegram error.
     */
    private assertConfigured(): void {
        if (process.env.NEXT_PUBLIC_USES_TELEGRAM_BOT !== 'true')
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message:
                    'Telegram is disabled. Set NEXT_PUBLIC_USES_TELEGRAM_BOT="true" in .env and restart the app',
            });

        if (!process.env.TELEGRAM_BOT_TOKEN)
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'TELEGRAM_BOT_TOKEN is not set in .env',
            });
    }

    /** Turns a `{ ok: false }` body into the TRPCError the callers match on. */
    private unwrap<T>(data: any): T {
        if (data.ok) return data.result as T;

        const errorCode = data.error_code || 500;
        const description = data.description || 'Unknown Telegram error';

        const trpcErrorCode = this.getTrpcErrorCodeFromTelegram(description, errorCode);

        let userMessage = description;

        if (errorCode === 403) {
            userMessage = 'Bot was blocked by the user or user is deactivated';
        } else if (errorCode === 400) {
            if (
                description.includes('chat not found') ||
                description.includes('user not found') ||
                description.includes('PEER_ID_INVALID')
            ) {
                userMessage = 'User has not started the bot or chat not found';
            }
        }

        throw new TRPCError({ code: trpcErrorCode, message: userMessage });
    }

    private async makeRequestWithRetry<T>(
        endpoint: string,
        options: RequestInit,
        body?: any,
        /**
         * Long polling holds the connection open on purpose, so the caller has to be able
         * to lift the timeout that guards every other call from a hung socket.
         */
        timeoutMs = 30_000
    ): Promise<T> {
        this.assertConfigured();

        const url = `${this.baseUrl}/${endpoint}`;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const fetchOptions: RequestInit = {
                    ...options,
                    body: body ? JSON.stringify(body) : undefined,
                    signal: AbortSignal.timeout(timeoutMs),
                };

                const response = await fetch(url, fetchOptions);
                const data = await response.json();

                return this.unwrap<T>(data);
            } catch (error) {
                if (error instanceof TRPCError) {
                    throw error;
                }

                if (attempt === this.maxRetries) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: `Telegram API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    });
                }

                await this.sleep(this.retryDelay * attempt);
            }
        }

        throw new TRPCError({
            code: 'TIMEOUT',
            message: 'Telegram API request failed after maximum retries',
        });
    }

    /**
     * Uploads binary content. Separate from the JSON path because Telegram only accepts a
     * file the bot holds in memory as multipart/form-data, and `fetch` has to set the
     * boundary itself — hence no Content-Type header here.
     */
    private async makeFormRequestWithRetry<T>(endpoint: string, form: FormData): Promise<T> {
        this.assertConfigured();

        const url = `${this.baseUrl}/${endpoint}`;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'User-Agent': 'TelegramBotClient/1.0' },
                    body: form,
                    signal: AbortSignal.timeout(30_000),
                });
                const data = await response.json();

                return this.unwrap<T>(data);
            } catch (error) {
                if (error instanceof TRPCError) throw error;

                if (attempt === this.maxRetries) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: `Telegram API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    });
                }

                await this.sleep(this.retryDelay * attempt);
            }
        }

        throw new TRPCError({
            code: 'TIMEOUT',
            message: 'Telegram API request failed after maximum retries',
        });
    }

    async sendMessage(params: SendMessageParams, clientName: string): Promise<TelegramMessageResponse> {
        try {
            return await this.makeRequestWithRetry<TelegramMessageResponse>(
                'sendMessage',
                this.getFetchOptions(),
                {
                    chat_id: params.chatId,
                    text: params.text,
                    parse_mode: params.parseMode || 'HTML',
                    disable_web_page_preview: params.disableWebPagePreview || false,
                    disable_notification: params.disableNotification || false,
                    reply_to_message_id: params.replyToMessageId,
                    reply_markup: params.replyMarkup,
                }
            );
        } catch (error) {
            await logsService.createLog(
                'TELEGRAM',
                'ERROR',
                `Failed to send Telegram message for client ${clientName}: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
            );

            if (error instanceof TRPCError) {
                throw error;
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to send Telegram message for client ${clientName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }

    /**
     * Sends an image the bot generated itself, such as a config QR code.
     *
     * Logged like `sendMessage` and for the same reason: the caller only sees the mapped
     * message, while the log keeps Telegram's own description of what went wrong.
     */
    async sendPhoto(params: SendPhotoParams, clientName: string): Promise<TelegramMessageResponse> {
        try {
            const form = new FormData();
            form.append('chat_id', String(params.chatId));
            form.append(
                'photo',
                new Blob([new Uint8Array(params.photo)], { type: 'image/png' }),
                params.filename ?? 'qr.png'
            );
            if (params.caption) form.append('caption', params.caption);
            if (params.parseMode) form.append('parse_mode', params.parseMode);
            if (params.replyMarkup) form.append('reply_markup', JSON.stringify(params.replyMarkup));

            return await this.makeFormRequestWithRetry<TelegramMessageResponse>('sendPhoto', form);
        } catch (error) {
            await logsService.createLog(
                'TELEGRAM',
                'ERROR',
                `Failed to send photo for client ${clientName}: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
            );

            if (error instanceof TRPCError) throw error;

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to send photo for client ${clientName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }

    /**
     * Clears the loading spinner Telegram shows on a pressed inline button, optionally
     * with a toast on the client's screen.
     *
     * Never throws: the work the button asked for has already happened by the time this
     * runs, and a failed acknowledgement is cosmetic. A callback id is also only valid
     * for a short window, so a replayed update legitimately fails here.
     */
    async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
        try {
            await this.makeRequestWithRetry('answerCallbackQuery', this.getFetchOptions(), {
                callback_query_id: callbackQueryId,
                text,
            });
        } catch {
            // Deliberately swallowed, see above.
        }
    }

    /**
     * Drops the buttons off a message the bot already sent, so a one-shot choice cannot
     * be pressed twice. Best effort for the same reason as `answerCallbackQuery`.
     */
    async clearReplyMarkup(chatId: string | number, messageId: number): Promise<void> {
        try {
            await this.makeRequestWithRetry('editMessageReplyMarkup', this.getFetchOptions(), {
                chat_id: chatId,
                message_id: messageId,
            });
        } catch {
            // Deliberately swallowed, see above.
        }
    }

    async sendDocument(params: {
        chatId: string | number;
        document: string | File;
        caption?: string;
        parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
        disableNotification?: boolean;
        replyToMessageId?: number;
    }, clientName: string): Promise<any> {
        try {
            return await this.makeRequestWithRetry('sendDocument', this.getFetchOptions(), {
                chat_id: params.chatId,
                document: params.document,
                caption: params.caption,
                parse_mode: params.parseMode,
                disable_notification: params.disableNotification,
                reply_to_message_id: params.replyToMessageId,
            });
        } catch (error) {
            await logsService.createLog(
                'TELEGRAM',
                'ERROR',
                `Failed to send document for client ${clientName}: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
            );

            if (error instanceof TRPCError) {
                throw error;
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to send document for client ${clientName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }

    /**
     * Removes a single message from the chat.
     *
     * Unlike the other methods this one never throws: a message that cannot be deleted is
     * a fact about the chat, not a failure of the caller, and the two interesting cases
     * ("already gone", "past the 48-hour window") are indistinguishable from success as
     * far as the caller cares — in both the key is no longer worth chasing.
     *
     * Returns whether the message is definitely no longer in the chat. `false` means the
     * attempt failed for a transient reason and is worth repeating.
     */
    async deleteMessage(chatId: string | number, messageId: number): Promise<boolean> {
        try {
            await this.makeRequestWithRetry('deleteMessage', this.getFetchOptions(), {
                chat_id: chatId,
                message_id: messageId,
            });
            return true;
        } catch (error) {
            return this.isTerminalDeleteError(error);
        }
    }

    /**
     * Same as `deleteMessage` for up to 100 messages of one chat in a single call.
     * Telegram skips ids it cannot find, so a partially stale batch still succeeds.
     */
    async deleteMessages(chatId: string | number, messageIds: number[]): Promise<boolean> {
        if (messageIds.length === 0) return true;

        try {
            await this.makeRequestWithRetry('deleteMessages', this.getFetchOptions(), {
                chat_id: chatId,
                message_ids: messageIds.slice(0, 100),
            });
            return true;
        } catch (error) {
            return this.isTerminalDeleteError(error);
        }
    }

    /**
     * Distinguishes "Telegram will never delete this" from "try again later". Only the
     * former lets the caller stop tracking the message.
     */
    private isTerminalDeleteError(error: unknown): boolean {
        const description = error instanceof Error ? error.message.toLowerCase() : '';

        return (
            description.includes('message to delete not found') ||
            description.includes("message can't be deleted") ||
            description.includes('message identifier is not specified') ||
            // The chat itself is unreachable: blocked bot, deleted account, wrong id.
            description.includes('chat not found') ||
            description.includes('bot was blocked') ||
            description.includes('user is deactivated')
        );
    }

    /**
     * Fetches pending updates.
     *
     * `offset` is what makes an update disappear from the queue: Telegram holds every
     * update for 24 hours until a poll asks for a higher id. Passing it is therefore
     * only safe for the single consumer that also handles what it fetches — the bot
     * poller. Everything else must read without an offset, or it will consume updates
     * the poller has not seen yet.
     *
     * `timeoutSeconds` turns the call into a long poll: Telegram holds the connection
     * open until something arrives, which is what keeps the bot's replies prompt without
     * a permanently running process.
     */
    async getUpdates(params?: {
        offset?: number;
        timeoutSeconds?: number;
    }): Promise<TelegramUpdate[]> {
        const timeoutSeconds = params?.timeoutSeconds ?? 0;

        try {
            return await this.makeRequestWithRetry<TelegramUpdate[]>(
                'getUpdates',
                this.getFetchOptions(),
                {
                    offset: params?.offset,
                    timeout: timeoutSeconds,
                    allowed_updates: ['message', 'callback_query'],
                },
                // Telegram answers a long poll a moment after its own deadline; the extra
                // ten seconds keep the client from aborting a call that is about to return.
                (timeoutSeconds + 10) * 1000
            );
        } catch (error) {
            await logsService.createLog(
                'TELEGRAM',
                'ERROR',
                `Failed to get updates: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
            );

            if (error instanceof TRPCError) {
                throw error;
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to get updates: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }

    /**
     * Publishes the command list Telegram offers when someone types "/".
     *
     * `languageCode` selects which of the client's Telegram interface languages the list
     * applies to; omitting it sets the fallback used for every language without its own
     * list. Telegram stores this per bot, not per chat, so this is a rare write — see the
     * fingerprint in the bot's `syncCommands`.
     */
    async setMyCommands(
        commands: { command: string; description: string }[],
        languageCode?: string
    ): Promise<void> {
        await this.makeRequestWithRetry('setMyCommands', this.getFetchOptions(), {
            commands,
            language_code: languageCode,
        });
    }

    async getMe(): Promise<any> {
        try {
            return await this.makeRequestWithRetry('getMe', this.getFetchOptions('GET'));
        } catch (error) {
            await logsService.createLog(
                'TELEGRAM',
                'ERROR',
                `Failed to get bot info: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
            );

            if (error instanceof TRPCError) {
                throw error;
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to get bot info: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }
}

export const telegramService = new TelegramService();
