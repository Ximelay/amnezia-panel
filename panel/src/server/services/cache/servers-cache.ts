import { TTL_CONFIG } from '@/server/enums';
import { cacheService } from './cache';
import type { InputJsonValue, JsonNullClass, JsonValue } from '@prisma/client/runtime/client';
import { db } from '@/server/db';
import { encryptionService } from '../encryption';
import type { upsertServerFormData } from '@/lib/schemas/servers';

type EncryptedValue = JsonValue | string | null;

export interface CachedServer {
    name: string;
    ip: string;
    port: number;
    apiKey: EncryptedValue;
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

    async upsertServer(data: upsertServerFormData, serverId?: number): Promise<void> {
        const encryptedApiKey = encryptionService.encrypt(data.apiKey);

        await db.servers.upsert({
            where: { id: serverId || -1 },
            create: { ...data, apiKey: encryptedApiKey },
            update: { ...data, apiKey: encryptedApiKey },
        });

        if (serverId) this.invalidateCache(serverId);
    }

    async deleteServer(serverId: number): Promise<string> {
        await db.configs.deleteMany({
            where: { serverId },
        });

        const deletedServer = await db.servers.delete({
            where: { id: serverId },
            select: { name: true },
        });

        this.invalidateCache(serverId);

        return deletedServer.name;
    }

    private invalidateCache(serverId: number): void {
        const cacheKey = this.getCacheKey(serverId);
        cacheService.delete(cacheKey);
    }
}

export const serversCacheService = new ServersCacheService();
