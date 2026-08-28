import { TTL_CONFIG } from '@/server/enums';
import { cacheService } from './cache';
import type { JsonValue } from '@prisma/client/runtime/client';
import { db } from '@/server/db';
import { encryptionService } from '../encryption';
import type { upsertServerFormData } from '@/lib/schemas/servers';

type EncryptedValue = JsonValue | string | null;

export interface ICachedServer {
    name: string;
    ip: string;
    port: number;
    apiKey: EncryptedValue;
}

export interface ICachedServers {
    id: number;
    name: string;
}

export class ServersCacheService {
    private readonly CACHE_PREFIX = 'servers:';

    private getCacheKeyServerId(serverId: number): string {
        return `${this.CACHE_PREFIX}${serverId}`;
    }

    private getCacheKeyServers(): string {
        return `${this.CACHE_PREFIX}servers-select`;
    }

    async getServer(serverId: number): Promise<ICachedServer | null> {
        const cacheKey = this.getCacheKeyServerId(serverId);

        const cached = cacheService.get<ICachedServer>(cacheKey);
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

    async getServers(): Promise<ICachedServers[] | null> {
        const cacheKey = this.getCacheKeyServers();

        const cached = cacheService.get<ICachedServers[]>(cacheKey);
        if (cached) return cached;

        const servers = await db.servers.findMany({
            select: {
                id: true,
                name: true,
            },
        });

        if (!servers) return null;

        cacheService.set(cacheKey, servers, TTL_CONFIG.SERVERS);

        return servers;
    }

    async getDecryptedApiKey(apiKey?: JsonValue): Promise<string | null> {
        return await encryptionService.decryptField(apiKey);
    }

    async upsertServer(data: upsertServerFormData, serverId?: number): Promise<void> {
        const { apiKey, ...fields } = data;
        const trimmedApiKey = apiKey?.trim();

        if (!trimmedApiKey) {
            // The edit form leaves this empty whenever the admin is not deliberately replacing
            // the key — it has no copy to prefill, by design. Writing the empty value through
            // would encrypt nothing and cut the panel off from the server on the next API call,
            // so an absent key means "leave the stored one alone" instead.
            if (!serverId) throw new Error('API key is required when creating a server');

            await db.servers.update({
                where: { id: serverId },
                data: { ...fields, port: Number(fields.port) },
            });
        } else {
            const encryptedApiKey = encryptionService.encrypt(trimmedApiKey);

            await db.servers.upsert({
                where: { id: serverId || -1 },
                create: { ...fields, port: Number(fields.port), apiKey: encryptedApiKey },
                update: { ...fields, port: Number(fields.port), apiKey: encryptedApiKey },
            });
        }

        if (serverId) {
            this.invalidateCacheServerId(serverId);
        }
        this.invalidateCacheServers();
    }

    async deleteServer(serverId: number): Promise<string> {
        await db.configs.deleteMany({
            where: { serverId },
        });

        const deletedServer = await db.servers.delete({
            where: { id: serverId },
            select: { name: true },
        });

        this.invalidateCacheServerId(serverId);
        this.invalidateCacheServers();

        return deletedServer.name;
    }

    private invalidateCacheServerId(serverId: number): void {
        const cacheKey = this.getCacheKeyServerId(serverId);
        cacheService.delete(cacheKey);
    }

    private invalidateCacheServers(): void {
        const cacheKey = this.getCacheKeyServers();
        cacheService.delete(cacheKey);
    }
}

export const serversCacheService = new ServersCacheService();
