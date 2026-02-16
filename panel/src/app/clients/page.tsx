'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/trpc/react';
import { InputSearchLoader } from '@/components/input-search';
import { Loader } from '@/components/loader';
import debounce from 'lodash.debounce';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Server } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CreateConfigDialog } from '@/app/clients/components/create-config-dialog';
import { protocolsMapping } from '@/lib/data/mappings';
import { toast } from 'sonner';
import { telegramToastError } from '@/lib/utils';
import { ConfigsWithClientsTable } from './components/clients-table';
import MultipleSelector, { type Option } from '@/components/ui/multi-select';

export default function ClientsPage() {
    const [search, setSearch] = useState('');
    const [protocolFilter, setProtocolFilter] = useState('All');
    const [serverFilter, setServerFilter] = useState<Option[]>([]);
    const [defaultServerId, setDefaultServerId] = useState<string | null>(null);
    const router = useRouter();

    const { data: serversData, isLoading: isLoadingServers } = api.servers.getServers.useQuery();

    useEffect(() => {
        if (typeof window !== 'undefined' && serversData) {
            const stored = localStorage.getItem('defaultServerId');
            if (stored) {
                const server = serversData.find((s) => s.id === Number(stored));
                if (server) {
                    setDefaultServerId(stored);
                    setServerFilter([{ value: String(server.id), label: server.name }]);
                }
            }
        }
    }, [serversData]);

    const serverOptions = useMemo(() => {
        if (!serversData) return [];
        return serversData.map((server) => ({
            value: String(server.id),
            label: server.name,
        }));
    }, [serversData]);

    const selectedServerId = useMemo(() => {
        return serverFilter[0]?.value;
    }, [serverFilter]);

    const { data, isLoading, isFetching, error } = api.clients.getClientsWithConfigs.useQuery(
        {
            serverId: selectedServerId || defaultServerId || undefined,
            search,
            protocolFilter,
        },
        {
            enabled: !!(selectedServerId || defaultServerId),
        }
    );

    const changeHandler = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(event.target.value);
    };

    const debouncedChangeHandler = useMemo(() => debounce(changeHandler, 500), []);

    useEffect(() => {
        return () => {
            debouncedChangeHandler.cancel();
        };
    }, []);

    const sendMessages = api.clients.sendAllKeys.useMutation({
        onSuccess: () => {
            toast.success('VPN configs were sent successfully');
        },
        onError: (error) => {
            telegramToastError(error);
        },
    });

    const onSubmit = () => {
        sendMessages.mutate();
    };

    const handleServerChange = (selected: Option[]) => {
        setServerFilter(selected);
    };

    if (isLoadingServers) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader />
            </div>
        );
    }
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="grid gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
                    <p className="text-muted-foreground">Clients and configs management</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        className="cursor-pointer"
                        onClick={() => router.push('/create-client')}>
                        <Plus className="mr-2 h-4 w-4" /> Create Client
                    </Button>
                    <CreateConfigDialog />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Clients table</CardTitle>
                    <CardDescription>Clients count: {data?.totalClients || 0}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-6 space-y-4">
                        <div className="flex items-center justify-between gap-4 border-b pb-4">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <Server className="text-muted-foreground h-4 w-4" />
                                    <span className="text-sm font-medium">Server:</span>
                                </div>
                                <MultipleSelector
                                    className="w-64"
                                    value={serverFilter}
                                    onChange={handleServerChange}
                                    defaultOptions={serverOptions}
                                    options={serverOptions}
                                    placeholder="Select a server..."
                                    maxSelected={1}
                                    hidePlaceholderWhenSelected={true}
                                />
                            </div>
                            {process.env.NEXT_PUBLIC_USES_TELEGRAM_BOT === 'true' && (
                                <Button
                                    disabled={sendMessages.isPending}
                                    onClick={onSubmit}
                                    className="bg-blue-600 hover:bg-blue-500">
                                    {sendMessages.isPending && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    {sendMessages.isPending
                                        ? 'Sending...'
                                        : 'Send VPN configs to clients'}
                                </Button>
                            )}
                        </div>

                        {selectedServerId && (
                            <div className="flex items-center gap-4">
                                <div className="bg-muted flex items-center gap-1 rounded-lg p-1">
                                    <Button
                                        variant={protocolFilter === 'All' ? 'default' : 'ghost'}
                                        size="sm"
                                        onClick={() => setProtocolFilter('All')}
                                        className="h-8">
                                        All
                                    </Button>
                                    <Button
                                        variant={protocolFilter === 'XRAY' ? 'default' : 'ghost'}
                                        size="sm"
                                        onClick={() => setProtocolFilter('XRAY')}
                                        className="h-8">
                                        {protocolsMapping['XRAY']}
                                    </Button>
                                    <Button
                                        variant={
                                            protocolFilter === 'AMNEZIAWG' ? 'default' : 'ghost'
                                        }
                                        size="sm"
                                        onClick={() => setProtocolFilter('AMNEZIAWG')}
                                        className="h-8">
                                        {protocolsMapping['AMNEZIAWG']}
                                    </Button>
                                    <Button
                                        variant={
                                            protocolFilter === 'AMNEZIAWG2' ? 'default' : 'ghost'
                                        }
                                        size="sm"
                                        onClick={() => setProtocolFilter('AMNEZIAWG2')}
                                        className="h-8">
                                        {protocolsMapping['AMNEZIAWG2']}
                                    </Button>
                                </div>

                                <InputSearchLoader
                                    placeholder="Search by config name..."
                                    onChange={debouncedChangeHandler}
                                    isLoading={isLoading || isFetching}
                                />
                            </div>
                        )}
                    </div>

                    {!selectedServerId ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Server className="text-muted-foreground mb-4 h-16 w-16" />
                            <h3 className="text-lg font-semibold">Select a Server</h3>
                            <p className="text-muted-foreground mt-2 max-w-md text-sm">
                                Choose a server from the dropdown above to view and manage its
                                clients and VPN configurations
                            </p>
                        </div>
                    ) : isLoading ? (
                        <Loader />
                    ) : error ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="text-destructive">Error load data</div>
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <ConfigsWithClientsTable
                                clients={data?.clients || []}
                                orphanConfigs={data?.orphanConfigs || []}
                                selectedServerId={selectedServerId}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
