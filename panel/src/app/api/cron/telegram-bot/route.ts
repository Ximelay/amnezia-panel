import { type NextRequest, NextResponse } from 'next/server';

import { logsService } from '@/server/services/logs';
import { processUpdates } from '@/server/services/telegram/bot';
import { pruneOldRequests } from '@/server/services/telegram/bot/rate-limit';

/**
 * Drives the client-facing Telegram bot.
 *
 * The panel is published on loopback behind a self-signed certificate, so Telegram cannot
 * reach it and a webhook is not an option: the bot has to pull. Next.js has no worker to
 * pull from either, which is why this is a cron endpoint that long-polls for most of a
 * minute and then returns, leaving the next invocation to pick up where it stopped.
 *
 * Run it every minute. A longer gap is safe — updates wait 24 hours on Telegram's side —
 * but every second of that gap is a second a client waits for their key.
 */

/** Long polling holds the request open, so the route must not be treated as static. */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Telegram's own cap is 50 seconds; 25 keeps a stuck connection from eating a whole run. */
const LONG_POLL_SECONDS = 25;

/**
 * Room for exactly two long polls before the next per-minute tick.
 *
 * The budget has to clear a whole multiple of the poll length or the last poll is never
 * started: at 50s the second one would not fit, and the bot would sit idle for the back
 * half of every minute.
 */
const RUN_BUDGET_MS = 55_000;

export async function POST(req: NextRequest) {
    if (process.env.NEXT_PUBLIC_USES_TELEGRAM_BOT !== 'true')
        return NextResponse.json({ error: 'Use Telegram Bot' }, { status: 400 });

    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const result = await processUpdates({
            maxDurationMs: RUN_BUDGET_MS,
            longPollSeconds: LONG_POLL_SECONDS,
        });

        // Cheap enough to do inline, and it keeps the rate-limit table from growing
        // without bound on a panel nobody ever prunes by hand.
        const pruned = await pruneOldRequests();

        return NextResponse.json({ ...result, pruned }, { status: 200 });
    } catch (error) {
        await logsService.createLog(
            'TELEGRAM',
            'ERROR',
            `Bot polling run failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );

        return NextResponse.json({ error: 'Bot polling failed' }, { status: 500 });
    }
}