import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '@/server/api/trpc';
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
import { telegramService } from '@/server/services/telegram/telegram';
import { updateExpiresAtSchema } from '@/lib/schemas/configs';

export const clientsRouter = createTRPCRouter({
    getClients: publicProcedure
        .input(z.object({ serverId: z.string().optional() }))
        .query(async ({ input, ctx }) => {
            const { serverId } = input;

            return await ctx.db.clients.findMany({
                where: {
                    ...(serverId && {
                        Configs: {
                            some: {
                                serverId: Number(serverId),
                            },
                        },
                    }),
                },
                select: {
                    id: true,
                    name: true,
                },
            });
        }),

    getClientsWithConfigs: publicProcedure
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
                        clientId: true,
                        serverId: true,
                        status: true,
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                }),

                ctx.db.clients.findMany({
                    where: {
                        Configs: {
                            some: {
                                serverId,
                            },
                        },
                    },
                    orderBy: {
                        name: 'asc',
                    },
                }),
            ]);

            const mergedConfigs = configsFromDb.map((config) => {
                const apiDevice = apiDevicesMap.get(config.id);

                if (apiDevice) {
                    return {
                        ...config,
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
                    status: false,
                    online: false,
                    lastHandshake: null,
                    traffic: { received: 0, sent: 0 },
                    allowedIps: [],
                    endpoint: null,
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
                if (clientId) {
                    if (!configsByClientId.has(clientId)) {
                        configsByClientId.set(clientId, []);
                    }
                    configsByClientId.get(clientId)!.push(config);
                }
            }

            const clientsWithConfigs = clients.map((client) => {
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

    createClient: publicProcedure.input(createClientSchema).mutation(async ({ ctx, input }) => {
        const { name, language, telegramId, configs } = input;

        const createdClient = await ctx.db.clients.create({
            data: { name, language: language as Languages, telegramId },
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

            await logsService.createLog('CLIENT', 'INFO', `Config ${config.clientName} created`);
        }

        await logsService.createLog('CLIENT', 'INFO', `Client ${createdClient.name} created`);
    }),

    updateClient: publicProcedure.input(updateClientSchema).mutation(async ({ ctx, input }) => {
        const { id, name, telegramId } = input;

        const updatedClient = await ctx.db.clients.update({
            where: { id },
            data: { name, telegramId },
            select: { name: true },
        });

        await logsService.createLog('CLIENT', 'INFO', `Client ${updatedClient.name} updated`);
    }),

    deleteClient: publicProcedure
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

            const deletedClient = await ctx.db.clients.delete({
                where: { id },
                select: { name: true },
            });

            await logsService.createLog(
                'CLIENT',
                'WARNING',
                `Client ${deletedClient.name} deleted`
            );
        }),

    sendKeysForClient: publicProcedure
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
                            vpnKey: true,
                            clientName: true,
                            protocol: true,
                            expiresAt: true,
                        },
                    },
                },
            });

            if (!foundClient || !foundClient.telegramId)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });

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
                foundClient.Configs
            );

            await logsService.createLog(
                'TELEGRAM',
                'INFO',
                `VPN keys sent for client ${foundClient.name}`
            );
        }),

    sendAllKeys: publicProcedure.mutation(async ({ ctx }) => {
        const foundClients = await ctx.db.clients.findMany({
            select: {
                name: true,
                telegramId: true,
                language: true,
                Configs: {
                    select: {
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
                    `VPN keys not sent for client ${foundClient.name}`
                );
                continue;
            }

            await sendConfigsToTelegram(
                foundClient.name,
                foundClient.telegramId,
                foundClient.language,
                foundClient.Configs
            );
        }

        await logsService.createLog('TELEGRAM', 'INFO', `VPN keys sent for clients`);
    }),

    sendDownloadLinks: publicProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const { id } = input;

            const foundClient = await ctx.db.clients.findUnique({
                where: { id },
                select: { telegramId: true, name: true, language: true },
            });
            if (!foundClient?.telegramId)
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });

            const message =
                foundClient.language === 'ENGLISH'
                    ? `For using <b>${process.env.NEXT_PUBLIC_VPN_NAME}</b> you need to download the open-source AmneziaVPN app.

<b>💻 Computers & Laptops</b>
• <a href="https://github.com/amnezia-vpn/amnezia-client/releases/download/4.8.12.9/AmneziaVPN_4.8.12.9_x64.exe">Windows</a> 
• <a href="https://github.com/amnezia-vpn/amnezia-client/releases/download/4.8.12.9/AmneziaVPN_4.8.12.9_macos.pkg">macOS</a> 
• <a href="https://github.com/amnezia-vpn/amnezia-client/releases/download/4.8.12.9/AmneziaVPN_4.8.12.9_linux_x64.tar">Linux</a>
• <a href="https://docs.amnezia.org/documentation/installing-app-on-linux">Linux docs</a>

<b>📱 Smartphones & Tablets</b>
• <a href="https://play.google.com/store/apps/details?id=org.amnezia.vpn">Android</a>
• <a href="https://apps.apple.com/us/app/amneziavpn/id1600529900">iPhone / iPad</a>`
                    : `Для использования <b>${process.env.NEXT_PUBLIC_VPN_NAME}</b> вам нужно скачать open-source приложение AmneziaVPN.

<b>💻 Компьютеры и ноутбуки</b>
• <a href="https://github.com/amnezia-vpn/amnezia-client/releases/download/4.8.12.9/AmneziaVPN_4.8.12.9_x64.exe">Windows</a> 
• <a href="https://github.com/amnezia-vpn/amnezia-client/releases/download/4.8.12.9/AmneziaVPN_4.8.12.9_macos.pkg">macOS</a> 
• <a href="https://github.com/amnezia-vpn/amnezia-client/releases/download/4.8.12.9/AmneziaVPN_4.8.12.9_linux_x64.tar">Linux</a>
• <a href="https://docs.amnezia.org/documentation/installing-app-on-linux">Документация для Linux</a>

<b>📱 Смартфоны и планшеты</b>
• <a href="https://play.google.com/store/apps/details?id=org.amnezia.vpn">Android</a>
• <a href="https://apps.apple.com/us/app/amneziavpn/id1600529900">iPhone / iPad</a>`;

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
                `Links sent for client ${foundClient.name}`
            );
        }),

    sendNotification: publicProcedure
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
                    `Mass notification sent to ${validClients.length} ${language.toLowerCase()} clients`
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
                    `Notification sent to client ${foundClient.name}`
                );
            }
        }),

    updateExpiresAt: publicProcedure
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
                `Dates of config were changed for client ${foundClient.name}`
            );
        }),

    updateStatus: publicProcedure
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
                `Statuses of config were changed for client ${foundClient.name}`
            );
        }),
});
