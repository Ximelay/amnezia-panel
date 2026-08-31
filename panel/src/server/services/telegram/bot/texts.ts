import type { Languages } from 'prisma/generated/enums';

/**
 * Everything the bot says, in both languages the panel supports.
 *
 * Kept apart from the dispatcher so that adding a language is a change to one file, and
 * so the wording can be read without the control flow around it.
 */

/**
 * Escapes the three characters Telegram's HTML parser treats as markup.
 *
 * Every value that came from outside the codebase — a client name, a config name, a VPN
 * key — has to go through this. Without it a client called `A&B` makes the whole message
 * fail with "can't parse entities", and the client gets nothing at all.
 */
export function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface BotTexts {
    greeting: (clientName: string) => string;
    menuHint: string;
    unknownChat: string;
    clientDisabled: string;

    linkBound: (clientName: string) => string;
    linkInvalid: string;

    buttonKeys: string;
    buttonQr: string;
    buttonReissue: string;
    buttonStatus: string;
    buttonApps: string;
    buttonBack: string;
    buttonCancel: string;
    buttonConfirm: string;

    noConfigs: string;
    configGone: string;

    keysIntro: string;
    keysExpireNotice: (minutes: number) => string;

    qrPick: string;
    qrCaption: (configName: string) => string;
    qrMultipart: string;
    qrUnavailable: string;

    reissuePick: string;
    reissueDisabled: string;
    reissueConfirm: (configName: string) => string;
    reissueWorking: string;
    reissueDone: (configName: string) => string;
    reissueFailed: string;

    statusHeader: string;
    statusRow: (row: {
        name: string;
        protocol: string;
        expiry: string;
        daysLeft: number | null;
        active: boolean;
    }) => string;

    rateLimited: (retryAfter: string) => string;
    genericError: string;
    help: string;
}

/** Renders a duration as the coarse phrase a person would actually use. */
function humanizeDelay(ms: number, language: Languages): string {
    const minutes = Math.max(1, Math.ceil(ms / 60_000));

    if (minutes < 60)
        return language === 'RUSSIAN' ? `${minutes} мин.` : `${minutes} min`;

    const hours = Math.ceil(minutes / 60);
    if (hours < 24) return language === 'RUSSIAN' ? `${hours} ч.` : `${hours} h`;

    const days = Math.ceil(hours / 24);
    return language === 'RUSSIAN' ? `${days} дн.` : `${days} d`;
}

export function retryAfterPhrase(ms: number, language: Languages): string {
    return humanizeDelay(ms, language);
}

const RUSSIAN: BotTexts = {
    greeting: (clientName) =>
        `👋 Здравствуйте, <b>${escapeHtml(clientName)}</b>!\n\nЗдесь можно получить свои ключи ${escapeHtml(process.env.NEXT_PUBLIC_VPN_NAME ?? 'VPN')}, посмотреть сроки и заменить ключ, если он перестал работать.`,
    menuHint: 'Выберите действие кнопкой ниже или отправьте /menu.',
    unknownChat:
        'Этот чат не привязан ни к одному пользователю. Попросите администратора прислать вам ссылку для привязки.',
    clientDisabled:
        'Ваш доступ сейчас приостановлен. Свяжитесь с администратором, чтобы возобновить его.',

    linkBound: (clientName) =>
        `✅ Чат привязан к пользователю <b>${escapeHtml(clientName)}</b>. Теперь вы будете получать ключи сюда.`,
    linkInvalid:
        'Ссылка недействительна или уже использована. Попросите администратора выдать новую.',

    buttonKeys: '🔑 Мои ключи',
    buttonQr: '📱 QR-код',
    buttonReissue: '⚠️ Ключ не работает',
    buttonStatus: 'ℹ️ Мои подписки',
    buttonApps: '📥 Приложение',
    buttonBack: '‹ Назад',
    buttonCancel: 'Отмена',
    buttonConfirm: 'Да, заменить',

    noConfigs: 'У вас пока нет ключей. Обратитесь к администратору.',
    configGone: 'Этот ключ больше не существует. Откройте список заново.',

    keysIntro: 'Отправляю ваши ключи.',
    keysExpireNotice: (minutes) =>
        `🕒 Сообщения с ключами будут удалены из чата примерно через ${minutes} мин. Сохраните ключ в приложении сразу.`,

    qrPick: 'Для какого ключа показать QR-код?',
    qrCaption: (configName) => `QR-код для <b>${escapeHtml(configName)}</b>`,
    qrMultipart:
        'Этот конфиг слишком большой для одного QR-кода. Используйте текстовый ключ из раздела «Мои ключи» — скопируйте его и вставьте в приложении.',
    qrUnavailable: 'Не удалось построить QR-код. Воспользуйтесь текстовым ключом.',

    reissuePick: 'Какой ключ заменить?',
    reissueDisabled:
        'Самостоятельная замена ключа отключена. Напишите администратору, он заменит ключ вручную.',
    reissueConfirm: (configName) =>
        `Заменить ключ <b>${escapeHtml(configName)}</b>?\n\n⚠️ Старый ключ перестанет работать сразу. Все устройства, где он прописан, придётся настроить заново.`,
    reissueWorking: 'Создаю новый ключ, это займёт несколько секунд…',
    reissueDone: (configName) =>
        `✅ Ключ <b>${escapeHtml(configName)}</b> заменён. Новый ключ ниже — старый больше не действует.`,
    reissueFailed:
        'Не удалось заменить ключ. Старый ключ продолжает работать. Попробуйте позже или напишите администратору.',

    statusHeader: '📋 Ваши подписки:',
    statusRow: ({ name, protocol, expiry, daysLeft, active }) => {
        const mark = active ? '🟢' : '🔴';
        const left =
            daysLeft === null
                ? ''
                : daysLeft < 0
                  ? ' — истёк'
                  : daysLeft === 0
                    ? ' — истекает сегодня'
                    : ` — осталось ${daysLeft} дн.`;
        return `${mark} <b>${escapeHtml(name)}</b>\n   ${escapeHtml(protocol)} · до ${expiry}${left}`;
    },

    rateLimited: (retryAfter) =>
        `Слишком часто. Попробуйте снова через ${retryAfter}. Если ключ нужен срочно — напишите администратору.`,
    genericError: 'Что-то пошло не так. Попробуйте ещё раз или напишите администратору.',
    help: 'Доступные команды:\n/menu — меню\n/keys — прислать ключи\n/status — сроки подписок\n/apps — ссылки на приложение\n/help — эта справка',
};

const ENGLISH: BotTexts = {
    greeting: (clientName) =>
        `👋 Hello, <b>${escapeHtml(clientName)}</b>!\n\nFrom here you can get your ${escapeHtml(process.env.NEXT_PUBLIC_VPN_NAME ?? 'VPN')} keys, check expiry dates and replace a key that stopped working.`,
    menuHint: 'Pick an action below, or send /menu.',
    unknownChat:
        'This chat is not linked to any user. Ask your administrator to send you a linking link.',
    clientDisabled: 'Your access is currently suspended. Contact your administrator to restore it.',

    linkBound: (clientName) =>
        `✅ This chat is now linked to <b>${escapeHtml(clientName)}</b>. Your keys will arrive here.`,
    linkInvalid: 'This link is invalid or already used. Ask your administrator for a new one.',

    buttonKeys: '🔑 My keys',
    buttonQr: '📱 QR code',
    buttonReissue: '⚠️ Key stopped working',
    buttonStatus: 'ℹ️ My subscriptions',
    buttonApps: '📥 Get the app',
    buttonBack: '‹ Back',
    buttonCancel: 'Cancel',
    buttonConfirm: 'Yes, replace it',

    noConfigs: 'You have no keys yet. Please contact your administrator.',
    configGone: 'That key no longer exists. Open the list again.',

    keysIntro: 'Sending your keys.',
    keysExpireNotice: (minutes) =>
        `🕒 The messages with your keys will be removed from this chat in about ${minutes} min. Import the key into the app right away.`,

    qrPick: 'Which key should the QR code be for?',
    qrCaption: (configName) => `QR code for <b>${escapeHtml(configName)}</b>`,
    qrMultipart:
        'This config is too large for a single QR code. Use the text key from "My keys" instead — copy it and paste it into the app.',
    qrUnavailable: 'The QR code could not be generated. Please use the text key instead.',

    reissuePick: 'Which key should be replaced?',
    reissueDisabled:
        'Self-service key replacement is switched off. Message your administrator and they will replace it.',
    reissueConfirm: (configName) =>
        `Replace the key <b>${escapeHtml(configName)}</b>?\n\n⚠️ The old key stops working immediately. Every device using it has to be set up again.`,
    reissueWorking: 'Creating a new key, this takes a few seconds…',
    reissueDone: (configName) =>
        `✅ The key <b>${escapeHtml(configName)}</b> has been replaced. The new one is below; the old one no longer works.`,
    reissueFailed:
        'The key could not be replaced. Your old key still works. Try again later or contact your administrator.',

    statusHeader: '📋 Your subscriptions:',
    statusRow: ({ name, protocol, expiry, daysLeft, active }) => {
        const mark = active ? '🟢' : '🔴';
        const left =
            daysLeft === null
                ? ''
                : daysLeft < 0
                  ? ' — expired'
                  : daysLeft === 0
                    ? ' — expires today'
                    : ` — ${daysLeft} days left`;
        return `${mark} <b>${escapeHtml(name)}</b>\n   ${escapeHtml(protocol)} · until ${expiry}${left}`;
    },

    rateLimited: (retryAfter) =>
        `Too often. Try again in ${retryAfter}. If you need a key urgently, message your administrator.`,
    genericError: 'Something went wrong. Try again, or contact your administrator.',
    help: 'Available commands:\n/menu — the menu\n/keys — send my keys\n/status — subscription dates\n/apps — app download links\n/help — this text',
};

export function textsFor(language: Languages): BotTexts {
    return language === 'ENGLISH' ? ENGLISH : RUSSIAN;
}

/**
 * The client app download links.
 *
 * Shared with the panel's own "send download links" action so the two can never drift
 * into telling clients about different versions.
 */
export function appsMessage(language: Languages): string {
    const vpnName = escapeHtml(process.env.NEXT_PUBLIC_VPN_NAME ?? 'VPN');

    return language === 'ENGLISH'
        ? `For using <b>${vpnName}</b> you need to download the open-source AmneziaVPN app.

<b>💻 Computers & Laptops</b>
• <a href="https://github.com/amnezia-vpn/amnezia-client/releases/download/5.0.1.5/AmneziaVPN_5.0.1.5_windows_x64.exe">Windows</a>
• <a href="https://github.com/amnezia-vpn/amnezia-client/releases/download/5.0.1.5/AmneziaVPN_5.0.1.5_macos_x64.pkg">macOS</a>
• <a href="https://github.com/amnezia-vpn/amnezia-client/releases/download/5.0.1.5/AmneziaVPN_5.0.1.5_linux_x64.run">Linux</a>
• <a href="https://docs.amnezia.org/documentation/installing-app-on-linux">Linux docs</a>

<b>📱 Smartphones & Tablets</b>
• <a href="https://play.google.com/store/apps/details?id=org.amnezia.vpn">Android</a>
• <a href="https://apps.apple.com/us/app/defaultvpn/id6744725017">iPhone / iPad</a>`
        : `Для использования <b>${vpnName}</b> вам нужно скачать open-source приложение AmneziaVPN.

<b>💻 Компьютеры и ноутбуки</b>
• <a href="https://github.com/amnezia-vpn/amnezia-client/releases/download/5.0.1.5/AmneziaVPN_5.0.1.5_windows_x64.exe">Windows</a>
• <a href="https://github.com/amnezia-vpn/amnezia-client/releases/download/5.0.1.5/AmneziaVPN_5.0.1.5_macos_x64.pkg">macOS</a>
• <a href="https://github.com/amnezia-vpn/amnezia-client/releases/download/5.0.1.5/AmneziaVPN_5.0.1.5_linux_x64.run">Linux</a>
• <a href="https://docs.amnezia.org/documentation/installing-app-on-linux">Документация для Linux</a>

<b>📱 Смартфоны и планшеты</b>
• <a href="https://play.google.com/store/apps/details?id=org.amnezia.vpn">Android</a>
• <a href="https://apps.apple.com/us/app/defaultvpn/id6744725017">iPhone / iPad</a>`;
}