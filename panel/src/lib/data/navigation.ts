import type { Roles } from 'prisma/generated/enums';

type NavigationItem = {
    title: string;
    url: string;
    role: Roles;
};

type NavigationSection = {
    title: string;
    url: string;
    items: NavigationItem[];
};

export type Navigation = {
    navMain: NavigationSection[];
};

export const navigation: Navigation = {
    navMain: [
        {
            title: 'Clients',
            url: '#',
            items: [
                {
                    title: 'Clients table',
                    url: '/clients',
                    role: 'ADMIN',
                },
                {
                    title: 'Create client',
                    url: '/create-client',
                    role: 'ADMIN',
                },
            ],
        },
        {
            title: 'Info',
            url: '#',
            items: [
                {
                    title: 'Logs',
                    url: '/logs',
                    role: 'ADMIN',
                },
                {
                    title: 'Payment settings',
                    url: '/payment-settings',
                    role: 'ADMIN',
                },
                {
                    title: 'Notification',
                    url: '/notification',
                    role: 'ADMIN',
                },
            ],
        },
        {
            title: 'Servers',
            url: '#',
            items: [
                {
                    title: 'Servers',
                    url: '/servers',
                    role: 'ADMIN',
                },
                {
                    title: 'Server Info',
                    url: '/server-info',
                    role: 'ADMIN',
                },
            ],
        },
        // {
        //     title: 'Panel',
        //     url: '#',
        //     items: [
        //         {
        //             title: 'Admins',
        //             url: '/admins',
        //             role: 'ROOT',
        //         },
        //     ],
        // },
    ],
};
