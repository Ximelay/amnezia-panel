'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/trpc/react';
import { InputSearchLoader } from '@/components/input-search';
import { Loader } from '@/components/loader';
import debounce from 'lodash.debounce';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Roles } from 'prisma/generated/enums';
import { rolesMapping } from '@/lib/data/mappings';
import { getNormalDate, getRoleColor } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { UpsertAdminDialog } from './components/upsert-admin-dialog';
import { DeleteAdminDialog } from './components/delete-admin-dialog';

export default function AdminsPage() {
    const [search, setSearch] = useState('');

    const { data, isLoading, isFetching, error } = api.admins.getAdmins.useQuery({ search });

    const changeHandler = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(event.target.value);
    };

    const debouncedChangeHandler = useMemo(() => debounce(changeHandler, 500), []);

    useEffect(() => {
        return () => {
            debouncedChangeHandler.cancel();
        };
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="grid gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">Administrators</h1>
                    <p className="text-muted-foreground">Admins management</p>
                </div>
                <UpsertAdminDialog />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Admins table</CardTitle>
                    <CardDescription>Admins count: {data?.length}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-6">
                        <InputSearchLoader
                            onChange={debouncedChangeHandler}
                            isLoading={isLoading || isFetching}
                            placeholder="Search by login..."
                        />

                        {isLoading ? (
                            <Loader />
                        ) : error ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="text-destructive">Error load data</div>
                            </div>
                        ) : (
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Created at</TableHead>
                                            <TableHead>Login</TableHead>
                                            <TableHead>Role</TableHead>
                                            <TableHead className="w-25">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data?.map((admin) => (
                                            <AdminRow key={admin.id} admin={admin} />
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function AdminRow({
    admin,
}: Readonly<{
    admin: {
        id: string;
        createdAt: Date;
        login: string;
        role: Roles;
    };
}>) {
    return (
        <TableRow>
            <TableCell>{getNormalDate(admin.createdAt)}</TableCell>
            <TableCell>{admin.login}</TableCell>
            <TableCell>
                <Badge variant="default" className={getRoleColor(admin.role)}>
                    {rolesMapping[admin.role]}
                </Badge>
            </TableCell>
            <TableCell>
                <div className="flex items-center justify-end gap-1">
                    <UpsertAdminDialog admin={admin} />
                    <DeleteAdminDialog admin={admin} />
                </div>
            </TableCell>
        </TableRow>
    );
}
