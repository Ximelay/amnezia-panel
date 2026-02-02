export class CacheService {
    private readonly cache = new Map<string, { data: string; expiresAt: number }>();

    set<T>(key: string, data: T, ttl: number): void {
        const expiresAt = Date.now() + ttl;

        this.cache.set(key, {
            data: JSON.stringify(data),
            expiresAt,
        });

        this.cleanup();
    }

    get<T>(key: string): T | null {
        const cached = this.cache.get(key);

        if (!cached) return null;

        if (Date.now() > cached.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return JSON.parse(cached.data) as T;
    }

    delete(key: string): void {
        this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    private cleanup(): void {
        if (Math.random() < 0.1) {
            const now = Date.now();
            for (const [key, value] of this.cache.entries()) {
                if (now > value.expiresAt) {
                    this.cache.delete(key);
                }
            }
        }
    }
}

export const cacheService = new CacheService();
