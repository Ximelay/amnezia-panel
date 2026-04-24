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

        const MSK_OFFSET = 3 * 60 * 60 * 1000; // Change time zone if u need
        const now = new Date();
        const nowMSK = new Date(now.getTime() + MSK_OFFSET);
        const startOfTodayMSK = new Date(
            Date.UTC(nowMSK.getUTCFullYear(), nowMSK.getUTCMonth(), nowMSK.getUTCDate())
        );
        const startOfTomorrowMSK = new Date(startOfTodayMSK.getTime() + 24 * 60 * 60 * 1000);
        const startTimestamp = Math.floor(startOfTodayMSK.getTime() / 1000);
        const endTimestamp = Math.floor(startOfTomorrowMSK.getTime() / 1000);

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

        const clientSummaries: { name: string; configsCount: number; totalPrice: number }[] = [];

        for (const client of foundClients) {
            const clientConfigsCount = Number(client.configsCount);

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
                    `Client <${client.name}> was notified about payment successfully`
                );

                clientSummaries.push({
                    name: client.name,
                    configsCount: clientConfigsCount,
                    totalPrice: calculatedTotalPrice(),
                });
            } else {
                await logsService.createLog(
                    'TELEGRAM',
                    'WARNING',
                    `Client <${client.name}> was not notified about payment cause without telegramId`
                );
            }
        }

        if (
            foundPaymentSettings.adminTelegramIds &&
            Array.isArray(foundPaymentSettings.adminTelegramIds) &&
            foundPaymentSettings.adminTelegramIds.length > 0 &&
            clientSummaries.length > 0
        ) {
            const todayDate = startOfTodayMSK.toLocaleDateString('en-US');
            const totalRevenue = clientSummaries.reduce((sum, c) => sum + c.totalPrice, 0);

            let adminMessage = `<b>📊 Payment Reminder Summary for ${todayDate}</b>\n\n`;
            adminMessage += `<b>Clients with expiring configurations (total: ${clientSummaries.length}):</b>\n`;

            clientSummaries.forEach((c, idx) => {
                const deviceText = c.configsCount === 1 ? 'device' : 'devices';
                adminMessage += `${idx + 1}. ${c.name} for ${c.configsCount} ${deviceText} — ${c.totalPrice}₽\n`;
            });

            adminMessage += `\n<b>💰 Total expected revenue:</b> ${totalRevenue}₽`;

            for (const adminId of foundPaymentSettings.adminTelegramIds as string[]) {
                try {
                    await telegramService.sendMessage(
                        { chatId: adminId, text: adminMessage, parseMode: 'HTML' },
                        `Admin ${adminId}`
                    );
                } catch (err) {
                    await logsService.createLog(
                        'TELEGRAM',
                        'ERROR',
                        `Failed to send admin notification to ${adminId}: ${err}`
                    );
                }
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
