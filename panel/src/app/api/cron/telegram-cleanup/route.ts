import { logsService } from '@/server/services/logs';
import {
    getKeyMessageTtlMs,
    purgeExpiredKeyMessages,
} from '@/server/services/telegram/key-messages';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Sweeps VPN keys out of client chats once they have outlived TELEGRAM_KEY_TTL_MINUTES.
 *
 * Must run at least twice within any 48-hour stretch — that is the hard limit past which
 * Telegram refuses to delete a bot's own message, and a missed window leaves the key in
 * the chat permanently. Hourly is the safe cadence.
 */
export async function POST(req: NextRequest) {
    if (process.env.NEXT_PUBLIC_USES_TELEGRAM_BOT !== 'true')
        return NextResponse.json({ error: 'Use Telegram Bot' }, { status: 400 });

    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (getKeyMessageTtlMs() === null)
        return NextResponse.json(
            { skipped: 'TELEGRAM_KEY_TTL_MINUTES is 0 or invalid, automatic cleanup is off' },
            { status: 200 }
        );

    try {
        const purged = await purgeExpiredKeyMessages();
        if (!purged) return NextResponse.json({ skipped: 'disabled' }, { status: 200 });

        if (purged.deleted > 0)
            await logsService.createLog(
                'TELEGRAM',
                'INFO',
                `Scheduled cleanup deleted ${purged.deleted} expired key message(s) from client chats`
            );

        if (purged.expired > 0)
            await logsService.createLog(
                'TELEGRAM',
                'WARNING',
                `Scheduled cleanup gave up on ${purged.expired} key message(s) older than 48 hours; they stay in the client chats. Run the cleanup more often than once a day.`
            );

        return NextResponse.json(purged, { status: 200 });
    } catch (error) {
        await logsService.createLog(
            'TELEGRAM',
            'ERROR',
            `Scheduled key cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );

        return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
    }
}