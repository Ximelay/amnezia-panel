import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import bcrypt from 'bcryptjs';
import { logsService } from '@/server/services/logs';

export async function POST(req: NextRequest) {
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.ROOT_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const rootUser = await db.admins.findFirst({
            where: { role: 'ROOT' },
            select: { id: true },
        });

        if (!rootUser) return NextResponse.json({ error: 'Root is not created' }, { status: 400 });

        const hashedPassword = await bcrypt.hash('rootadmin', 12);

        await db.admins.update({
            where: {
                id: rootUser.id,
            },
            data: {
                login: 'root_reseted',
                password: hashedPassword,
                isFirstLogin: true,
            },
        });

        await logsService.createLog('ADMIN', 'WARNING', 'Root was reseted');

        return NextResponse.json({
            success: true,
            message: 'Root was reseted successfully. Login: root_reseted, Password: rootadmin',
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to setup root' }, { status: 500 });
    }
}
