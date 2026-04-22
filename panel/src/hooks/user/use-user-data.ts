import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useUserCache } from './use-user-cache';

export const useUserData = () => {
    const { data: session, status: sessionStatus } = useSession();
    const {
        cachedUser,
        getCachedUserData,
        setCachedUserData,
        clearCachedUserData,
        isLoading: cacheLoading,
        setIsLoading,
    } = useUserCache();

    const userData = {
        login: session?.user.login,
        role: session?.user.role,
    };

    useEffect(() => {
        const loadUserData = async () => {
            if (sessionStatus !== 'authenticated' || !userData) {
                clearCachedUserData();
                setIsLoading(false);
                return;
            }

            const cached = getCachedUserData();

            if (cached) {
                setIsLoading(false);
                return;
            }

            if (userData) {
                setCachedUserData(userData);
                setIsLoading(false);
            } else {
                clearCachedUserData();
                setIsLoading(false);
            }
        };

        loadUserData();
    }, [
        sessionStatus,
        session,
        getCachedUserData,
        setCachedUserData,
        clearCachedUserData,
        setIsLoading,
    ]);

    useEffect(() => {
        if (sessionStatus === 'unauthenticated') {
            clearCachedUserData();
        }
    }, [sessionStatus, clearCachedUserData]);

    const isLoading = cacheLoading || sessionStatus === 'loading';
    const isAuthenticated = sessionStatus === 'authenticated';
    const user = cachedUser || userData;

    return {
        user,
        isLoading,
        isAuthenticated,
        updateCachedUser: setCachedUserData,
        clearUserCache: clearCachedUserData,
    };
};
