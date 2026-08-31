import { z } from 'zod';
import crypto from 'node:crypto';

import { createTRPCRouter, protectedProcedureWithRole } from '@/server/api/trpc';
import type { ProtocolsFilter } from '@/server/enums';
import type { Languages, Prisma } from 'prisma/generated/client';
import {
    createClientSchema,
    sendNotificationSchema,
    updateClientSchema,
} from '@/lib/schemas/clients';
import { amneziaApiService } from '@/server/services/amnezia-api';
import { apiProtocolsMapping, protocolsApiMapping } from '@/lib/data/mappings';
import { encryptionService } from '@/server/services/encryption';
import type { IPeer } from '@/server/interfaces/amnezia-api';
import { logsService } from '@/server/services/logs';
import { TRPCError } from '@trpc/server';
import { sendConfigsToTelegram } from '@/server/services/telegram/telegram-messages';
import { purgeKeyMessagesForClient } from '@/server/services/telegram/key-messages';
import { telegramService } from '@/server/services/telegram/telegram';
import { processUpdates } from '@/server/services/telegram/bot';
import { appsMessage } from '@/server/services/telegram/bot/texts';
import { updateExpiresAtSchema } from '@/lib/schemas/configs';
import { Protocols } from 'prisma/generated/enums';
import { readProtocolVersion } from '@/server/services/vpn-config';

/**
 * Stores a hand-entered chat id the way the bot will look it up.
 *
 * The field is free text, and Telegram accepts a padded id when the panel sends to it, so
 * a stray space survives unnoticed until the bot's exact match fails and the client is
 * told they are not linked. An empty field becomes null rather than "", so "no chat id"
 * stays one value instead of two.
 */
function normaliseTelegramId(value: string | undefined): string | null {
    const trimmed = value?.trim();

    return trimmed ? trimmed : null;
}

/**
 * Refuses to give one Telegram chat to two clients.
 *
 * The bot identifies who is asking by chat id alone, so a shared id leaves it unable to
 * tell whose keys to hand out, and it stops serving that chat entirely. The panel used to
 * allow this silently — and the duplicate is invisible in the table, which is scoped to
 * one server — so the first sign of trouble was a client whose bot had stopped working.
 *
 * Not a database constraint: the column may already hold duplicates on a running panel,
 * and `db push` runs unattended on every container start, so adding one there could
 * strand a deployment. This closes the door for new writes; existing pairs are reported
 * by the bot's log.
 */
async function assertTelegramIdFree(
    db: Prisma.TransactionClient,
    telegramId: string | null,
    exceptClientId?: number
): Promise<void> {
    if (!telegramId) return;

    const taken = await db.clients.findFirst({
        where: {
            telegramId,
            ...(exceptClientId !== undefined && { id: { not: exceptClientId } }),
        },
        select: { id: true, name: true },
    });

    if (taken)
        throw new TRPCError({
            code: 'CONFLICT',
            message: `Telegram chat ${telegramId} already belongs to client "${taken.name}". A client is one row with configs on any number of servers — add the config to that client instead of creating a second one.`,
        });
}

// Telegram keeps unconfirmed updates for 24 hours, so a longer link would outlive the
// update it is meant to be matched against.
const TELEGRAM_LINK_TTL_MS = 24 * 60 * 60 * 1000;

export const clientsRouter = createTRPCRouter({
    /**
     * Every client, for the pickers that attach a config to one.
     *
     * Deliberately not scoped to a server. It used to be, and that is what produced
     * duplicate client rows: adding a config on a second server did not offer the clients
     * who only had configs on the first, so the only way forward from that dialog was to
     * create the same person again. A client is one row with configs on any number of
     * servers, and this list has to reflect that.
     *
     * The server-scoped view of who exists is `getClientsWithConfigs`, which is what the
     * table renders.
     */
    getClients: protectedProcedureWithRole('ADMIN').query(async ({ ctx }) => {
        return await ctx.db.clients.findMany({
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
    }),

    getClientsWithConfigs: protectedProcedureWithRole('ADMIN')
        .input(
            z.object({
                serverId: z.string().optional(),
                search: z.string().optional(),
                protocolFilter: z.string() as z.ZodType<ProtocolsFilter>,
            })
        )
        .query(async ({ ctx, input }) => {
            const { search, protocolFilter } = input;
            const serverId = Number(input.serverId);
            if (!serverId) return;

            const apiConfigs = await amneziaApiService.getConfigs(serverId);

            const apiDevicesMap = new Map<string, IPeer>();
            const apiDevices: Array<{
                id: string;
                clientName: string;
                device: IPeer;
            }> = [];

            for (const user of apiConfigs.items) {
                for (const device of user.peers) {
                    apiDevicesMap.set(device.id, device);
                    apiDevices.push({
                        id: device.id,
                        clientName: user.username,
                        device: device,
                    });
                }
            }

            const baseWhereConditions: Prisma.ConfigsWhereInput = {
                serverId: serverId,
            };

            const [configsFromDb, clients] = await Promise.all([
                ctx.db.configs.findMany({
                    where: baseWhereConditions,
                    select: {
                        id: true,
                        createdAt: true,
                        clientName: true,
                        expiresAt: true,
                        protocol: true,
                        protocolVersion: true,
                        clientId: true,
                        serverId: true,
                        status: true,
                    },
                    orderBy: {
                        expiresAt: 'asc',
                    },
                }),
                ctx.db.clients.findMany({
                    where: {
                        Configs: {
                            some: { serverId },
                        },
                    },
                    include: {
                        Configs: { select: { expiresAt: true } },
                    },
                }),
            ]);

            // Rows created before the version was recorded still carry it inside their
            // encrypted key, so fill them in once instead of leaving a permanent gap.
            const missingVersion = configsFromDb.filter(
                (config) => !config.protocolVersion && config.protocol === Protocols.AMNEZIAWG2
            );

            if (missingVersion.length) {
                const storedKeys = await ctx.db.configs.findMany({
                    where: { id: { in: missingVersion.map((config) => config.id) } },
                    select: { id: true, vpnKey: true },
                });
                const keysById = new Map(storedKeys.map((row) => [row.id, row.vpnKey]));

                await Promise.all(
                    missingVersion.map(async (config) => {
                        let version: string | null = null;

                        try {
                            version = readProtocolVersion(
                                encryptionService.decryptField(keysById.get(config.id))
                            );
                        } catch {
                            // A key written under a different ENCRYPTION_KEY is not
                            // something a listing should fail on.
                        }

                        if (!version) return;

                        config.protocolVersion = version;
                        await ctx.db.configs.update({
                            where: { id: config.id },
                            data: { protocolVersion: version },
                        });
                    })
                );
            }

            // The API exposes no server-side version, so the most recently issued config
            // stands in for what this server currently hands out. Anything older than
            // that was issued before the server was upgraded.
            const serverProtocolVersion =
                [...configsFromDb]
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                    .find((config) => config.protocolVersion)?.protocolVersion ?? null;

            const isOutdated = (version: string | null) =>
                !!version && !!serverProtocolVersion && version !== serverProtocolVersion;

            const mergedConfigs = configsFromDb.map((config) => {
                const apiDevice = apiDevicesMap.get(config.id);

                if (apiDevice) {
                    return {
                        ...config,
                        protocolOutdated: isOutdated(config.protocolVersion),
                        status: apiDevice.status === 'active' ? true : false,
                        online: apiDevice.online,
                        lastHandshake: String(apiDevice.lastHandshake),
                        traffic: apiDevice.traffic,
                        allowedIps: apiDevice.allowedIps,
                        endpoint: apiDevice.endpoint,
                        expiresAt: String(apiDevice.expiresAt) || config.expiresAt,
                        protocol: apiProtocolsMapping[apiDevice.protocol],
                        source: 'db',
                    };
                }

                return {
                    ...config,
                    protocolOutdated: isOutdated(config.protocolVersion),
                    status: false,
                    online: false,
                    lastHandshake: null,
                    traffic: { received: 0, sent: 0 },
                    allowedIps: [],
                    endpoint: null,
                    expiresAt: config.expiresAt,
                    source: 'db',
                };
            });

            const dbConfigIds = new Set(configsFromDb.map((c) => c.id));

            for (const apiDevice of apiDevices) {
                if (!dbConfigIds.has(apiDevice.id)) {
                    mergedConfigs.push({
                        id: apiDevice.id,
                        createdAt: new Date(),
                        status: apiDevice.device.status === 'active' ? true : false,
                        clientName: apiDevice.clientName,
                        expiresAt: apiDevice.device.expiresAt
                            ? String(apiDevice.device.expiresAt)
                            : null,
                        protocol: apiProtocolsMapping[apiDevice.device.protocol],
                        // Configs that exist only on the server were never issued through
                        // the panel, so there is no stored key to read a version out of.
                        protocolVersion: null,
                        protocolOutdated: false,
                        clientId: null,
                        serverId,
                        online: apiDevice.device.online,
                        lastHandshake: String(apiDevice.device.lastHandshake),
                        traffic: apiDevice.device.traffic,
                        allowedIps: apiDevice.device.allowedIps,
                        endpoint: apiDevice.device.endpoint,
                        source: 'api',
                    });
                }
            }

            let filteredConfigs = mergedConfigs;

            if (search) {
                const searchLower = search.toLowerCase();
                filteredConfigs = filteredConfigs.filter((config) =>
                    config.clientName.toLowerCase().includes(searchLower)
                );
            }

            if (protocolFilter && protocolFilter !== 'All') {
                filteredConfigs = filteredConfigs.filter(
                    (config) => config.protocol === protocolFilter
                );
            }

            const configsByClientId = new Map<string, typeof filteredConfigs>();
            for (const config of filteredConfigs) {
                const clientId = String(config.clientId);

                if (clientId && clientId !== 'null') {
                    if (!configsByClientId.has(clientId)) configsByClientId.set(clientId, []);

                    configsByClientId.get(clientId)!.push(config);
                }
            }

            const sortedClients = (clients || []).sort((a, b) => {
                const getMinExpiry = (client: typeof a) => {
                    const configs = configsByClientId.get(String(client.id)) || [];

                    const timestamps = configs
                        .map((c) => {
                            if (!c.expiresAt) return null;
                            const ts = new Date(c.expiresAt).getTime();
                            return isNaN(ts) ? null : ts;
                        })
                        .filter((t): t is number => t !== null);

                    return timestamps.length ? Math.min(...timestamps) : Infinity;
                };

                return getMinExpiry(a) - getMinExpiry(b);
            });

            const clientsWithConfigs = sortedClients.map((client) => {
                const clientConfigs = configsByClientId.get(String(client.id)) || [];
                return {
                    id: client.id,
                    createdAt: client.createdAt,
                    name: client.name,
                    language: client.language,
                    status: client.status,
                    telegramId: client.telegramId,
                    configs: clientConfigs,
                    configsCount: clientConfigs.length,
                };
            });

            const orphanConfigs = filteredConfigs.filter((config) => !config.clientId);

            return {
                clients: clientsWithConfigs,
                orphanConfigs,
                totalClients: clients.length,
            };
        }),

    createClient: protectedProcedureWithRole('ADMIN')
        .input(createClientSchema)
        .mutation(async ({ ctx, input }) => {
            const { name, language, telegramId, configs } = input;

            const chatId = normaliseTelegramId(telegramId);
            await assertTelegramIdFree(ctx.db, chatId);

            const createdClient = await ctx.db.clients.create({
                data: { name, language: language as Languages, telegramId: chatId },
            });

            for (const config of configs) {
                const createdConfig = await amneziaApiService.createConfig(
                    Number(config.serverId),
                    config.clientName,
                    protocolsApiMapping[config.protocol],
                    Number(config.expiresAt)
                );

                const encryptedVpnKey = encryptionService.encrypt(createdConfig.client.config);

                await ctx.db.configs.create({
                    data: {
                        id: createdConfig.client.id,
                        clientName: config.clientName,
                        vpnKey: encryptedVpnKey,
                        protocol: config.protocol,
                        expiresAt: config.expiresAt,
                        clientId: createdClient.id,
                        serverId: Number(config.serverId),
                    },
                });

                await logsService.createLog(
                    'CLIENT',
                    'INFO',
                    `Config <${config.clientName}> created`,
                    ctx.session.user.id
                );
            }

            await logsService.createLog(
                'CLIENT',
                'INFO',
                `Client <${createdClient.name}> created`,
                ctx.session.user.id
            );
        }),

    updateClient: protectedProcedureWithRole('ADMIN')
        .input(updateClientSchema)
        .mutation(async ({ ctx, input }) => {
            const { id, name, telegramId } = input;

            const chatId = normaliseTelegramId(telegramId);
            await assertTelegramIdFree(ctx.db, chatId, id);

            const updatedClient = await ctx.db.clients.update({
                where: { id },
                data: { name, telegramId: chatId },
                select: { name: true },
            });

            await logsService.createLog(
                'CLIENT',
                'INFO',
                `Client <${updatedClient.name}> updated`,
                ctx.session.user.id
            );
        }),

    deleteClient: protectedProcedureWithRole('ADMIN')
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const { id } = input;

            const foundConfigs = await ctx.db.configs.findMany({
                where: { clientId: id },
                select: { id: true, serverId: true, protocol: true },
            });

            for (const config of foundConfigs) {
                await amneziaApiService.deleteConfig(
                    Number(config.serverId),
                    config.id,
                    protocolsApiMapping[config.protocol]
                );
            }

            await ctx.db.configs.deleteMany({
                where: { clientId: id },
            });

            // Before the client row goes: its keys are dead now, so the messages carrying
            // them are pure liability. Failing here must not abort the deletion itself.
            let purged: Awaited<ReturnType<typeof purgeKeyMessagesForClient>> | null = null;
            try {
                purged = await purgeKeyMessagesForClient(id);
            } catch (error) {
                await logsService.createLog(
                    'TELEGRAM',
                    'WARNING',
                    `Could not withdraw sent keys while deleting client ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    ctx.session.user.id
                );
            }

            const deletedClient = await ctx.db.clients.delete({
                where: { id },
                select: { name: true },
            });

            await logsService.createLog(
                'CLIENT',
                'WARNING',
                `Client <${deletedClient.name}> deleted`,
                ctx.session.user.id
            );

            if (purged && purged.expired > 0)
                await logsService.createLog(
                    'TELEGRAM',
                    'WARNING',
                    `${purged.expired} key message(s) of <${deletedClient.name}> stayed in Telegram: older than 48 hours and no longer deletable by the bot`,
                    ctx.session.user.id
                );
        }),

    sendKeysForClient: protectedProcedureWithRole('ADMIN')
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const { id } = input;

            const foundClient = await ctx.db.clients.findUnique({
                where: { id },
                select: {
                    name: true,
                    telegramId: true,
                    language: true,
                    Configs: {
                        select: {
                            id: true,
                            vpnKey: true,
                            clientName: true,
                            protocol: true,
                            expiresAt: true,
                        },
                    },
                },
            });

            if (!foundClient)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });

            if (!foundClient.telegramId)
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Client has no Telegram chat id yet, bind one with the link button',
                });

            if (foundClient.Configs.length === 0) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No VPN configurations found for this client',
                });
            }

            await sendConfigsToTelegram(
                foundClient.name,
                foundClient.telegramId,
                foundClient.language,
                foundClient.Configs,
                id
            );

            await logsService.createLog(
                'TELEGRAM',
                'INFO',
                `VPN keys sent for client <${foundClient.name}>`,
                ctx.session.user.id
            );
        }),

    sendAllKeys: protectedProcedureWithRole('ADMIN').mutation(async ({ ctx }) => {
        const foundClients = await ctx.db.clients.findMany({
            select: {
                id: true,
                name: true,
                telegramId: true,
                language: true,
                Configs: {
                    select: {
                        id: true,
                        vpnKey: true,
                        clientName: true,
                        protocol: true,
                        expiresAt: true,
                    },
                },
            },
        });

        if (!foundClients) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clients not found' });

        for (const foundClient of foundClients) {
            if (foundClient.Configs.length === 0 || !foundClient.telegramId) {
                await logsService.createLog(
                    'TELEGRAM',
                    'WARNING',
                    `VPN keys not sent for client <${foundClient.name}>`,
                    ctx.session.user.id
                );
                continue;
            }

            await sendConfigsToTelegram(
                foundClient.name,
                foundClient.telegramId,
                foundClient.language,
                foundClient.Configs,
                foundClient.id
            );
        }

        await logsService.createLog(
            'TELEGRAM',
            'INFO',
            `VPN keys sent for clients`,
            ctx.session.user.id
        );
    }),

    sendDownloadLinks: protectedProcedureWithRole('ADMIN')
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const { id } = input;

            const foundClient = await ctx.db.clients.findUnique({
                where: { id },
                select: { telegramId: true, name: true, language: true },
            });
            if (!foundClient?.telegramId)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });

            await telegramService.sendMessage(
                {
                    chatId: foundClient.telegramId,
                    text: appsMessage(foundClient.language),
                    parseMode: 'HTML',
                },
                foundClient.name
            );

            await logsService.createLog(
                'TELEGRAM',
                'INFO',
                `Links sent for client <${foundClient.name}>`,
                ctx.session.user.id
            );
        }),

    sendNotification: protectedProcedureWithRole('ADMIN')
        .input(sendNotificationSchema)
        .mutation(async ({ ctx, input }) => {
            const { clientId, message } = input;

            if (clientId === 'All Russian' || clientId === 'All English') {
                const language = clientId === 'All Russian' ? 'RUSSIAN' : 'ENGLISH';

                const clients = await ctx.db.clients.findMany({
                    where: { language },
                    select: { telegramId: true, name: true },
                });

                const validClients = clients.filter((client) => client.telegramId);

                const BATCH_SIZE = 10;

                for (let i = 0; i < validClients.length; i += BATCH_SIZE) {
                    const batch = validClients.slice(i, i + BATCH_SIZE);

                    await Promise.allSettled(
                        batch.map((client) =>
                            telegramService.sendMessage(
                                {
                                    chatId: client.telegramId!,
                                    text: message,
                                    parseMode: 'HTML',
                                },
                                client.name
                            )
                        )
                    );

                    if (i + BATCH_SIZE < validClients.length) {
                        await new Promise((resolve) => setTimeout(resolve, 100));
                    }
                }

                await logsService.createLog(
                    'TELEGRAM',
                    'INFO',
                    `Mass notification sent to ${validClients.length} ${language.toLowerCase()} clients`,
                    ctx.session.user.id
                );
            } else {
                const foundClient = await ctx.db.clients.findUnique({
                    where: { id: Number(clientId) },
                    select: { telegramId: true, name: true },
                });

                if (!foundClient?.telegramId) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'Client not found or has no Telegram ID',
                    });
                }

                await telegramService.sendMessage(
                    {
                        chatId: foundClient.telegramId,
                        text: message,
                        parseMode: 'HTML',
                    },
                    foundClient.name
                );

                await logsService.createLog(
                    'TELEGRAM',
                    'INFO',
                    `Notification sent to client <${foundClient.name}>`,
                    ctx.session.user.id
                );
            }
        }),

    updateExpiresAt: protectedProcedureWithRole('ADMIN')
        .input(updateExpiresAtSchema)
        .mutation(async ({ ctx, input }) => {
            const { id, expiresAt } = input;

            const foundClient = await ctx.db.clients.findUnique({
                where: { id: Number(id) },
                select: {
                    name: true,
                    Configs: { select: { id: true, serverId: true, protocol: true } },
                },
            });
            if (!foundClient)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });

            for (const config of foundClient.Configs)
                await amneziaApiService.updateConfig(
                    config.serverId,
                    config.id,
                    protocolsApiMapping[config.protocol],
                    expiresAt
                );

            await ctx.db.configs.updateMany({
                where: { clientId: Number(id) },
                data: { expiresAt },
            });

            await logsService.createLog(
                'CLIENT',
                'INFO',
                `Dates of config were changed for client <${foundClient.name}>`,
                ctx.session.user.id
            );
        }),

    updateStatus: protectedProcedureWithRole('ADMIN')
        .input(z.object({ clientId: z.number().min(1), status: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            const { clientId, status } = input;

            const foundClient = await ctx.db.clients.findUnique({
                where: { id: clientId },
                select: {
                    name: true,
                    Configs: { select: { id: true, serverId: true, protocol: true } },
                },
            });
            if (!foundClient)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });

            for (const config of foundClient.Configs)
                await amneziaApiService.updateConfig(
                    config.serverId,
                    config.id,
                    protocolsApiMapping[config.protocol],
                    undefined,
                    status
                );

            await ctx.db.clients.update({
                where: { id: clientId },
                data: { status: status === 'active' ? true : false },
            });

            await ctx.db.configs.updateMany({
                where: { clientId },
                data: { status: status === 'active' ? true : false },
            });

            await logsService.createLog(
                'CLIENT',
                'INFO',
                `Statuses of config were changed for client <${foundClient.name}>`,
                ctx.session.user.id
            );
        }),

    /**
     * Returns the still-valid deep link for a client, if one is pending. Without this the
     * dialog would forget an issued link as soon as it is closed, and the admin would have
     * to reissue it — invalidating the payload the client may already have pressed Start on.
     */
    getTelegramLink: protectedProcedureWithRole('ADMIN')
        .input(z.object({ id: z.number().min(1) }))
        .query(async ({ ctx, input }) => {
            const foundClient = await ctx.db.clients.findUnique({
                where: { id: input.id },
                select: { telegramLinkToken: true, telegramLinkExpiresAt: true },
            });

            if (!foundClient?.telegramLinkToken || !foundClient.telegramLinkExpiresAt) return null;
            if (foundClient.telegramLinkExpiresAt.getTime() < Date.now()) return null;

            const bot = await telegramService.getMe();
            if (!bot?.username) return null;

            return {
                url: `https://t.me/${bot.username}?start=${foundClient.telegramLinkToken}`,
                expiresAt: foundClient.telegramLinkExpiresAt.toISOString(),
            };
        }),

    /**
     * Issues a t.me deep link carrying a single-use payload. When the client presses Start,
     * Telegram delivers "/start <payload>" to the bot, which lets syncTelegramLink match the
     * chat id to this exact client without anyone having to look up a username by hand.
     */
    generateTelegramLink: protectedProcedureWithRole('ADMIN')
        .input(z.object({ id: z.number().min(1) }))
        .mutation(async ({ ctx, input }) => {
            const { id } = input;

            const foundClient = await ctx.db.clients.findUnique({
                where: { id },
                select: { name: true },
            });
            if (!foundClient)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });

            // base64url keeps the payload inside Telegram's [A-Za-z0-9_-] limit.
            const token = crypto.randomBytes(9).toString('base64url');
            const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TTL_MS);

            const bot = await telegramService.getMe();
            if (!bot?.username)
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not resolve the bot username',
                });

            await ctx.db.clients.update({
                where: { id },
                data: { telegramLinkToken: token, telegramLinkExpiresAt: expiresAt },
            });

            await logsService.createLog(
                'TELEGRAM',
                'INFO',
                `Telegram link issued for client <${foundClient.name}>`,
                ctx.session.user.id
            );

            return {
                url: `https://t.me/${bot.username}?start=${token}`,
                expiresAt: expiresAt.toISOString(),
            };
        }),

    /**
     * Drains any pending bot updates and reports whether the client is now bound.
     *
     * The binding itself happens in the bot poller, which is the only consumer allowed to
     * confirm update offsets — two readers would race, and whichever polled first would
     * hide the "/start" from the other. Running one pass here means the button still
     * works immediately even when the scheduled poll is a minute away, or not installed
     * at all.
     *
     * Returns bound:false rather than throwing when the client simply has not pressed
     * Start yet, since that is the expected state right after the link is sent.
     */
    syncTelegramLink: protectedProcedureWithRole('ADMIN')
        .input(z.object({ id: z.number().min(1) }))
        .mutation(async ({ ctx, input }) => {
            const { id } = input;

            const foundClient = await ctx.db.clients.findUnique({
                where: { id },
                select: {
                    name: true,
                    telegramId: true,
                    telegramLinkToken: true,
                    telegramLinkExpiresAt: true,
                },
            });
            if (!foundClient)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });

            if (!foundClient.telegramLinkToken && !foundClient.telegramId)
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'No pending link for this client, generate one first',
                });

            if (
                foundClient.telegramLinkToken &&
                foundClient.telegramLinkExpiresAt &&
                foundClient.telegramLinkExpiresAt.getTime() < Date.now()
            )
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'The link has expired, generate a new one',
                });

            await processUpdates();

            const bound = await ctx.db.clients.findUnique({
                where: { id },
                select: { telegramId: true },
            });

            if (!bound?.telegramId) return { bound: false as const };

            return { bound: true as const, telegramId: bound.telegramId };
        }),
});
