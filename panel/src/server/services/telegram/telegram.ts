import type {
    SendMessageParams,
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

    private async makeRequestWithRetry<T>(
        endpoint: string,
        options: RequestInit,
        body?: any
    ): Promise<T> {
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

        const url = `${this.baseUrl}/${endpoint}`;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const fetchOptions: RequestInit = {
                    ...options,
                    body: body ? JSON.stringify(body) : undefined,
                };

                const response = await fetch(url, fetchOptions);
                const data = await response.json();

                if (!data.ok) {
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

                    throw new TRPCError({
                        code: trpcErrorCode,
                        message: userMessage,
                    });
                }

                return data.result as T;
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
     * Polled on demand rather than from a long-running bot process.
     *
     * Offsets are deliberately never confirmed: Telegram keeps unconfirmed updates for
     * 24 hours, and several clients may have a pending deep link at the same time, so
     * consuming them here would make one lookup hide another.
     */
    async getUpdates(): Promise<TelegramUpdate[]> {
        try {
            return await this.makeRequestWithRetry<TelegramUpdate[]>(
                'getUpdates',
                this.getFetchOptions(),
                { timeout: 0, allowed_updates: ['message'] }
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
