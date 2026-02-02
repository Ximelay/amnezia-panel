import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '@/server/api/trpc';
import { createConfigSchema, updateClientConfigSchema } from '@/lib/schemas/configs';
import { amneziaApiService } from '@/server/services/amnezia-api';
import { protocolsApiMapping, protocolsMapping } from '@/lib/data/mappings';
import { encryptionService } from '@/server/services/encryption';
import { TRPCError } from '@trpc/server';
import { logsService } from '@/server/services/logs';
import { Protocols } from 'prisma/generated/enums';
import { format } from 'date-fns';
import { telegramService } from '@/server/services/telegram/telegram';

export const configsRouter = createTRPCRouter({
    createConfig: publicProcedure.input(createConfigSchema).mutation(async ({ ctx, input }) => {
        const { clientId, serverId, clientName, expiresAt, protocol } = input;

        const createdConfig = await amneziaApiService.createConfig(
            Number(serverId),
            clientName,
            protocolsApiMapping[protocol],
            Number(expiresAt)
        );

        const encryptedVpnKey = encryptionService.encrypt(createdConfig.client.config);

        await ctx.db.configs.create({
            data: {
                id: createdConfig.client.id,
                serverId: Number(serverId),
                clientId: Number(clientId) || null,
                clientName,
                expiresAt,
                protocol,
                vpnKey: encryptedVpnKey,
            },
        });

        await logsService.createLog('CLIENT', 'INFO', `Config ${clientName} created`);
    }),

    updateClientConfig: publicProcedure
        .input(updateClientConfigSchema)
        .mutation(async ({ ctx, input }) => {
            const { id, clientId } = input;

            const updatedConfig = await ctx.db.configs.update({
                where: { id },
                data: { clientId: Number(clientId) },
                select: { clientName: true },
            });

            await logsService.createLog(
                'CLIENT',
                'INFO',
                `Config ${updatedConfig.clientName} updated`
            );
        }),

    deleteConfig: publicProcedure
        .input(z.object({ serverId: z.number(), id: z.string(), protocol: z.enum(Protocols) }))
        .mutation(async ({ ctx, input }) => {
            const { serverId, id, protocol } = input;

            const foundConfig = await ctx.db.configs.findUnique({
                where: { id },
                select: { serverId: true, protocol: true },
            });

            await amneziaApiService.deleteConfig(serverId, id, protocolsApiMapping[protocol]);

            let deletedConfig: {
                clientName: string;
            } | null = null;

            if (foundConfig) {
                deletedConfig = await ctx.db.configs.delete({
                    where: { id },
                    select: { clientName: true },
                });
            }

            await logsService.createLog(
                'CLIENT',
                'WARNING',
                `Config ${deletedConfig?.clientName || 'that does not exist in database'} deleted`
            );
        }),

    getVpnKey: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
        const { id } = input;

        const foundConfig = await ctx.db.configs.findUnique({
            where: { id },
            select: { vpnKey: true },
        });

        return await encryptionService.decryptField(foundConfig?.vpnKey);
    }),

    sendVpnKey: publicProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const { id } = input;

            const foundConfig = await ctx.db.configs.findUnique({
                where: { id },
                select: {
                    vpnKey: true,
                    clientName: true,
                    expiresAt: true,
                    protocol: true,
                    Clients: { select: { name: true, telegramId: true } },
                },
            });
            if (!foundConfig)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Config not found' });

            if (!foundConfig.Clients?.telegramId)
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Client does not have a Telegram Chat ID',
                });

            const decryptedVpnKey = encryptionService.decryptField(foundConfig.vpnKey);
            const expiryDate = foundConfig.expiresAt
                ? format(new Date(Number(foundConfig.expiresAt) * 1000), 'MM/dd/yyyy')
                : 'Not set';

            const message = `
🔐 New VPN configuration for <b>${foundConfig.clientName.startsWith(foundConfig.Clients.name) ? foundConfig.clientName.split('-')[1] : foundConfig.clientName}</b> from Ne4VPN
Protocol: <b>${protocolsMapping[foundConfig.protocol] || 'Not specified'}</b>
Expiration date: <b>${expiryDate}</b>
<code>${decryptedVpnKey}</code>`;

            await telegramService.sendMessage(
                {
                    chatId: foundConfig.Clients.telegramId,
                    text: message,
                    parseMode: 'HTML',
                },
                foundConfig.Clients.name
            );

            await logsService.createLog(
                'TELEGRAM',
                'INFO',
                `VPN key of ${foundConfig?.clientName} sent`
            );
        }),
});
