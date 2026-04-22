'use client';

import { usePathname } from 'next/navigation';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { SidebarBreadCrumbs } from '@/components/sidebar-breadcrumbs';
import { Toaster } from '@/components/ui/sonner';
import { SessionProvider } from 'next-auth/react';
import { AuthGuard } from './auth-guard';
import { SidebarPermissions } from './sidebar-permissions';

export function LayoutWrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    const pathname = usePathname();
    const isAuth = pathname.startsWith('/auth');

    if (isAuth) {
        return (
            <SessionProvider>
                <main className="pb-4 px-4">{children}</main>
                <Toaster position="top-right" expand={true} />
            </SessionProvider>
        );
    } else {
        return (
            <SessionProvider>
                <AuthGuard>
                    <SidebarProvider>
                        <SidebarPermissions />
                        <SidebarInset>
                            <SidebarBreadCrumbs />
                            <main className="pb-4 px-4">{children}</main>
                            <Toaster position="top-right" expand={true} />
                        </SidebarInset>
                    </SidebarProvider>
                </AuthGuard>
            </SessionProvider>
        );
    }
}
