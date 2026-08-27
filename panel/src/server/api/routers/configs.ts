import { z } from 'zod';

import { createTRPCRouter, protectedProcedureWithRole } from '@/server/api/trpc';
import {
    createConfigSchema,
    reissueConfigSchema,
    updateClientConfigSchema,
    updateExpiresAtSchema,
} from '@/lib/schemas/configs';
import type { CreateClientResponse } from '@/server/interfaces/amnezia-api';
import { amneziaApiService } from '@/server/services/amnezia-api';
import { protocolsApiMapping, protocolsMapping } from '@/lib/data/mappings';
import { encryptionService } from '@/server/services/encryption';
import { readProtocolVersion } from '@/server/services/vpn-config';
import { TRPCError } from '@trpc/server';
import { logsService } from '@/server/services/logs';
import { Protocols } from 'prisma/generated/enums';
import { format } from 'date-fns';
import { telegramService } from '@/server/services/telegram/telegram';
import {
    purgeKeyMessagesForConfigs,
    recordKeyMessage,
} from '@/server/services/telegram/key-messages';

/**
 * Takes the key back out of the client's Telegram chat once the config behind it is dead.
 *
 * Best effort by design: the config is already revoked on the VPN server by the time this
 * runs, so a Telegram outage must not turn a successful revocation into an error. What it
 * cannot do is silently: a key older than 48 hours stays in the chat forever, and that
 * fact belongs in the log rather than in nobody's head.
 */
async function withdrawSentKeys(
    ctx: { session: { user: { id: string } } },
    configIds: string[],
    label: string
): Promise<void> {
    try {
        const purged = await purgeKeyMessagesForConfigs(configIds);

        if (purged.deleted > 0)
            await logsService.createLog(
                'TELEGRAM',
                'INFO',
                `${purged.deleted} Telegram message(s) with the key of <${label}> deleted from the client chat`,
                ctx.session.user.id
            );

        if (purged.expired > 0)
            await logsService.createLog(
                'TELEGRAM',
                'WARNING',
                `${purged.expired} Telegram message(s) with the key of <${label}> stayed in the client chat: older than 48 hours and no longer deletable by the bot`,
                ctx.session.user.id
            );
    } catch (error) {
        await logsService.createLog(
            'TELEGRAM',
            'WARNING',
            `Could not withdraw the sent key of <${label}> from Telegram: ${error instanceof Error ? error.message : 'Unknown error'}`,
            ctx.session.user.id
        );
    }
}

export const configsRouter = createTRPCRouter({
    createConfig: protectedProcedureWithRole('ADMIN')
        .input(createConfigSchema)
        .mutation(async ({ ctx, input }) => {
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
                    protocolVersion: readProtocolVersion(createdConfig.client.config),
                    vpnKey: encryptedVpnKey,
                },
            });

            await logsService.createLog(
                'CLIENT',
                'INFO',
                `Config <${clientName}> created`,
                ctx.session.user.id
            );
        }),

    updateClientConfig: protectedProcedureWithRole('ADMIN')
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
                `Config <${updatedConfig.clientName}> updated`,
                ctx.session.user.id
            );
        }),

    deleteConfig: protectedProcedureWithRole('ADMIN')
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

            await withdrawSentKeys(ctx, [id], deletedConfig?.clientName ?? id);

            await logsService.createLog(
                'CLIENT',
                'WARNING',
                `Config <${deletedConfig?.clientName || 'that does not exist in database'}> deleted`,
                ctx.session.user.id
            );
        }),

    getVpnKey: protectedProcedureWithRole('ADMIN')
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const { id } = input;

            const foundConfig = await ctx.db.configs.findUnique({
                where: { id },
                select: { vpnKey: true },
            });

            return await encryptionService.decryptField(foundConfig?.vpnKey);
        }),

    sendVpnKey: protectedProcedureWithRole('ADMIN')
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
                    Clients: { select: { id: true, name: true, telegramId: true, language: true } },
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
                ? foundConfig.Clients.language === 'ENGLISH'
                    ? format(new Date(Number(foundConfig.expiresAt) * 1000), 'MM/dd/yyyy')
                    : format(new Date(Number(foundConfig.expiresAt) * 1000), 'dd.MM.yyyy')
                : 'Not set';

            const message =
                foundConfig.Clients.language === 'ENGLISH'
                    ? `
🔐 New VPN configuration for <b>${foundConfig.clientName.startsWith(foundConfig.Clients.name) ? foundConfig.clientName.split('-')[1] : foundConfig.clientName}</b> from Ne4VPN
Protocol: <b>${protocolsMapping[foundConfig.protocol] || 'Not specified'}</b>
Expiration date: <b>${expiryDate}</b>
<code>${decryptedVpnKey}</code>`
                    : `
🔐 Новый VPN ключ для <b>${foundConfig.clientName.startsWith(foundConfig.Clients.name) ? foundConfig.clientName.split('-')[1] : foundConfig.clientName}</b> от Ne4VPN
Протокол: <b>${protocolsMapping[foundConfig.protocol] || 'Не указан'}</b>
Дата истечения: <b>${expiryDate}</b>
<code>${decryptedVpnKey}</code>`;

            const sent = await telegramService.sendMessage(
                {
                    chatId: foundConfig.Clients.telegramId,
                    text: message,
                    parseMode: 'HTML',
                },
                foundConfig.Clients.name
            );

            await recordKeyMessage(
                foundConfig.Clients.telegramId,
                sent.message_id,
                [id],
                foundConfig.Clients.id
            );

            await logsService.createLog(
                'TELEGRAM',
                'INFO',
                `VPN key of <${foundConfig?.clientName}> sent`,
                ctx.session.user.id
            );
        }),

    /**
     * Deletes the messages that delivered this key from the client's Telegram chat, for
     * when a key was sent to the wrong person or the chat is no longer trusted.
     *
     * Removing the message does not revoke access — anyone who already copied the key can
     * keep using it. Pair it with a reissue when the key is actually compromised.
     */
    purgeSentKeys: protectedProcedureWithRole('ADMIN')
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const { id } = input;

            const foundConfig = await ctx.db.configs.findUnique({
                where: { id },
                select: { clientName: true },
            });
            if (!foundConfig)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Config not found' });

            const purged = await purgeKeyMessagesForConfigs([id]);

            await logsService.createLog(
                'TELEGRAM',
                purged.expired > 0 || purged.failed > 0 ? 'WARNING' : 'INFO',
                `Sent keys of <${foundConfig.clientName}> withdrawn from Telegram: ${purged.deleted} deleted, ${purged.expired} too old, ${purged.failed} failed`,
                ctx.session.user.id
            );

            return purged;
        }),

    /**
     * Replaces a broken config with a fresh one in a single step, keeping the client
     * assignment, protocol, server and expiration date, and returns the new key together
     * with its QR code so it can be forwarded to the client right away.
     */
    reissueConfig: protectedProcedureWithRole('ADMIN')
        .input(reissueConfigSchema)
        .mutation(async ({ ctx, input }) => {
            const { id } = input;

            const oldConfig = await ctx.db.configs.findUnique({
                where: { id },
                select: {
                    serverId: true,
                    clientId: true,
                    clientName: true,
                    protocol: true,
                    expiresAt: true,
                },
            });
            if (!oldConfig)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Config not found' });

            const expiresAt = input.expiresAt ?? oldConfig.expiresAt;
            if (!expiresAt)
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Config has no expiration date, provide one to reissue it',
                });

            const apiProtocol = protocolsApiMapping[oldConfig.protocol];

            // The new config is created first: if this fails, the client keeps the old one.
            let clientName = oldConfig.clientName;
            let createdConfig: CreateClientResponse;

            try {
                createdConfig = await amneziaApiService.createConfig(
                    oldConfig.serverId,
                    clientName,
                    apiProtocol,
                    Number(expiresAt)
                );
            } catch (error) {
                if (!(error instanceof TRPCError) || error.code !== 'CONFLICT') throw error;

                // The server rejects a duplicate name while the old config still exists.
                clientName = `${oldConfig.clientName}-r${Date.now().toString(36).slice(-4)}`;
                createdConfig = await amneziaApiService.createConfig(
                    oldConfig.serverId,
                    clientName,
                    apiProtocol,
                    Number(expiresAt)
                );
            }

            // From here on the replacement already works, so failures are logged, not thrown.
            try {
                await amneziaApiService.deleteConfig(oldConfig.serverId, id, apiProtocol);
            } catch (error) {
                await logsService.createLog(
                    'SERVER',
                    'WARNING',
                    `Config <${oldConfig.clientName}> was reissued but the old one could not be removed from the server: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    ctx.session.user.id
                );
            }

            const encryptedVpnKey = encryptionService.encrypt(createdConfig.client.config);

            await ctx.db.$transaction([
                ctx.db.configs.delete({ where: { id } }),
                ctx.db.configs.create({
                    data: {
                        id: createdConfig.client.id,
                        serverId: oldConfig.serverId,
                        clientId: oldConfig.clientId,
                        clientName,
                        expiresAt,
                        protocol: oldConfig.protocol,
                        protocolVersion: readProtocolVersion(createdConfig.client.config),
                        vpnKey: encryptedVpnKey,
                    },
                }),
            ]);

            let qrCode: Awaited<ReturnType<typeof amneziaApiService.generateQrCode>> | null = null;
            try {
                qrCode = await amneziaApiService.generateQrCode(
                    oldConfig.serverId,
                    createdConfig.client.config
                );
            } catch {
                // The key alone is enough to hand over, the QR code is a convenience.
            }

            // The point of a reissue is that the old key is compromised or broken, so
            // leaving it readable in the chat defeats the exercise.
            await withdrawSentKeys(ctx, [id], oldConfig.clientName);

            await logsService.createLog(
                'CLIENT',
                'INFO',
                `Config <${clientName}> reissued`,
                ctx.session.user.id
            );

            return {
                id: createdConfig.client.id,
                clientName,
                vpnKey: createdConfig.client.config,
                qrCode,
            };
        }),

    updateExpiresAt: protectedProcedureWithRole('ADMIN')
        .input(updateExpiresAtSchema)
        .mutation(async ({ ctx, input }) => {
            const { id, expiresAt } = input;

            const foundConfig = await ctx.db.configs.findUnique({
                where: { id },
                select: { serverId: true, clientName: true, protocol: true },
            });
            if (!foundConfig)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Config not found' });

            await amneziaApiService.updateConfig(
                foundConfig.serverId,
                id,
                protocolsApiMapping[foundConfig.protocol],
                expiresAt
            );

            if (foundConfig) {
                await ctx.db.configs.update({
                    where: { id },
                    data: { expiresAt },
                });
            }

            await logsService.createLog(
                'CLIENT',
                'INFO',
                `Config <${foundConfig.clientName}> date was changed`,
                ctx.session.user.id
            );
        }),

    updateStatus: protectedProcedureWithRole('ADMIN')
        .input(
            z.object({
                id: z.string().min(1),
                serverId: z.number(),
                protocol: z.enum(Protocols),
                status: z.enum(['active', 'disabled']),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { id, serverId, protocol, status } = input;

            // The server is the source of truth: configs created outside the panel are
            // listed in the UI but have no local row, so this must not depend on one.
            await amneziaApiService.updateConfig(
                serverId,
                id,
                protocolsApiMapping[protocol],
                undefined,
                status
            );

            const foundConfig = await ctx.db.configs.findUnique({
                where: { id },
                select: { clientName: true },
            });

            if (foundConfig) {
                await ctx.db.configs.update({
                    where: { id },
                    data: { status: status === 'active' },
                });
            }

            await logsService.createLog(
                'CLIENT',
                'INFO',
                `Config <${foundConfig?.clientName || 'that does not exist in database'}> status was changed`,
                ctx.session.user.id
            );
        }),

    generateQrCode: protectedProcedureWithRole('ADMIN')
        .input(z.object({ id: z.string().min(1) }))
        .query(async ({ ctx, input }) => {
            const { id } = input;

            const foundConfig = await ctx.db.configs.findUnique({
                where: { id },
                select: { serverId: true, vpnKey: true },
            });
            if (!foundConfig)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Config not found' });

            const decryptedVpnKey = encryptionService.decryptField(foundConfig.vpnKey);
            if (!decryptedVpnKey)
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'VPN Config not found' });

            return await amneziaApiService.generateQrCode(foundConfig.serverId, decryptedVpnKey);
        }),
});
