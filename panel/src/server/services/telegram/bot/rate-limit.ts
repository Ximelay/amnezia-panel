import { db } from '@/server/db';
import type { BotActions } from 'prisma/generated/enums';

/**
 * Quotas on what a client may ask the bot to do.
 *
 * The point is not to stop a determined person — they already hold the key and can copy
 * it. It is to make the cheap paths cheap and the expensive ones deliberate: pulling your
 * own key a handful of times a day is normal, pulling it thirty times is worth a look,
 * and replacing a config costs a round trip to the VPN server every time.
 */

interface Quota {
    /** How many times the action may be taken inside the window. */
    limit: number;
    windowMs: number;
    /** When set, the quota is counted per config rather than across all of them. */
    perConfig?: boolean;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Reads a positive integer from the environment, falling back when unset or unusable. */
function envInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return fallback;

    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function quotasFor(action: BotActions): Quota[] {
    switch (action) {
        case 'KEYS':
            return [{ limit: envInt('BOT_KEYS_PER_DAY', 5), windowMs: DAY }];
        case 'QR':
            return [{ limit: envInt('BOT_QR_PER_DAY', 5), windowMs: DAY }];
        case 'REISSUE':
            return [
                // One config cannot be churned repeatedly...
                { limit: envInt('BOT_REISSUE_PER_CONFIG_PER_DAY', 1), windowMs: DAY, perConfig: true },
                // ...and a client cannot work around that by cycling through all of theirs.
                { limit: envInt('BOT_REISSUE_PER_MONTH', 3), windowMs: 30 * DAY },
            ];
        // Reading your own expiry dates or a list of download links costs nothing and
        // reveals nothing, so it is deliberately unmetered.
        case 'STATUS':
        case 'APPS':
            return [];
    }
}

export interface QuotaVerdict {
    allowed: boolean;
    /** Milliseconds until the oldest request in the window ages out. */
    retryAfterMs: number;
}

/**
 * Decides whether an action is within quota, without recording it.
 *
 * `retryAfterMs` is derived from the oldest request still inside the window, which is the
 * moment a slot actually frees up — a fixed "try later" would be a guess.
 */
export async function checkQuota(
    clientId: number,
    action: BotActions,
    configId?: string
): Promise<QuotaVerdict> {
    for (const quota of quotasFor(action)) {
        if (quota.limit === 0) return { allowed: false, retryAfterMs: 0 };

        const since = new Date(Date.now() - quota.windowMs);

        const rows = await db.clientBotRequests.findMany({
            where: {
                clientId,
                action,
                createdAt: { gte: since },
                ...(quota.perConfig && configId ? { configId } : {}),
            },
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' },
            take: quota.limit,
        });

        if (rows.length >= quota.limit) {
            const oldest = rows[0]!.createdAt.getTime();
            return {
                allowed: false,
                retryAfterMs: Math.max(0, oldest + quota.windowMs - Date.now()),
            };
        }
    }

    return { allowed: true, retryAfterMs: 0 };
}

/**
 * Records that an action was taken.
 *
 * Called after the action succeeded, so a failed send does not burn the client's quota;
 * the trade-off is that an action failing halfway can be retried immediately, which is
 * the behaviour a person in that situation expects.
 */
export async function recordAction(
    clientId: number,
    action: BotActions,
    configId?: string
): Promise<void> {
    await db.clientBotRequests.create({
        data: { clientId, action, configId: configId ?? null },
    });
}

/**
 * Drops ledger rows nobody can still be rate-limited by.
 *
 * Kept longer than the widest window so the rows stay useful as an audit trail of who
 * asked for what, which is the other half of what this table is for.
 */
export async function pruneOldRequests(): Promise<number> {
    const { count } = await db.clientBotRequests.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 90 * DAY) } },
    });

    return count;
}