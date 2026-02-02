import { TTL_CONFIG } from '@/server/enums';
import { cacheService } from './cache';
import type { InputJsonValue, JsonNullClass, JsonValue } from '@prisma/client/runtime/client';
import { db } from '@/server/db';
import { encryptionService } from '../encryption';

type EncryptedValue = JsonValue | string | null;

export interface CachedServer {
    name: string;
    ip: string;
    port: string;
    apiKey: EncryptedValue;
}

interface IUpsertServer {
    name: string;
    ip: string;
    port: string;
    apiKey: JsonNullClass | InputJsonValue;
}

export class ServersCacheService {
    private readonly CACHE_PREFIX = 'servers:';

    private getCacheKey(serverId: number): string {
        return `${this.CACHE_PREFIX}${serverId}`;
    }

    async getServer(serverId: number): Promise<CachedServer | null> {
        const cacheKey = this.getCacheKey(serverId);

        const cached = cacheService.get<CachedServer>(cacheKey);
        if (cached) return cached;

        const dbSettings = await db.servers.findUnique({
            where: { id: serverId },
            select: {
                name: true,
                ip: true,
                port: true,
                apiKey: true,
            },
        });

        if (!dbSettings) return null;

        cacheService.set(cacheKey, dbSettings, TTL_CONFIG.SERVERS);

        return dbSettings;
    }

    async getDecryptedApiKey(apiKey?: JsonValue): Promise<string | null> {
        return await encryptionService.decryptField(apiKey);
    }

    async upsertServer(data: IUpsertServer, serverId?: number): Promise<void> {
        await db.servers.upsert({
            where: { id: serverId || -1 },
            create: data,
            update: data,
        });

        if (serverId) this.invalidateCache(serverId);
    }

    invalidateCache(serverId: number): void {
        const cacheKey = this.getCacheKey(serverId);
        cacheService.delete(cacheKey);
    }
}

export const serversCacheService = new ServersCacheService();
