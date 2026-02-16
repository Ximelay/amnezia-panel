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
import { toast } from 'sonner';
import { Check, Copy, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ServersPage() {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState('25');

    const [defaultServerId, setDefaultServerIdState] = useState<number | null>(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('defaultServerId');
            return stored ? Number(stored) : null;
        }
        return null;
    });

    const setDefaultServerId = (id: number | null) => {
        setDefaultServerIdState(id);
        if (typeof window !== 'undefined') {
            if (id === null) {
                localStorage.removeItem('defaultServerId');
            } else {
                localStorage.setItem('defaultServerId', String(id));
            }
        }
    };

    const { data, isLoading, isFetching, error } = api.servers.getServersTable.useQuery({
        search,
        page,
        limit,
    });

    const numberLimit = Number(limit);
    const totalPages = data ? Math.ceil(data.totalItems / numberLimit) : 0;

    useEffect(() => {
        if (data?.servers && defaultServerId !== null) {
            const exists = data.servers.some((server) => server.id === defaultServerId);
            if (!exists) {
                setDefaultServerId(null);
            }
        }
    }, [data?.servers, defaultServerId]);

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
                                                <TableHead>API Key</TableHead>
                                                <TableHead>Configs count</TableHead>
                                                <TableHead>Default</TableHead>
                                                <TableHead className="w-25">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {data?.servers.map((server) => (
                                                <ServerRow
                                                    key={server.id}
                                                    server={server}
                                                    defaultServerId={defaultServerId}
                                                    onSetDefault={setDefaultServerId}
                                                />
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

function ServerRow({
    server,
    defaultServerId,
    onSetDefault,
}: Readonly<{
    server: {
        id: number;
        name: string;
        ip: string;
        port: number;
        apiKey: string | null;
        configsCount: number;
    };
    defaultServerId: number | null;
    onSetDefault: (id: number | null) => void;
}>) {
    const [copiedApiKey, setCopiedApiKey] = useState(false);

    const copyApiKeyToClipboard = async (apiKey: string | null) => {
        if (!apiKey) return;

        try {
            await navigator.clipboard.writeText(apiKey);
            setCopiedApiKey(true);
            toast.success('API key copied to clipboard');
            setTimeout(() => setCopiedApiKey(false), 2000);
        } catch (err) {
            toast.error('Failed to copy API key');
        }
    };

    const isDefault = server.id === defaultServerId;

    return (
        <TableRow>
            <TableCell className="font-medium">{server.id}</TableCell>
            <TableCell>{server.name}</TableCell>
            <TableCell>
                <a
                    className="text-sky-500 hover:underline"
                    target="_blank"
                    href={`http://${server.ip}:${server.port}/docs`}
                    rel="noreferrer">
                    {`${server.ip}${server.port !== 80 ? `:${server.port}` : ''}`}
                </a>
            </TableCell>
            <TableCell>
                <div
                    className="flex cursor-pointer items-center gap-1"
                    onClick={() => copyApiKeyToClipboard(server.apiKey)}>
                    <span>********************</span>
                    {copiedApiKey ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </div>
            </TableCell>
            <TableCell>{server.configsCount}</TableCell>
            <TableCell>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onSetDefault(isDefault ? null : server.id)}
                    className="hover:text-yellow-500 focus:outline-none"
                    title={isDefault ? 'Remove default server' : 'Set as default server'}>
                    <Star
                        className="h-4 w-4 transition-colors"
                        fill={isDefault ? 'currentColor' : 'none'}
                    />
                </Button>
            </TableCell>
            <TableCell>
                <div className="flex items-center justify-end gap-1">
                    <UpsertServerDialog server={server} />
                    <DeleteServerDialog id={server.id} />
                </div>
            </TableCell>
        </TableRow>
    );
}
