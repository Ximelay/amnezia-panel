import { db } from '@/server/db';
import { logsService } from '../logs';
import { telegramService } from './telegram';

/**
 * Telegram will not delete a message sent more than 48 hours ago. Everything here is
 * built around that ceiling: a key handed out yesterday can still be withdrawn, one
 * handed out last week cannot, and the client has to be given a new config instead.
 */
export const TELEGRAM_DELETE_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Telegram accepts at most 100 message ids per `deleteMessages` call. */
const BATCH_SIZE = 100;

/** Used when TELEGRAM_KEY_TTL_MINUTES is unset: long enough to install, short enough to matter. */
const DEFAULT_TTL_MINUTES = 720;

/**
 * How long a key is allowed to sit in the chat before the sweeper removes it.
 *
 * Returns null when the feature is switched off (`0`, a negative value, or garbage), so
 * the caller can skip the sweep entirely rather than fall back to a default nobody asked
 * for. Values beyond the 48-hour ceiling are clamped: past it Telegram would refuse every
 * delete and the messages would live forever, which is exactly the opposite of the intent.
 */
export function getKeyMessageTtlMs(): number | null {
    const raw = process.env.TELEGRAM_KEY_TTL_MINUTES;

    const minutes = raw === undefined || raw.trim() === '' ? DEFAULT_TTL_MINUTES : Number(raw);

    if (!Number.isFinite(minutes) || minutes <= 0) return null;

    // One hour of headroom, so a message queued right before the sweep is still deletable
    // when the sweep actually reaches it.
    return Math.min(minutes * 60 * 1000, TELEGRAM_DELETE_WINDOW_MS - 60 * 60 * 1000);
}

/**
 * Remembers a bot message that contains VPN keys so it can be withdrawn later.
 *
 * Never throws: the key has already reached the client at this point, and losing the
 * bookkeeping is not a reason to report the send as failed.
 */
export async function recordKeyMessage(
    chatId: string,
    messageId: number,
    configIds: string[],
    clientId?: number | null
): Promise<void> {
    try {
        await db.telegramKeyMessages.upsert({
            where: { chatId_messageId: { chatId, messageId } },
            create: { chatId, messageId, configIds, clientId: clientId ?? null },
            update: { configIds, clientId: clientId ?? null, deletedAt: null },
        });
    } catch (error) {
        await logsService.createLog(
            'TELEGRAM',
            'WARNING',
            `Sent key message ${messageId} could not be tracked for later removal: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

interface PurgeResult {
    deleted: number;
    /** Rows Telegram refused because the message is older than 48 hours. */
    expired: number;
    failed: number;
}

/**
 * Deletes the given tracked messages from their chats and marks the rows done.
 *
 * Rows past the 48-hour window are retired without an API call: Telegram would answer
 * "message can't be deleted", and keeping them would make every later sweep slower for
 * nothing. Those keys stay in the chat, which is why revoking the config on the VPN
 * server — not deleting the message — is the actual security boundary.
 */
async function purge(
    rows: { id: number; chatId: string; messageId: number; createdAt: Date }[]
): Promise<PurgeResult> {
    const result: PurgeResult = { deleted: 0, expired: 0, failed: 0 };
    if (rows.length === 0) return result;

    const cutoff = Date.now() - TELEGRAM_DELETE_WINDOW_MS;

    const expired = rows.filter((row) => row.createdAt.getTime() <= cutoff);
    const deletable = rows.filter((row) => row.createdAt.getTime() > cutoff);

    if (expired.length > 0) {
        await db.telegramKeyMessages.updateMany({
            where: { id: { in: expired.map((row) => row.id) } },
            data: { deletedAt: new Date() },
        });
        result.expired = expired.length;
    }

    // Grouped per chat because `deleteMessages` takes a single chat_id.
    const byChat = new Map<string, typeof deletable>();
    for (const row of deletable) {
        const chat = byChat.get(row.chatId) ?? [];
        chat.push(row);
        byChat.set(row.chatId, chat);
    }

    for (const [chatId, chatRows] of byChat) {
        for (let i = 0; i < chatRows.length; i += BATCH_SIZE) {
            const batch = chatRows.slice(i, i + BATCH_SIZE);

            const gone =
                batch.length === 1
                    ? await telegramService.deleteMessage(chatId, batch[0]!.messageId)
                    : await telegramService.deleteMessages(
                          chatId,
                          batch.map((row) => row.messageId)
                      );

            if (gone) {
                await db.telegramKeyMessages.updateMany({
                    where: { id: { in: batch.map((row) => row.id) } },
                    data: { deletedAt: new Date() },
                });
                result.deleted += batch.length;
            } else {
                // Left untouched on purpose: the next sweep retries it.
                result.failed += batch.length;
            }
        }
    }

    return result;
}

const PENDING = { deletedAt: null } as const;
const SELECT = { id: true, chatId: true, messageId: true, createdAt: true } as const;

/** Withdraws every still-pending key message that mentions any of these configs. */
export async function purgeKeyMessagesForConfigs(configIds: string[]): Promise<PurgeResult> {
    if (configIds.length === 0) return { deleted: 0, expired: 0, failed: 0 };

    const rows = await db.telegramKeyMessages.findMany({
        where: { ...PENDING, configIds: { hasSome: configIds } },
        select: SELECT,
    });

    return purge(rows);
}

/** Withdraws every still-pending key message sent to a client. */
export async function purgeKeyMessagesForClient(clientId: number): Promise<PurgeResult> {
    const rows = await db.telegramKeyMessages.findMany({
        where: { ...PENDING, clientId },
        select: SELECT,
    });

    return purge(rows);
}

/**
 * Takes the key back out of the client's Telegram chat once the config behind it is dead.
 *
 * Best effort by design: the config is already revoked on the VPN server by the time this
 * runs, so a Telegram outage must not turn a successful revocation into an error. What it
 * cannot do is silently: a key older than 48 hours stays in the chat forever, and that
 * fact belongs in the log rather than in nobody's head.
 *
 * `adminId` is null when the client triggered the revocation from the bot rather than an
 * admin from the panel.
 */
export async function withdrawSentKeys(
    configIds: string[],
    label: string,
    adminId: string | null
): Promise<void> {
    try {
        const purged = await purgeKeyMessagesForConfigs(configIds);

        if (purged.deleted > 0)
            await logsService.createLog(
                'TELEGRAM',
                'INFO',
                `${purged.deleted} Telegram message(s) with the key of <${label}> deleted from the client chat`,
                adminId ?? undefined
            );

        if (purged.expired > 0)
            await logsService.createLog(
                'TELEGRAM',
                'WARNING',
                `${purged.expired} Telegram message(s) with the key of <${label}> stayed in the client chat: older than 48 hours and no longer deletable by the bot`,
                adminId ?? undefined
            );
    } catch (error) {
        await logsService.createLog(
            'TELEGRAM',
            'WARNING',
            `Could not withdraw the sent key of <${label}> from Telegram: ${error instanceof Error ? error.message : 'Unknown error'}`,
            adminId ?? undefined
        );
    }
}

/**
 * The scheduled sweep: withdraws everything that has outlived TELEGRAM_KEY_TTL_MINUTES.
 * Returns null when the feature is disabled.
 */
export async function purgeExpiredKeyMessages(): Promise<PurgeResult | null> {
    const ttl = getKeyMessageTtlMs();
    if (ttl === null) return null;

    const rows = await db.telegramKeyMessages.findMany({
        where: { ...PENDING, createdAt: { lte: new Date(Date.now() - ttl) } },
        select: SELECT,
        // A backlog stays bounded per run instead of blocking on thousands of API calls.
        take: 500,
        orderBy: { createdAt: 'asc' },
    });

    return purge(rows);
}