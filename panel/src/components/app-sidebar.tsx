'use client';

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Navigation } from '@/lib/data/navigation';
import { useUserData } from '@/hooks/user/use-user-data';
import { signOut } from 'next-auth/react';
import { Loader2, Lock, LogOut, User } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';
import { rolesMapping } from '@/lib/data/mappings';

type Navbar = {
    navigation: Navigation;
};

export function AppSidebar({ navigation }: Readonly<Navbar>) {
    const pathname = usePathname();
    const router = useRouter();

    const { user, clearUserCache, isLoading, isAuthenticated } = useUserData();

    const handleLogout = async () => {
        clearUserCache();
        await signOut({ redirect: false });
        router.push('/auth/login');
    };

    return (
        <Sidebar>
            <SidebarHeader>
                <h1 className="font-bold">{process.env.NEXT_PUBLIC_VPN_NAME}</h1>
                <span className="text-xs text-neutral-700">Admin panel</span>
            </SidebarHeader>

            <SidebarContent>
                {navigation.navMain.map((item) => (
                    <SidebarGroup key={item.title}>
                        <SidebarGroupLabel>
                            <span className="font-semibold uppercase">{item.title}</span>
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {item.items.map((menuItem) => {
                                    const isActive = pathname === menuItem.url;

                                    return (
                                        <SidebarMenuItem key={menuItem.title}>
                                            <SidebarMenuButton asChild isActive={isActive}>
                                                <Link href={menuItem.url}>{menuItem.title}</Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    );
                                })}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ))}
            </SidebarContent>

            <SidebarFooter>
                <SidebarGroup>
                    <SidebarGroupContent>
                        {isLoading ? (
                            <div className="flex items-center gap-2 p-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm">Загрузка...</span>
                            </div>
                        ) : user && isAuthenticated ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        className="h-auto w-full justify-start gap-2 p-2">
                                        <div className="flex min-w-0 items-center gap-4">
                                            <User className="h-4 w-4" />
                                            <div className="flex min-w-0 flex-col overflow-hidden">
                                                <span className="w-full truncate text-left text-sm font-medium">
                                                    {user.login}
                                                </span>
                                                <span className="text-muted-foreground w-full truncate text-left text-xs">
                                                    {user.role && rolesMapping[user.role]}
                                                </span>
                                            </div>
                                        </div>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem
                                        onClick={() => router.push('/auth/change-password')}
                                        className="cursor-pointer">
                                        <Lock className="mr-2 h-4 w-4" />
                                        Change password
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={handleLogout}
                                        className="text-destructive focus:text-destructive cursor-pointer">
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Sign out
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <div className="text-muted-foreground p-2 text-sm">Not authorized</div>
                        )}
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarFooter>
        </Sidebar>
    );
}
