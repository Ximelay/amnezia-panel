import { createHash } from 'node:crypto';

import { format } from 'date-fns';

import { protocolsMapping } from '@/lib/data/mappings';
import { db } from '@/server/db';
import type {
    InlineKeyboardMarkup,
    TelegramCallbackQuery,
    TelegramIncomingMessage,
    TelegramUpdate,
} from '@/server/interfaces/telegram';
import { amneziaApiService } from '@/server/services/amnezia-api';
import { reissueConfigById } from '@/server/services/config-reissue';
import { encryptionService } from '@/server/services/encryption';
import { logsService } from '@/server/services/logs';
import { getKeyMessageTtlMs } from '../key-messages';
import { sendConfigsToTelegram } from '../telegram-messages';
import { telegramService } from '../telegram';
import { checkQuota, recordAction } from './rate-limit';
import { adminContact, appsMessage, helpMessage, retryAfterPhrase, textsFor } from './texts';
import type { Languages } from 'prisma/generated/enums';

/**
 * The client-facing half of the Telegram bot: it answers the person who holds the VPN
 * keys, rather than the admin who issues them.
 *
 * Everything here is driven by `processUpdates`, which the cron endpoint calls. There is
 * no long-running process — the panel is a Next.js app with no worker — so the bot's
 * responsiveness comes from long polling inside a single scheduled run.
 */

/** Callback payloads Telegram sends back when a button is pressed. */
const ACTION = {
    menu: 'menu',
    keys: 'keys',
    qrList: 'qr',
    qrFor: 'qr:',
    reissueList: 're',
    reissueAsk: 're:',
    reissueGo: 'rego:',
    status: 'st',
    apps: 'apps',
} as const;

/**
 * Telegram caps `callback_data` at 64 bytes. Config ids come from the VPN server and are
 * normally short, but a button that would exceed the cap is dropped rather than sent
 * truncated — a truncated id would address the wrong config.
 */
const CALLBACK_DATA_LIMIT = 64;

/** A message older than this is answered by nobody: see `processUpdates`. */
const STALE_MESSAGE_MS = 15 * 60 * 1000;

interface BotClient {
    id: number;
    name: string;
    language: Languages;
    status: boolean;
    telegramId: string;
}

interface BotConfig {
    id: string;
    clientName: string;
    expiresAt: string | null;
    status: boolean;
    protocol: keyof typeof protocolsMapping;
    serverId: number;
}

// --------------------------------------------------------------------------------------
// Lookups
// --------------------------------------------------------------------------------------

/**
 * Finds the client a chat belongs to.
 *
 * Returns null for an ambiguous chat instead of picking one: two clients sharing a chat
 * id is always an operator mistake, and guessing would hand one person the other's keys.
 */
async function resolveClient(chatId: string): Promise<BotClient | null> {
    const matches = await db.clients.findMany({
        where: { telegramId: chatId },
        select: { id: true, name: true, language: true, status: true, telegramId: true },
    });

    if (matches.length === 1) return matches[0] as BotClient;

    if (matches.length > 1)
        await logsService.createLog(
            'TELEGRAM',
            'ERROR',
            `Telegram chat ${chatId} is bound to ${matches.length} clients (${matches
                .map((client) => client.name)
                .join(', ')}); the bot refuses to serve it until only one remains`
        );

    return null;
}

/** The client's configs, in a stable order so button lists do not reshuffle. */
async function listConfigs(clientId: number): Promise<BotConfig[]> {
    return (await db.configs.findMany({
        where: { clientId },
        select: {
            id: true,
            clientName: true,
            expiresAt: true,
            status: true,
            protocol: true,
            serverId: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })) as BotConfig[];
}

/** All `liveStatuses` needs to identify a config and fall back when a server is down. */
type ConfigStatusRef = Pick<BotConfig, 'id' | 'serverId' | 'status'>;

/** Peers are listed a page at a time; this is the page size the panel already uses. */
const PEER_PAGE_SIZE = 100;

/**
 * Guards the paging loop below. A server holding more peers than this is well past what
 * one panel is meant to look after, and a runaway loop would be worse than a stale flag.
 */
const MAX_PEER_PAGES = 20;

/**
 * Asks the VPN servers which of these configs are actually switched on.
 *
 * The `Configs.status` column is only a mirror, and it drifts: enabling a client rewrites
 * it for every config the client owns (`clients.updateStatus`), configs made outside the
 * panel never had a row, and a write can fail after the server was already changed. The
 * panel resolves this by treating the server as the source of truth, and the bot has to
 * agree with the panel — a client being told their key works while the admin sees it
 * switched off is the one answer that helps nobody.
 *
 * Servers that cannot be reached are simply absent from the map, leaving the caller on
 * the stored value: a momentarily unreachable server should not make every key look dead.
 */
async function liveStatuses(configs: ConfigStatusRef[]): Promise<Map<string, boolean>> {
    const statuses = new Map<string, boolean>();
    const serverIds = [...new Set(configs.map((config) => config.serverId))];

    await Promise.all(
        serverIds.map(async (serverId) => {
            try {
                for (let page = 0; page < MAX_PEER_PAGES; page++) {
                    const response = await amneziaApiService.getConfigs(
                        serverId,
                        page * PEER_PAGE_SIZE,
                        PEER_PAGE_SIZE
                    );

                    for (const user of response.items)
                        for (const peer of user.peers)
                            statuses.set(peer.id, peer.status === 'active');

                    if (response.items.length < PEER_PAGE_SIZE) break;
                }
            } catch (error) {
                await logsService.createLog(
                    'SERVER',
                    'WARNING',
                    `Bot could not read live config statuses from server ${serverId}, falling back to the stored ones: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        })
    );

    return statuses;
}

/**
 * Whether a config is usable right now: the server's answer when there is one, the stored
 * flag when the server could not be asked.
 */
function isEnabled(config: ConfigStatusRef, statuses: Map<string, boolean>): boolean {
    return statuses.get(config.id) ?? config.status;
}

// --------------------------------------------------------------------------------------
// Keyboards
// --------------------------------------------------------------------------------------

function mainMenu(language: Languages): InlineKeyboardMarkup {
    const t = textsFor(language);
    const admin = adminContact();

    const rows: InlineKeyboardMarkup['inline_keyboard'] = [
        [{ text: t.buttonKeys, callback_data: ACTION.keys }],
        [
            { text: t.buttonQr, callback_data: ACTION.qrList },
            { text: t.buttonStatus, callback_data: ACTION.status },
        ],
        [{ text: t.buttonReissue, callback_data: ACTION.reissueList }],
        [{ text: t.buttonApps, callback_data: ACTION.apps }],
    ];

    // A link button rather than a callback: the bot has no way to relay a message to the
    // admin, and pretending otherwise would leave the client waiting for an answer that
    // never comes. This opens the admin's chat directly.
    if (admin) rows.push([{ text: t.buttonAdmin, url: admin.url }]);

    return { inline_keyboard: rows };
}

/**
 * One button per config, plus a way back.
 *
 * A config whose id will not fit in `callback_data` is left out rather than mislabelled;
 * that has never been observed with Amnezia ids, but a silent mismatch here would delete
 * the wrong config on a reissue.
 */
function configKeyboard(
    configs: BotConfig[],
    prefix: string,
    language: Languages,
    statuses: Map<string, boolean>
): InlineKeyboardMarkup {
    const t = textsFor(language);

    const rows = configs
        .filter((config) => Buffer.byteLength(prefix + config.id) <= CALLBACK_DATA_LIMIT)
        .map((config) => [
            {
                // Marked rather than hidden: a client who cannot find a key they know
                // they have will ask why, and "switched off" is the answer they need.
                text: isEnabled(config, statuses)
                    ? shortConfigName(config.clientName)
                    : `🔴 ${shortConfigName(config.clientName)}`,
                callback_data: prefix + config.id,
            },
        ]);

    rows.push([{ text: t.buttonBack, callback_data: ACTION.menu }]);

    return { inline_keyboard: rows };
}

/**
 * Strips the client-name prefix the panel puts on config names, so a button reads
 * "phone" rather than "ivan-phone".
 */
function shortConfigName(configName: string): string {
    const dash = configName.indexOf('-');
    const tail = dash === -1 ? '' : configName.slice(dash + 1).trim();

    return tail.length > 0 ? tail : configName;
}

// --------------------------------------------------------------------------------------
// Replies
// --------------------------------------------------------------------------------------

async function say(
    client: Pick<BotClient, 'name' | 'telegramId'>,
    text: string,
    replyMarkup?: InlineKeyboardMarkup
): Promise<void> {
    await telegramService.sendMessage(
        {
            chatId: client.telegramId,
            text,
            parseMode: 'HTML',
            disableWebPagePreview: true,
            replyMarkup,
        },
        client.name
    );
}

/** Answers a chat that has no client behind it, where there is no language to use. */
async function sayToUnknownChat(chatId: string, text: string): Promise<void> {
    await telegramService.sendMessage({ chatId, text, parseMode: 'HTML' }, `chat ${chatId}`);
}

async function sendMenu(client: BotClient): Promise<void> {
    const t = textsFor(client.language);

    await say(client, `${t.greeting(client.name)}\n\n${t.menuHint}`, mainMenu(client.language));
}

/**
 * The long introduction, sent when someone opens the bot rather than navigates back to
 * the menu.
 *
 * Kept separate from `sendMenu` because a person who presses "Back" for the fifth time
 * does not need to be told what the bot is for, and a person seeing it for the first time
 * needs more than a list of buttons.
 */
async function sendWelcome(client: BotClient): Promise<void> {
    await say(client, textsFor(client.language).welcome(client.name), mainMenu(client.language));
}

// --------------------------------------------------------------------------------------
// Actions
// --------------------------------------------------------------------------------------

/**
 * Binds a chat to the client named by a deep-link payload.
 *
 * The payload is single-use and time limited, which is what keeps a forwarded link from
 * attaching somebody else's chat to the client.
 */
async function bindChat(chatId: string, token: string): Promise<void> {
    const candidate = await db.clients.findUnique({
        where: { telegramLinkToken: token },
        select: {
            id: true,
            name: true,
            language: true,
            status: true,
            telegramLinkExpiresAt: true,
        },
    });

    if (!candidate || !candidate.telegramLinkExpiresAt) {
        await sayToUnknownChat(chatId, textsFor('RUSSIAN').linkInvalid);
        return;
    }

    if (candidate.telegramLinkExpiresAt.getTime() < Date.now()) {
        await sayToUnknownChat(chatId, textsFor(candidate.language).linkInvalid);
        return;
    }

    // The chat may already be attached to somebody else — an admin reusing a test
    // account, most often. Detaching keeps `resolveClient` unambiguous, which is the
    // invariant the whole bot depends on.
    const displaced = await db.clients.updateMany({
        where: { telegramId: chatId, id: { not: candidate.id } },
        data: { telegramId: null },
    });

    if (displaced.count > 0)
        await logsService.createLog(
            'TELEGRAM',
            'WARNING',
            `Telegram chat ${chatId} was detached from ${displaced.count} other client(s) when it was bound to <${candidate.name}>`
        );

    await db.clients.update({
        where: { id: candidate.id },
        data: { telegramId: chatId, telegramLinkToken: null, telegramLinkExpiresAt: null },
    });

    await logsService.createLog(
        'TELEGRAM',
        'INFO',
        `Telegram chat bound to client <${candidate.name}> from the bot`
    );

    const client: BotClient = {
        id: candidate.id,
        name: candidate.name,
        language: candidate.language,
        status: candidate.status,
        telegramId: chatId,
    };

    const t = textsFor(client.language);
    await say(client, t.linkBound(client.name));
    await sendWelcome(client);
}

async function sendKeys(client: BotClient): Promise<void> {
    const t = textsFor(client.language);

    const all = await listConfigs(client.id);

    if (all.length === 0) {
        await say(client, t.noConfigs, mainMenu(client.language));
        return;
    }

    // Sending a key for a switched-off config would be worse than sending nothing: the
    // client imports it, it fails to connect, and they conclude the service is broken
    // rather than that an admin turned it off.
    const statuses = await liveStatuses(all);
    const enabled = all.filter((config) => isEnabled(config, statuses));
    const disabledCount = all.length - enabled.length;

    if (enabled.length === 0) {
        await say(client, t.noActiveConfigs, mainMenu(client.language));
        return;
    }

    const configs = await db.configs.findMany({
        where: { id: { in: enabled.map((config) => config.id) } },
        select: {
            id: true,
            clientName: true,
            expiresAt: true,
            protocol: true,
            vpnKey: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const verdict = await checkQuota(client.id, 'KEYS');
    if (!verdict.allowed) {
        await say(
            client,
            t.rateLimited(retryAfterPhrase(verdict.retryAfterMs, client.language)),
            mainMenu(client.language)
        );
        return;
    }

    await sendConfigsToTelegram(
        client.name,
        client.telegramId,
        client.language,
        configs,
        client.id
    );

    await recordAction(client.id, 'KEYS');

    if (disabledCount > 0) await say(client, t.someConfigsDisabled(disabledCount));

    // Only promised when the sweeper is actually switched on, so the bot never claims a
    // cleanup that will not happen.
    const ttl = getKeyMessageTtlMs();
    if (ttl !== null)
        await say(client, t.keysExpireNotice(Math.round(ttl / 60_000)), mainMenu(client.language));
    else await say(client, t.menuHint, mainMenu(client.language));

    await logsService.createLog(
        'TELEGRAM',
        'INFO',
        `Client <${client.name}> pulled ${configs.length} key(s) from the bot${disabledCount > 0 ? ` (${disabledCount} switched-off config(s) withheld)` : ''}`
    );
}

/**
 * Turns whatever the Amnezia API calls a QR code into raw PNG bytes.
 *
 * The panel renders the items straight into an `<img src>`, so they arrive as data URLs;
 * the bare-base64 branch is there because that is the only other shape this field could
 * reasonably take, and guessing wrong here would mean sending Telegram a broken upload.
 */
function decodeQrItem(item: string): Buffer | null {
    const payload = item.startsWith('data:') ? (item.split(',')[1] ?? '') : item;
    if (payload.trim() === '') return null;

    try {
        const buffer = Buffer.from(payload, 'base64');
        return buffer.length > 0 ? buffer : null;
    } catch {
        return null;
    }
}

async function sendQr(client: BotClient, configId: string): Promise<void> {
    const t = textsFor(client.language);

    const config = await db.configs.findFirst({
        where: { id: configId, clientId: client.id },
        select: { id: true, clientName: true, serverId: true, status: true, vpnKey: true },
    });

    if (!config) {
        await say(client, t.configGone, mainMenu(client.language));
        return;
    }

    // Same reasoning as in `sendKeys`: a QR code for a switched-off config scans fine and
    // then fails to connect, which looks like a broken service rather than a decision.
    const statuses = await liveStatuses([config]);
    if (!isEnabled(config, statuses)) {
        await say(client, t.configDisabled, mainMenu(client.language));
        return;
    }

    const verdict = await checkQuota(client.id, 'QR');
    if (!verdict.allowed) {
        await say(
            client,
            t.rateLimited(retryAfterPhrase(verdict.retryAfterMs, client.language)),
            mainMenu(client.language)
        );
        return;
    }

    const vpnKey = encryptionService.decryptField(config.vpnKey);
    if (!vpnKey) {
        await say(client, t.qrUnavailable, mainMenu(client.language));
        return;
    }

    let qr: Awaited<ReturnType<typeof amneziaApiService.generateQrCode>>;
    try {
        qr = await amneziaApiService.generateQrCode(config.serverId, vpnKey);
    } catch {
        await say(client, t.qrUnavailable, mainMenu(client.language));
        return;
    }

    // A config too big for one code is split into an animated sequence that the Amnezia
    // app scans from a screen. Still images in a chat cannot reproduce that, so the text
    // key is the honest answer rather than a set of codes that will not import.
    if (qr.total > 1) {
        await say(client, t.qrMultipart, mainMenu(client.language));
        return;
    }

    const image = qr.items[0] ? decodeQrItem(qr.items[0]) : null;
    if (!image) {
        await say(client, t.qrUnavailable, mainMenu(client.language));
        return;
    }

    await telegramService.sendPhoto(
        {
            chatId: client.telegramId,
            photo: image,
            caption: t.qrCaption(shortConfigName(config.clientName)),
            parseMode: 'HTML',
        },
        client.name
    );

    await recordAction(client.id, 'QR', configId);

    await say(client, t.menuHint, mainMenu(client.language));

    await logsService.createLog(
        'TELEGRAM',
        'INFO',
        `Client <${client.name}> pulled a QR code for <${config.clientName}> from the bot`
    );
}

function isReissueEnabled(): boolean {
    return process.env.TELEGRAM_BOT_ALLOW_REISSUE !== 'false';
}

async function reissue(client: BotClient, configId: string): Promise<void> {
    const t = textsFor(client.language);

    const config = await db.configs.findFirst({
        where: { id: configId, clientId: client.id },
        select: { id: true, clientName: true, status: true, serverId: true },
    });

    if (!config) {
        await say(client, t.configGone, mainMenu(client.language));
        return;
    }

    // The important one. A reissue creates a fresh peer on the VPN server, and a fresh
    // peer is enabled — so without this check a client could undo an admin's block just
    // by pressing "my key stopped working".
    const statuses = await liveStatuses([config]);
    if (!isEnabled(config, statuses)) {
        await say(client, t.configDisabled, mainMenu(client.language));
        return;
    }

    const verdict = await checkQuota(client.id, 'REISSUE', configId);
    if (!verdict.allowed) {
        await say(
            client,
            t.rateLimited(retryAfterPhrase(verdict.retryAfterMs, client.language)),
            mainMenu(client.language)
        );
        return;
    }

    await say(client, t.reissueWorking);

    let reissued: Awaited<ReturnType<typeof reissueConfigById>>;
    try {
        reissued = await reissueConfigById(configId, { adminId: null });
    } catch (error) {
        await logsService.createLog(
            'TELEGRAM',
            'ERROR',
            `Reissue requested by client <${client.name}> for <${config.clientName}> failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );

        await say(client, t.reissueFailed, mainMenu(client.language));
        return;
    }

    // Recorded against the new id: the old row is gone, and the next request the quota
    // has to stop is one aimed at the replacement.
    await recordAction(client.id, 'REISSUE', reissued.id);

    await say(client, t.reissueDone(shortConfigName(reissued.clientName)));

    const fresh = await db.configs.findUnique({
        where: { id: reissued.id },
        select: { id: true, clientName: true, expiresAt: true, protocol: true, vpnKey: true },
    });

    if (fresh)
        await sendConfigsToTelegram(
            client.name,
            client.telegramId,
            client.language,
            [fresh],
            client.id
        );

    await say(client, t.menuHint, mainMenu(client.language));
}

async function sendStatus(client: BotClient): Promise<void> {
    const t = textsFor(client.language);
    const configs = await listConfigs(client.id);

    if (configs.length === 0) {
        await say(client, t.noConfigs, mainMenu(client.language));
        return;
    }

    const dateFormat = client.language === 'RUSSIAN' ? 'dd.MM.yyyy' : 'MM/dd/yyyy';
    const statuses = await liveStatuses(configs);

    const rows = configs.map((config) => {
        const seconds = Number(config.expiresAt);
        const valid = config.expiresAt !== null && Number.isFinite(seconds) && seconds > 0;

        const expiresAt = valid ? new Date(seconds * 1000) : null;

        return t.statusRow({
            name: shortConfigName(config.clientName),
            protocol: protocolsMapping[config.protocol] ?? config.protocol,
            expiry: expiresAt ? format(expiresAt, dateFormat) : '—',
            daysLeft: expiresAt
                ? Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
                : null,
            active: isEnabled(config, statuses),
        });
    });

    await say(
        client,
        `${t.statusHeader}\n\n${rows.join('\n\n')}`,
        mainMenu(client.language)
    );

    await recordAction(client.id, 'STATUS');
}

async function sendApps(client: BotClient): Promise<void> {
    await say(client, appsMessage(client.language), mainMenu(client.language));
    await recordAction(client.id, 'APPS');
}

// --------------------------------------------------------------------------------------
// Dispatch
// --------------------------------------------------------------------------------------

/**
 * Everything a bound, active client is allowed to trigger.
 *
 * Split out so a text command and a button press reach exactly the same code, and cannot
 * drift into behaving differently.
 */
async function dispatch(client: BotClient, action: string): Promise<void> {
    const t = textsFor(client.language);

    if (action === ACTION.menu) return sendMenu(client);
    if (action === ACTION.status) return sendStatus(client);
    if (action === ACTION.apps) return sendApps(client);

    // Reading dates and download links stays available while suspended; anything that
    // hands out a working key does not.
    if (!client.status) {
        await say(client, t.clientDisabled, mainMenu(client.language));
        return;
    }

    if (action === ACTION.keys) return sendKeys(client);

    if (action === ACTION.qrList) {
        const configs = await listConfigs(client.id);
        if (configs.length === 0) {
            await say(client, t.noConfigs, mainMenu(client.language));
            return;
        }
        await say(
            client,
            t.qrPick,
            configKeyboard(configs, ACTION.qrFor, client.language, await liveStatuses(configs))
        );
        return;
    }

    if (action.startsWith(ACTION.qrFor))
        return sendQr(client, action.slice(ACTION.qrFor.length));

    if (action === ACTION.reissueList) {
        if (!isReissueEnabled()) {
            await say(client, t.reissueDisabled, mainMenu(client.language));
            return;
        }

        const configs = await listConfigs(client.id);
        if (configs.length === 0) {
            await say(client, t.noConfigs, mainMenu(client.language));
            return;
        }

        await say(
            client,
            t.reissuePick,
            configKeyboard(
                configs,
                ACTION.reissueAsk,
                client.language,
                await liveStatuses(configs)
            )
        );
        return;
    }

    // Asking before doing, because a reissue kills the key on every device at once and
    // there is no undo.
    if (action.startsWith(ACTION.reissueAsk)) {
        if (!isReissueEnabled()) {
            await say(client, t.reissueDisabled, mainMenu(client.language));
            return;
        }

        const configId = action.slice(ACTION.reissueAsk.length);
        const config = await db.configs.findFirst({
            where: { id: configId, clientId: client.id },
            select: { id: true, clientName: true, status: true, serverId: true },
        });

        if (!config) {
            await say(client, t.configGone, mainMenu(client.language));
            return;
        }

        // Checked here as well as in `reissue`, so a switched-off key is refused before
        // the client is asked to confirm rather than after.
        const statuses = await liveStatuses([config]);
        if (!isEnabled(config, statuses)) {
            await say(client, t.configDisabled, mainMenu(client.language));
            return;
        }

        await say(client, t.reissueConfirm(shortConfigName(config.clientName)), {
            inline_keyboard: [
                [{ text: t.buttonConfirm, callback_data: ACTION.reissueGo + configId }],
                [{ text: t.buttonCancel, callback_data: ACTION.menu }],
            ],
        });
        return;
    }

    if (action.startsWith(ACTION.reissueGo)) {
        if (!isReissueEnabled()) {
            await say(client, t.reissueDisabled, mainMenu(client.language));
            return;
        }
        return reissue(client, action.slice(ACTION.reissueGo.length));
    }

    await sendMenu(client);
}

/**
 * Maps the typed commands onto the same actions the buttons use.
 *
 * Every command Telegram offers in its "/" dropdown has to land here, or a client picks
 * one from the list and the bot answers with the menu as though they had typed nonsense.
 * The list itself lives in `texts.ts` and is registered by `syncCommands`.
 */
function actionForCommand(text: string): string | null {
    const command = text.trim().split(/\s+/)[0]?.toLowerCase().split('@')[0];

    switch (command) {
        case '/menu':
            return ACTION.menu;
        case '/keys':
            return ACTION.keys;
        case '/qr':
            return ACTION.qrList;
        case '/replace':
            return ACTION.reissueList;
        case '/status':
            return ACTION.status;
        case '/apps':
            return ACTION.apps;
        default:
            return null;
    }
}

async function handleMessage(message: TelegramIncomingMessage): Promise<void> {
    const chatId = String(message.chat.id);
    const text = message.text?.trim() ?? '';

    // A deep link arrives as "/start <payload>" and is the one thing an unbound chat is
    // allowed to do.
    const startPayload = /^\/start\s+(\S+)/.exec(text)?.[1];
    if (startPayload) {
        await bindChat(chatId, startPayload);
        return;
    }

    const client = await resolveClient(chatId);
    if (!client) {
        await sayToUnknownChat(chatId, textsFor('RUSSIAN').unknownChat);
        return;
    }

    if (text.toLowerCase().startsWith('/help')) {
        await say(client, helpMessage(client.language), mainMenu(client.language));
        return;
    }

    // A bare /start is someone opening the bot rather than navigating it, which is the
    // one moment the long explanation belongs.
    if (text.toLowerCase().startsWith('/start')) {
        await sendWelcome(client);
        return;
    }

    await dispatch(client, actionForCommand(text) ?? ACTION.menu);
}

async function handleCallback(callback: TelegramCallbackQuery): Promise<void> {
    const chatId = callback.message ? String(callback.message.chat.id) : String(callback.from.id);

    const client = await resolveClient(chatId);
    if (!client) {
        await telegramService.answerCallbackQuery(callback.id);
        await sayToUnknownChat(chatId, textsFor('RUSSIAN').unknownChat);
        return;
    }

    // Acknowledged before the work starts: Telegram spins the button until this lands,
    // and a reissue takes several seconds.
    await telegramService.answerCallbackQuery(callback.id);

    // The pressed message keeps its text but loses its buttons, so a stale list cannot be
    // clicked twice.
    if (callback.message)
        await telegramService.clearReplyMarkup(chatId, callback.message.message_id);

    await dispatch(client, callback.data ?? ACTION.menu);
}

// --------------------------------------------------------------------------------------
// Polling
// --------------------------------------------------------------------------------------

export interface PollResult {
    processed: number;
    skipped: 'locked' | 'disabled' | null;
}

/** The single row that carries the cursor, created on first use. */
async function ensureState() {
    return db.telegramBotState.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: {},
    });
}

/**
 * Publishes the command list that fills Telegram's "/" dropdown.
 *
 * Telegram stores this per bot rather than per message, so it only has to be sent when the
 * wording changes — hence the fingerprint. Without that guard this would be an extra API
 * call on every polling run, once a minute, forever.
 *
 * The Russian list is registered as the fallback and the English one against `en`, so
 * Telegram picks by the reader's own interface language. That is not necessarily the
 * language the panel has recorded for them, but it is the language their Telegram is in,
 * which is the better guess for a menu Telegram itself draws.
 */
async function syncCommands(storedHash: string | null): Promise<void> {
    const russian = textsFor('RUSSIAN').commands;
    const english = textsFor('ENGLISH').commands;

    const hash = createHash('sha256')
        .update(JSON.stringify({ russian, english }))
        .digest('hex');

    if (hash === storedHash) return;

    await telegramService.setMyCommands(russian);
    await telegramService.setMyCommands(english, 'en');

    await db.telegramBotState.update({ where: { id: 1 }, data: { commandsHash: hash } });

    await logsService.createLog(
        'TELEGRAM',
        'INFO',
        `Bot command list registered with Telegram (${russian.length} commands)`
    );
}

/**
 * Fetches pending updates and answers them, for at most `maxDurationMs`.
 *
 * This is the only place allowed to pass an offset to `getUpdates`, because confirming an
 * update is what removes it from Telegram's queue. The cursor moves even when handling
 * threw: an update that fails every time would otherwise be retried forever and block
 * every message behind it.
 */
export async function processUpdates(
    options: { maxDurationMs?: number; longPollSeconds?: number } = {}
): Promise<PollResult> {
    const { maxDurationMs = 0, longPollSeconds = 0 } = options;

    if (process.env.NEXT_PUBLIC_USES_TELEGRAM_BOT !== 'true')
        return { processed: 0, skipped: 'disabled' };

    const state = await ensureState();

    // Best effort: a bot that could not publish its command list still answers everything
    // typed by hand, so this must not stop the run.
    try {
        await syncCommands(state.commandsHash);
    } catch (error) {
        await logsService.createLog(
            'TELEGRAM',
            'WARNING',
            `Bot command list could not be registered: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }

    // The lease outlives the run so a healthy one cannot have it stolen mid-poll, and
    // expires on its own so a run that died without reaching its `finally` only costs the
    // bot half a minute rather than wedging it until someone notices.
    const lease = new Date(Date.now() + maxDurationMs + 30_000);
    const claimed = await db.telegramBotState.updateMany({
        where: {
            id: 1,
            OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
        },
        data: { lockedUntil: lease },
    });

    if (claimed.count === 0) return { processed: 0, skipped: 'locked' };

    const deadline = Date.now() + maxDurationMs;
    let processed = 0;

    try {
        do {
            const state = await db.telegramBotState.findUnique({ where: { id: 1 } });
            const cursor = Number(state?.lastUpdateId ?? 0);

            const updates = await telegramService.getUpdates({
                offset: cursor > 0 ? cursor + 1 : undefined,
                timeoutSeconds: longPollSeconds,
            });

            for (const update of updates) {
                await handleUpdate(update);
                processed++;

                await db.telegramBotState.update({
                    where: { id: 1 },
                    data: { lastUpdateId: BigInt(update.update_id) },
                });
            }

            // Nothing pending and no time for another long poll: stop rather than spin.
            if (updates.length === 0 && Date.now() + longPollSeconds * 1000 >= deadline) break;
        } while (Date.now() + longPollSeconds * 1000 < deadline);
    } finally {
        await db.telegramBotState.update({ where: { id: 1 }, data: { lockedUntil: null } });
    }

    return { processed, skipped: null };
}

/**
 * Handles one update, absorbing whatever it throws.
 *
 * A failure here must not stop the run: the cursor advances past this update either way,
 * and the alternative is one malformed message wedging the bot for every client.
 */
async function handleUpdate(update: TelegramUpdate): Promise<void> {
    try {
        if (update.callback_query) {
            await handleCallback(update.callback_query);
            return;
        }

        if (update.message) {
            // Answering a message from hours ago — after an outage, say — would be worse
            // than staying quiet: the person has moved on, and a key arriving unprompted
            // is exactly what this bot is trying to avoid.
            //
            // A deep link is the exception. It carries its own 24-hour expiry, and the
            // whole point of pressing Start is that binding happens whenever the panel
            // next looks; dropping it because the poller was down overnight would strand
            // a client who did everything right.
            const isDeepLink = /^\/start\s+\S/.test(update.message.text?.trim() ?? '');

            if (!isDeepLink && Date.now() - update.message.date * 1000 > STALE_MESSAGE_MS) return;

            await handleMessage(update.message);
        }
    } catch (error) {
        await logsService.createLog(
            'TELEGRAM',
            'ERROR',
            `Bot failed to handle update ${update.update_id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );

        // Best effort: tell whoever pressed the button that it did not work, so the
        // failure is not silent on their side.
        const chatId =
            update.callback_query?.message?.chat.id ??
            update.callback_query?.from.id ??
            update.message?.chat.id;

        if (chatId !== undefined) {
            const client = await resolveClient(String(chatId)).catch(() => null);
            const language = client?.language ?? 'RUSSIAN';

            await telegramService
                .sendMessage(
                    { chatId: String(chatId), text: textsFor(language).genericError },
                    client?.name ?? `chat ${chatId}`
                )
                .catch(() => undefined);
        }
    }
}