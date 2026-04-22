'use client';

import { useSession } from 'next-auth/react';
import { AppSidebar } from './app-sidebar';
import { navigation } from '@/lib/data/navigation';
import { rolesHierarchy } from '@/lib/utils';

export function SidebarPermissions() {
    const { data: session } = useSession();

    const userRole = session?.user.role;

    if (!userRole) return;
    const filteredNavMain = navigation.navMain
        .map((section) => {
            const items = section.items.filter((item) => {
                return rolesHierarchy.indexOf(userRole) >= rolesHierarchy.indexOf(item.role);
            });

            return { ...section, items };
        })
        .filter((section) => section.items.length > 0);

    const filteredNavigation = {
        ...navigation,
        navMain: filteredNavMain,
    };
    return <AppSidebar navigation={filteredNavigation} />;
}
