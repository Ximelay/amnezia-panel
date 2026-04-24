import { TRPCError } from '@trpc/server';
import type { LevelTypes, LogTypes } from 'prisma/generated/enums';
import { db } from '../db';
import type { LevelTypesFilter, LogTypesFilter } from '../enums';
import type { Prisma } from 'prisma/generated/client';

interface IGetLogs {
    search?: string;
    page: number;
    limit: string;
    levelType: LevelTypesFilter;
    logType: LogTypesFilter;
    adminIdFilter: string;
}

class LogsService {
    async createLog(logType: LogTypes, levelType: LevelTypes, message: string, adminId?: string) {
        try {
            await db.logs.create({
                data: {
                    logType,
                    levelType,
                    message,
                    adminId,
                },
            });
        } catch (error) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Create Log Error: ${error}`,
            });
        }
    }

    async getLogs(
        query: IGetLogs,
        adminId: string
    ): Promise<{
        logs: {
            id: number;
            createdAt: Date;
            logType: LogTypes;
            levelType: LevelTypes;
            message: string;
            Admins: { login: string | null } | null;
        }[];
        totalItems: number;
    }> {
        try {
            const { search, page, limit, levelType, logType, adminIdFilter } = query;

            const numberLimit = Number(limit);
            const offset = (page - 1) * numberLimit;

            const whereConditions: Prisma.LogsWhereInput = {
                message: search
                    ? {
                          contains: search,
                          mode: 'insensitive',
                      }
                    : undefined,
            };

            if (levelType && levelType !== 'All') {
                whereConditions.levelType = levelType;
            }

            if (logType && logType !== 'All') {
                whereConditions.logType = logType;
            }

            if (adminIdFilter && adminIdFilter !== 'All') {
                whereConditions.adminId = adminIdFilter;
            }

            const [logs, totalItems] = await Promise.all([
                db.logs.findMany({
                    where: whereConditions,
                    select: {
                        id: true,
                        createdAt: true,
                        logType: true,
                        levelType: true,
                        message: true,
                        Admins: { select: { login: true } },
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: numberLimit,
                    skip: offset,
                }),

                db.logs.count({
                    where: whereConditions,
                }),
            ]);

            return {
                logs,
                totalItems,
            };
        } catch (error) {
            this.createLog('SERVER', 'ERROR', 'Error in GET Logs', adminId);

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Logs Service Error: ${error}`,
            });
        }
    }
}

export const logsService = new LogsService();
