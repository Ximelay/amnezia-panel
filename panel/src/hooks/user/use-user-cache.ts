import type { Roles } from 'prisma/generated/enums';
import { useState, useCallback, useEffect } from 'react';

interface CachedUserData {
    login?: string;
    role?: Roles;
}

const USER_CACHE_KEY = 'userData';

export const useUserCache = () => {
    const [cachedUser, setCachedUser] = useState<CachedUserData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const cached = getCachedUserData();
        setCachedUser(cached);
        setIsLoading(false);
    }, []);

    const getCachedUserData = useCallback((): CachedUserData | null => {
        if (typeof globalThis.window === 'undefined') return null;

        try {
            const cached = localStorage.getItem(USER_CACHE_KEY);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.error('Error reading cached user data:', error);
            return null;
        }
    }, []);

    const setCachedUserData = useCallback((userData: CachedUserData) => {
        if (typeof globalThis.window === 'undefined') return;

        try {
            localStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData));
            setCachedUser(userData);
        } catch (error) {
            console.error('Error caching user data:', error);
        }
    }, []);

    const clearCachedUserData = useCallback(() => {
        if (typeof globalThis.window === 'undefined') return;

        try {
            localStorage.removeItem(USER_CACHE_KEY);
            setCachedUser(null);
        } catch (error) {
            console.error('Error clearing cached user data:', error);
        }
    }, []);

    return {
        cachedUser,
        getCachedUserData,
        setCachedUserData,
        clearCachedUserData,
        isLoading,
        setIsLoading,
    };
};
