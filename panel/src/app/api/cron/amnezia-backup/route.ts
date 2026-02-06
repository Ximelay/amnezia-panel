import { db } from '@/server/db';
import { amneziaApiService } from '@/server/services/amnezia-api';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { ip } = body;

        if (!ip) return NextResponse.json({ error: 'IP address is required' }, { status: 400 });

        const foundServer = await db.servers.findFirst({
            where: { ip },
            select: { id: true },
        });

        if (!foundServer) return NextResponse.json({ error: 'Server not found' }, { status: 404 });

        const backupResult = await amneziaApiService.getServerBackup(foundServer.id);

        return NextResponse.json(backupResult, { status: 200 });
    } catch (error) {
        console.error('Backup error:', error);

        if (error instanceof NextResponse) return error;

        return NextResponse.json({ error: 'Failed to backup Amnezia configs' }, { status: 500 });
    }
}
