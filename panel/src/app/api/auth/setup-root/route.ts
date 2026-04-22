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
        const existingUser = await db.admins.findFirst({
            where: { role: 'ROOT' },
            select: { id: true },
        });

        if (existingUser) {
            return NextResponse.json({ error: 'Root is already existing' }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash('rootadmin', 12);

        await db.admins.create({
            data: {
                login: 'root',
                password: hashedPassword,
                role: 'ROOT',
            },
        });

        await logsService.createLog('ADMIN', 'INFO', 'Root has been added successfully');

        return NextResponse.json({
            success: true,
            message: 'ROOT user was created successfully. Login: root, Password: rootadmin',
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to setup root' }, { status: 500 });
    }
}
