import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { api } from '@/trpc/react';
import { useUserCache } from './use-user-cache';

export const useUserData = () => {
    const { data: session, status: sessionStatus } = useSession();
    const {
        data: userData,
        refetch,
        isLoading: queryLoading,
    } = api.admins.getCurrentUser.useQuery(undefined, {
        enabled: false,
        retry: false,
    });

    const {
        cachedUser,
        getCachedUserData,
        setCachedUserData,
        clearCachedUserData,
        isLoading: cacheLoading,
        setIsLoading,
    } = useUserCache();

    useEffect(() => {
        const loadUserData = async () => {
            if (sessionStatus !== 'authenticated' || !session?.user) {
                clearCachedUserData();
                setIsLoading(false);
                return;
            }

            const cached = getCachedUserData();

            if (cached) {
                setIsLoading(false);
                return;
            }

            try {
                const result = await refetch();

                if (result.data) {
                    setCachedUserData(result.data);
                } else {
                    clearCachedUserData();
                }
            } catch (error) {
                clearCachedUserData();
            } finally {
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
        refetch,
        setIsLoading,
    ]);

    useEffect(() => {
        if (sessionStatus === 'unauthenticated') {
            clearCachedUserData();
        }
    }, [sessionStatus, clearCachedUserData]);

    const isLoading = cacheLoading || queryLoading || sessionStatus === 'loading';
    const isAuthenticated = sessionStatus === 'authenticated';
    const user = cachedUser || userData;

    return {
        user,
        isLoading,
        isAuthenticated,
        refetchUser: refetch,
        updateCachedUser: setCachedUserData,
        clearUserCache: clearCachedUserData,
    };
};
