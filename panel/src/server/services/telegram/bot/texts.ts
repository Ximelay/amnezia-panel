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

/**
 * The administrator clients should message when the bot cannot help them.
 *
 * Read from the environment rather than hard-coded: this panel is a fork others run, and
 * a handle baked into the source would send their clients to the wrong person. Returns
 * null when unset, and every use is written so the text still reads correctly without it.
 */
export function adminContact(): { handle: string; url: string } | null {
    const raw = process.env.TELEGRAM_ADMIN_CONTACT?.trim();
    if (!raw) return null;

    // Accepts "@name", "name" or a full t.me link, so a copied handle works either way.
    const handle = raw
        .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
        .replace(/^@/, '')
        .trim();

    if (!/^[A-Za-z0-9_]{4,32}$/.test(handle)) return null;

    return { handle: `@${handle}`, url: `https://t.me/${handle}` };
}

export interface BotCommand {
    command: string;
    description: string;
}

interface BotTexts {
    welcome: (clientName: string) => string;
    greeting: (clientName: string) => string;
    menuHint: string;
    buttonAdmin: string;
    commands: BotCommand[];
    unknownChat: string;
    ambiguousChat: string;
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
    configDisabled: string;
    noActiveConfigs: string;
    someConfigsDisabled: (count: number) => string;

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
    helpHeader: string;
    helpAdmin: (handle: string) => string;
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
    welcome: (clientName) => {
        const admin = adminContact();

        return `👋 Здравствуйте, <b>${escapeHtml(clientName)}</b>!

Это бот <b>${escapeHtml(process.env.NEXT_PUBLIC_VPN_NAME ?? 'VPN')}</b>. Через него вы сами, не дожидаясь администратора, можете:

🔑 <b>Получить свои ключи</b> — текстом, чтобы вставить в приложение AmneziaVPN.
📱 <b>Получить QR-код</b> — удобнее, если настраиваете телефон.
ℹ️ <b>Посмотреть сроки</b> — до какого числа работает каждый ключ.
⚠️ <b>Заменить ключ</b>, если он перестал подключаться. Старый при этом сразу перестаёт работать.
📥 <b>Скачать приложение</b> для своей системы.

Ключ — это пароль от вашего доступа: у каждого устройства он должен быть свой. Если ключ нужен ещё на одно устройство, попросите отдельный${admin ? ` у ${escapeHtml(admin.handle)}` : ' у администратора'}.

Меню под этим сообщением, а список команд открывается кнопкой «/» рядом с полем ввода.`;
    },
    greeting: (clientName) =>
        `👋 Здравствуйте, <b>${escapeHtml(clientName)}</b>!\n\nЗдесь можно получить свои ключи ${escapeHtml(process.env.NEXT_PUBLIC_VPN_NAME ?? 'VPN')}, посмотреть сроки и заменить ключ, если он перестал работать.`,
    menuHint: 'Выберите действие кнопкой ниже или отправьте /menu.',
    buttonAdmin: '✉️ Написать администратору',
    commands: [
        { command: 'menu', description: 'Меню' },
        { command: 'keys', description: 'Прислать мои ключи' },
        { command: 'qr', description: 'QR-код для настройки' },
        { command: 'status', description: 'Сроки моих подписок' },
        { command: 'replace', description: 'Заменить ключ, который не работает' },
        { command: 'apps', description: 'Скачать приложение' },
        { command: 'help', description: 'Справка' },
    ],
    unknownChat:
        'Этот чат не привязан ни к одному пользователю. Попросите администратора прислать вам ссылку для привязки.',
    ambiguousChat:
        'Этот чат привязан сразу к нескольким пользователям, поэтому бот не может определить, чьи ключи выдавать. Администратор уже уведомлён — напишите ему.',
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
    configDisabled:
        'Этот ключ отключён администратором и сейчас не работает. Напишите администратору, чтобы включить его.',
    noActiveConfigs:
        'Все ваши ключи сейчас отключены администратором. Напишите ему, чтобы возобновить доступ.',
    someConfigsDisabled: (count) =>
        `🔴 Ещё ${count} ключ(ей) отключено администратором — они не отправлены, потому что работать не будут.`,

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
    helpHeader: 'Доступные команды:',
    helpAdmin: (handle) =>
        `\n\nНе нашли нужного? Напишите администратору: ${escapeHtml(handle)}`,
};

const ENGLISH: BotTexts = {
    welcome: (clientName) => {
        const admin = adminContact();

        return `👋 Hello, <b>${escapeHtml(clientName)}</b>!

This is the <b>${escapeHtml(process.env.NEXT_PUBLIC_VPN_NAME ?? 'VPN')}</b> bot. It lets you do these yourself, without waiting for an administrator:

🔑 <b>Get your keys</b> — as text, to paste into the AmneziaVPN app.
📱 <b>Get a QR code</b> — easier when setting up a phone.
ℹ️ <b>Check expiry dates</b> — how long each key is good for.
⚠️ <b>Replace a key</b> that stopped connecting. The old one stops working immediately.
📥 <b>Download the app</b> for your system.

A key is the password to your access, and every device needs its own. If you need one for another device, ask${admin ? ` ${escapeHtml(admin.handle)}` : ' your administrator'} for a separate key.

The menu is below this message, and the full command list opens from the "/" button next to the input field.`;
    },
    greeting: (clientName) =>
        `👋 Hello, <b>${escapeHtml(clientName)}</b>!\n\nFrom here you can get your ${escapeHtml(process.env.NEXT_PUBLIC_VPN_NAME ?? 'VPN')} keys, check expiry dates and replace a key that stopped working.`,
    menuHint: 'Pick an action below, or send /menu.',
    buttonAdmin: '✉️ Message the administrator',
    commands: [
        { command: 'menu', description: 'Menu' },
        { command: 'keys', description: 'Send me my keys' },
        { command: 'qr', description: 'QR code for setup' },
        { command: 'status', description: 'My subscription dates' },
        { command: 'replace', description: 'Replace a key that stopped working' },
        { command: 'apps', description: 'Download the app' },
        { command: 'help', description: 'Help' },
    ],
    unknownChat:
        'This chat is not linked to any user. Ask your administrator to send you a linking link.',
    ambiguousChat:
        'This chat is linked to more than one user, so the bot cannot tell whose keys to hand out. Your administrator has been notified — please message them.',
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
    configDisabled:
        'This key has been switched off by your administrator and will not connect. Message them to have it enabled.',
    noActiveConfigs:
        'All of your keys are currently switched off by your administrator. Message them to restore access.',
    someConfigsDisabled: (count) =>
        `🔴 ${count} more key(s) are switched off by your administrator — they were not sent, because they would not connect.`,

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
    helpHeader: 'Available commands:',
    helpAdmin: (handle) =>
        `\n\nNot what you needed? Message the administrator: ${escapeHtml(handle)}`,
};

export function textsFor(language: Languages): BotTexts {
    return language === 'ENGLISH' ? ENGLISH : RUSSIAN;
}

/**
 * Renders /help from the same list that is registered with Telegram, so the typed help
 * and the "/" dropdown can never describe different commands.
 */
export function helpMessage(language: Languages): string {
    const t = textsFor(language);
    const admin = adminContact();

    const lines = t.commands.map(
        (command) => `/${command.command} — ${escapeHtml(command.description)}`
    );

    return `${t.helpHeader}\n${lines.join('\n')}${admin ? t.helpAdmin(admin.handle) : ''}`;
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