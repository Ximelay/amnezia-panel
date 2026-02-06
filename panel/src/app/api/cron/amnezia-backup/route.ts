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

        if (!foundServer) throw new Error('Server not found');

        return await amneziaApiService.getServerBackup(foundServer.id);
    } catch (error) {
        console.error(error);

        if (error instanceof Error) {
            if (error.message === 'Server not found')
                return NextResponse.json({ error: 'Server not found' }, { status: 404 });
        }

        return NextResponse.json({ error: 'Failed to backup Amnezia configs' }, { status: 500 });
    }
}
