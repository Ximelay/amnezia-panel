type ParseModeType = 'HTML' | 'Markdown' | 'MarkdownV2'
type ChatType = 'private' | 'group' | 'supergroup' | 'channel'

/**
 * A button that sends `callback_data` back to the bot instead of opening a link.
 *
 * Telegram caps `callback_data` at 64 bytes, which is why the bot addresses configs by
 * a short index into a freshly listed set rather than by their id.
 */
export interface InlineKeyboardButton {
    text: string;
    callback_data?: string;
    url?: string;
}

export interface InlineKeyboardMarkup {
    inline_keyboard: InlineKeyboardButton[][];
}

export interface SendMessageParams {
    chatId: string | number;
    text: string;
    parseMode?: ParseModeType;
    disableWebPagePreview?: boolean;
    disableNotification?: boolean;
    replyToMessageId?: number;
    replyMarkup?: InlineKeyboardMarkup;
}

export interface SendPhotoParams {
    chatId: string | number;
    /** Raw image bytes; the bot uploads them rather than pointing Telegram at a URL. */
    photo: Buffer;
    filename?: string;
    caption?: string;
    parseMode?: ParseModeType;
    replyMarkup?: InlineKeyboardMarkup;
}

export interface TelegramMessageResponse {
    message_id: number;
    from: {
        id: number;
        is_bot: boolean;
        first_name: string;
        username: string;
    };
    chat: {
        id: number;
        title?: string;
        type: ChatType;
        username?: string;
        first_name?: string;
    };
    date: number;
    /** Absent on messages that carry only a photo. */
    text?: string;
}

export interface TelegramUser {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
}

export interface TelegramChat {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
}

export interface TelegramBotInfo {
    id: number;
    is_bot: boolean;
    first_name: string;
    username: string;
}

export interface TelegramIncomingMessage {
    message_id: number;
    from?: TelegramUser;
    chat: TelegramChat;
    date: number;
    text?: string;
}

/**
 * Delivered when a client presses an inline button. Telegram keeps showing a spinner on
 * the button until `answerCallbackQuery` acknowledges the id, so every branch that
 * handles one has to answer it.
 */
export interface TelegramCallbackQuery {
    id: string;
    from: TelegramUser;
    message?: TelegramIncomingMessage;
    data?: string;
}

export interface TelegramUpdate {
    update_id: number;
    message?: TelegramIncomingMessage;
    callback_query?: TelegramCallbackQuery;
}

export interface WebhookInfo {
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    max_connections?: number;
    allowed_updates?: string[];
}
