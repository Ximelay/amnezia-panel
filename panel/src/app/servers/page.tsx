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
import { CustomPagination } from '@/components/custom-pagination';
import DeleteServerDialog from './components/delete-server-dialog';
import { UpsertServerDialog } from './components/upsert-server-dialog';

export default function ServersPAge() {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState('25');

    const { data, isLoading, isFetching, error } = api.servers.getServersTable.useQuery({
        search,
        page,
        limit,
    });

    const numberLimit = Number(limit);
    const totalPages = data ? Math.ceil(data.totalItems / numberLimit) : 0;

    const changeHandler = (event: React.ChangeEvent<HTMLInputElement>) => {
        setPage(1);
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
                    <h1 className="text-3xl font-bold tracking-tight">Servers</h1>
                    <p className="text-muted-foreground">Servers management</p>
                </div>
                <UpsertServerDialog />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Servers table</CardTitle>
                    <CardDescription>Servers count: {data?.totalItems}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-6">
                        <InputSearchLoader
                            onChange={debouncedChangeHandler}
                            isLoading={isLoading || isFetching}
                            placeholder="Search by server name..."
                        />

                        {isLoading ? (
                            <Loader />
                        ) : error ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="text-destructive">Error load data</div>
                            </div>
                        ) : (
                            <>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>ID</TableHead>
                                                <TableHead>Name</TableHead>
                                                <TableHead>Host</TableHead>
                                                <TableHead className="w-25">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {data?.servers.map((server) => (
                                                <TableRow key={server.id}>
                                                    <TableCell className="font-medium">
                                                        {server.id}
                                                    </TableCell>
                                                    <TableCell>{server.name}</TableCell>
                                                    <TableCell>{`${server.ip}${server.port !== 80 ? `:${server.port}` : ''}`}</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center justify-end gap-1">
                                                            <UpsertServerDialog server={server} />
                                                            <DeleteServerDialog id={server.id} />
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                                {data?.totalItems && totalPages > 1 && (
                                    <div className="flex w-full items-center justify-center">
                                        <CustomPagination
                                            currentPage={page}
                                            onPageChange={setPage}
                                            totalPages={totalPages}
                                            limit={limit}
                                            setLimit={setLimit}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
