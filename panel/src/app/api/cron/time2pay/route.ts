import { db } from '@/server/db';
import { logsService } from '@/server/services/logs';
import { telegramService } from '@/server/services/telegram/telegram';
import { type NextRequest, NextResponse } from 'next/server';
import { Languages } from 'prisma/generated/enums';

type ClientWithExpiringCount = {
    name: string;
    telegramId: string;
    language: Languages;
    configsCount: number;
};

export async function POST(req: NextRequest) {
    if (process.env.NEXT_PUBLIC_USES_TELEGRAM_BOT !== 'true')
        return NextResponse.json({ error: 'Use Telegram Bot' }, { status: 400 });

    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const foundPaymentSettings = await db.paymentSettings.findFirst({
            where: { id: 1 },
        });
        if (!foundPaymentSettings)
            return NextResponse.json({ error: 'PaymentSettings not found' }, { status: 400 });

        const now = new Date();
        const startOfToday = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
        );
        const startOfTomorrow = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
        );

        const startTimestamp = Math.floor(startOfToday.getTime() / 1000);
        const endTimestamp = Math.floor(startOfTomorrow.getTime() / 1000);

        const foundClients: ClientWithExpiringCount[] = await db.$queryRaw`
            SELECT 
                c.name, 
                c."telegramId", 
                c.language,
                COUNT(conf.id) AS "configsCount"
            FROM "Clients" c
            INNER JOIN "Configs" conf ON conf."clientId" = c.id
            WHERE conf."expiresAt" IS NOT NULL
                AND conf."expiresAt"::bigint >= ${startTimestamp}
                AND conf."expiresAt"::bigint < ${endTimestamp}
            GROUP BY c.id, c.name, c."telegramId", c.language
        `;

        if (!foundClients || foundClients.length === 0)
            return NextResponse.json('Clients not found', { status: 200 });

        for (const client of foundClients) {
            const clientConfigsCount = Number(client.configsCount)

            if (client.telegramId) {
                const calculatedTotalPrice = (): number => {
                    const configsCount = clientConfigsCount;
                    if (configsCount <= foundPaymentSettings.defaultConfigsCount) {
                        return foundPaymentSettings.defaultPrice;
                    }
                    const extraCount = configsCount - foundPaymentSettings.defaultConfigsCount;
                    return (
                        foundPaymentSettings.defaultPrice +
                        extraCount * foundPaymentSettings.additionalPrice
                    );
                };

                const devicesWord = () => {
                    if (clientConfigsCount < 10 || clientConfigsCount > 20) {
                        if (clientConfigsCount % 10 === 1) {
                            return 'устройство';
                        } else if (clientConfigsCount % 10 > 1 && clientConfigsCount % 10 < 5) {
                            return 'устройства';
                        } else {
                            return 'устройств';
                        }
                    } else {
                        return 'устройств';
                    }
                };

                const message =
                    client.language === Languages.RUSSIAN
                        ? `🕘 Время <a href="${foundPaymentSettings.paymentLink}">платить</a> за VPN.
С вас ${calculatedTotalPrice()}₽ за ${client.configsCount} ${devicesWord()}`
                        : `🕘 Time to <a href="${foundPaymentSettings.paymentLink}">pay</a> for VPN.
It's ${calculatedTotalPrice()}₽ for ${client.configsCount} devices`;

                await telegramService.sendMessage(
                    {
                        chatId: client.telegramId,
                        text: message,
                        parseMode: 'HTML',
                    },
                    client.name
                );

                await logsService.createLog(
                    'TELEGRAM',
                    'INFO',
                    `${client.name} was notified about payment successfully`
                );
            } else {
                await logsService.createLog(
                    'TELEGRAM',
                    'WARNING',
                    `${client.name} was not notified about payment cause without telegramId`
                );
            }
        }

        return NextResponse.json(
            { message: 'Notifications were sent successfully' },
            { status: 200 }
        );
    } catch (error) {
        console.error('Time2pay error:', error);
        return NextResponse.json({ error: 'Failed to time2pay' }, { status: 500 });
    }
}
