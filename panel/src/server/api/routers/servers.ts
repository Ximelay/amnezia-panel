import { z } from 'zod';
import { createTRPCRouter, protectedProcedureWithRole } from '@/server/api/trpc';
import { logsService } from '@/server/services/logs';
import type { LevelTypesFilter } from '@/server/enums';
import type { LogTypes } from 'prisma/generated/enums';
import { amneziaApiService } from '@/server/services/amnezia-api';
import { serverBackupSchema } from '@/server/interfaces/amnezia-api';
import { TRPCError } from '@trpc/server';
import { upsertServerSchema } from '@/lib/schemas/servers';
import { encryptionService } from '@/server/services/encryption';
import type { Prisma } from 'prisma/generated/client';
import { serversCacheService } from '@/server/services/cache/servers-cache';

export const serversRouter = createTRPCRouter({
    getServers: protectedProcedureWithRole('ADMIN').query(async () => {
        return await serversCacheService.getServers();
    }),

    getServerInfo: protectedProcedureWithRole('ADMIN')
        .input(z.object({ serverId: z.number() }))
        .query(async ({ input }) => {
            const { serverId } = input;

            return await amneziaApiService.getServerInfo(serverId);
        }),

    getServerLoad: protectedProcedureWithRole('ADMIN')
        .input(z.object({ serverId: z.number() }))
        .query(async ({ input }) => {
            const { serverId } = input;

            return await amneziaApiService.getServerLoad(serverId);
        }),

    getLogs: protectedProcedureWithRole('ADMIN')
        .input(
            z.object({
                search: z.string().optional(),
                page: z.number().min(1),
                limit: z.string(),
                levelType: z.string() as z.ZodType<LevelTypesFilter>,
                logType: z.string() as z.ZodType<LogTypes>,
                adminIdFilter: z.string(),
            })
        )
        .query(async ({ input, ctx }) => {
            return await logsService.getLogs(input, ctx.session.user.id);
        }),

    downloadBackup: protectedProcedureWithRole('ADMIN')
        .input(z.object({ serverId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const { serverId } = input;

            const foundServer = await ctx.db.servers.findUnique({
                where: { id: serverId },
                select: { name: true },
            });

            const backup = await amneziaApiService.getServerBackup(serverId);
            const jsonString = JSON.stringify(backup, null, 2);
            const buffer = Buffer.from(jsonString, 'utf-8');
            const base64Content = buffer.toString('base64');

            const currentDate = new Date()
                .toLocaleDateString('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric',
                })
                .replace(/\//g, '-');

            const filename = `${foundServer?.name}-backup-${currentDate}.json`;

            await logsService.createLog(
                'SERVER',
                'INFO',
                'Server backup was downloaded successfully',
                ctx.session.user.id
            );

            return {
                filename,
                content: base64Content,
                mimeType: 'application/json',
            };
        }),

    importBackup: protectedProcedureWithRole('ADMIN')
        .input(z.object({ serverId: z.number(), fileContent: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const { serverId, fileContent } = input;

            const backupFile = await (async () => {
                try {
                    const parsed = JSON.parse(fileContent);
                    return serverBackupSchema.parse(parsed);
                } catch {
                    await logsService.createLog(
                        'SERVER',
                        'ERROR',
                        'Server backup was not parsed',
                        ctx.session.user.id
                    );

                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'Invalid Backup file',
                    });
                }
            })();

            await amneziaApiService.importServerBackup(serverId, backupFile);

            await logsService.createLog(
                'SERVER',
                'INFO',
                'Server backup was imported successfully',
                ctx.session.user.id
            );
        }),

    rebootServer: protectedProcedureWithRole('ADMIN')
        .input(z.object({ serverId: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const { serverId } = input;

            await logsService.createLog(
                'SERVER',
                'WARNING',
                'Server was rebooted',
                ctx.session.user.id
            );

            await amneziaApiService.rebootServer(serverId);
        }),

    upsertServer: protectedProcedureWithRole('ADMIN')
        .input(upsertServerSchema)
        .mutation(async ({ input, ctx }) => {
            const { id, name } = input;

            await serversCacheService.upsertServer(input, id);

            await logsService.createLog(
                'SERVER',
                'INFO',
                `Server <${name}> was saved`,
                ctx.session.user.id
            );
        }),

    deleteServer: protectedProcedureWithRole('ADMIN')
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const { id } = input;

            const deletedServerName = await serversCacheService.deleteServer(id);

            await logsService.createLog(
                'SERVER',
                'WARNING',
                `Server <${deletedServerName}> was deleted with configs`,
                ctx.session.user.id
            );
        }),

    getServersTable: protectedProcedureWithRole('ADMIN')
        .input(
            z.object({
                search: z.string().optional(),
                page: z.number().min(1),
                limit: z.string(),
            })
        )
        .query(async ({ ctx, input }) => {
            const { search, page, limit } = input;
            const numberLimit = Number(limit);
            const offset = (page - 1) * numberLimit;

            const whereConditions: Prisma.ServersWhereInput = {
                name: search
                    ? {
                          contains: search,
                          mode: 'insensitive',
                      }
                    : undefined,
            };

            const [servers, totalItems] = await Promise.all([
                ctx.db.servers.findMany({
                    where: whereConditions,
                    select: {
                        id: true,
                        name: true,
                        ip: true,
                        port: true,
                        apiKey: true,
                        _count: { select: { Configs: true } },
                    },
                    orderBy: {
                        id: 'asc',
                    },
                    take: numberLimit,
                    skip: offset,
                }),

                ctx.db.servers.count({
                    where: whereConditions,
                }),
            ]);

            const serversWithApi = servers.map((server) => ({
                id: server.id,
                name: server.name,
                ip: server.ip,
                port: server.port,
                apiKey: encryptionService.decryptField(server.apiKey),
                configsCount: server._count.Configs,
            }));

            return {
                servers: serversWithApi,
                totalItems,
            };
        }),
});
