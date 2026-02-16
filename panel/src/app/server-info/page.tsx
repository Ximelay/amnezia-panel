'use client';

import { api } from '@/trpc/react';
import ServerInfo from './components/server-info';
import ServerActions from './components/server-actions';
import { useEffect, useMemo, useState } from 'react';
import MultipleSelector, { type Option } from '@/components/ui/multi-select';
import { Loader } from '@/components/loader';
import { Button } from '@/components/ui/button';

export default function ServerPage() {
    const [selectedServer, setSelectedServer] = useState<Option[]>();
    const [defaultServerId, setDefaultServerId] = useState<string | null>(null);

    const { data: serversData, isLoading: isLoadingServers } = api.servers.getServers.useQuery();

    useEffect(() => {
        if (typeof window !== 'undefined' && serversData) {
            const stored = localStorage.getItem('defaultServerId');
            if (stored) {
                const server = serversData.find((s) => s.id === Number(stored));
                if (server) {
                    setDefaultServerId(stored);
                    setSelectedServer([{ value: String(server.id), label: server.name }]);
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
        if (selectedServer?.[0]) return selectedServer[0]?.value;
    }, [selectedServer]);

    const { data: serverInfo, isLoading: isLoadingServerInfo } = api.servers.getServerInfo.useQuery(
        { serverId: Number(selectedServerId) || Number(defaultServerId) },
        { enabled: !!selectedServerId || !!defaultServerId }
    );

    const {
        data: serverLoad,
        isLoading: isLoadingServerLoad,
        refetch: refetchServerLoad,
        isRefetching: isRefetchingServerLoad,
    } = api.servers.getServerLoad.useQuery(
        { serverId: Number(selectedServerId) },
        { enabled: !!selectedServerId }
    );

    const handleServerChange = (selected: Option[]) => {
        setSelectedServer(selected);
    };

    const handleRefreshLoad = () => {
        refetchServerLoad();
    };

    if (isLoadingServers) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader />
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Server Details</h1>
                <p className="text-muted-foreground">
                    View and manage server configuration and performance
                </p>
            </div>

            <div className="mb-6 grid gap-1">
                <label className="block text-sm font-medium">Select Server</label>
                <MultipleSelector
                    className="w-64"
                    value={selectedServer}
                    onChange={handleServerChange}
                    defaultOptions={serverOptions}
                    placeholder="Select a server..."
                    maxSelected={1}
                    hidePlaceholderWhenSelected={true}
                />
            </div>

            {!selectedServer?.[0]?.value ? (
                <div className="rounded-lg border-2 border-dashed p-8 text-center">
                    <p className="text-muted-foreground">Please select a server to view details</p>
                </div>
            ) : isLoadingServerInfo ? (
                <div className="flex justify-center py-8">
                    <div className="text-muted-foreground">Loading server details...</div>
                </div>
            ) : serverInfo ? (
                <>
                    <div className="mb-8 grid gap-6 md:grid-cols-2">
                        <ServerInfo server={serverInfo} />
                        <ServerActions serverId={Number(selectedServer[0].value)} />
                    </div>

                    <div className="rounded-lg border p-6 shadow-sm">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-2xl font-bold">Server Performance</h2>
                            <Button
                                type="button"
                                onClick={handleRefreshLoad}
                                disabled={isRefetchingServerLoad}>
                                {isRefetchingServerLoad ? 'Refreshing...' : 'Refresh Data'}
                            </Button>
                        </div>

                        {isLoadingServerLoad && !serverLoad ? (
                            <div className="flex justify-center py-12">
                                <Loader />
                            </div>
                        ) : serverLoad ? (
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                                <div className="rounded-lg border p-4">
                                    <h3 className="mb-2 font-semibold">CPU</h3>
                                    <div className="space-y-1">
                                        <p className="text-sm">Cores: {serverLoad.cpu.cores}</p>
                                        <p className="text-sm">
                                            Load Average: {serverLoad.loadavg.join(', ')}
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-lg border p-4">
                                    <h3 className="mb-2 font-semibold">Memory</h3>
                                    <div className="space-y-1">
                                        <p className="text-sm">
                                            Used:{' '}
                                            {Math.round(serverLoad.memory.usedBytes / 1024 / 1024)}{' '}
                                            MB
                                        </p>
                                        <p className="text-sm">
                                            Free:{' '}
                                            {Math.round(serverLoad.memory.freeBytes / 1024 / 1024)}{' '}
                                            MB
                                        </p>
                                        <p className="text-sm">
                                            Total:{' '}
                                            {Math.round(serverLoad.memory.totalBytes / 1024 / 1024)}{' '}
                                            MB
                                        </p>
                                        <div className="bg-secondary mt-2 h-2 w-full rounded-full">
                                            <div
                                                className="bg-primary h-full rounded-full"
                                                style={{
                                                    width: `${(serverLoad.memory.usedBytes / serverLoad.memory.totalBytes) * 100}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-lg border p-4">
                                    <h3 className="mb-2 font-semibold">Disk</h3>
                                    <div className="space-y-1">
                                        <p className="text-sm">
                                            Used:{' '}
                                            {Math.round(
                                                serverLoad.disk.usedBytes / 1024 / 1024 / 1024
                                            )}{' '}
                                            GB
                                        </p>
                                        <p className="text-sm">
                                            Free:{' '}
                                            {Math.round(
                                                serverLoad.disk.availableBytes / 1024 / 1024 / 1024
                                            )}{' '}
                                            GB
                                        </p>
                                        <p className="text-sm">
                                            Total:{' '}
                                            {Math.round(
                                                serverLoad.disk.totalBytes / 1024 / 1024 / 1024
                                            )}{' '}
                                            GB
                                        </p>
                                        <div className="bg-secondary mt-2 h-2 w-full rounded-full">
                                            <div
                                                className="bg-primary h-full rounded-full"
                                                style={{ width: `${serverLoad.disk.usedPercent}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-lg border p-4">
                                    <h3 className="mb-2 font-semibold">Network</h3>
                                    <div className="space-y-1">
                                        <p className="text-sm">
                                            Received:{' '}
                                            {Math.round(serverLoad.network.rxBytes / 1024 / 1024)}{' '}
                                            MB
                                        </p>
                                        <p className="text-sm">
                                            Transmitted:{' '}
                                            {Math.round(serverLoad.network.txBytes / 1024 / 1024)}{' '}
                                            MB
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-lg border p-4">
                                    <h3 className="mb-2 font-semibold">System</h3>
                                    <div className="space-y-1">
                                        <p className="text-sm">
                                            Uptime: {Math.round(serverLoad.uptimeSec / 3600)} hours
                                        </p>
                                        <p className="text-muted-foreground text-sm">
                                            Last updated at{' '}
                                            {new Date(serverLoad.timestamp).toLocaleTimeString(
                                                'en-US'
                                            )}
                                        </p>
                                    </div>
                                </div>

                                {serverLoad.docker?.containers.length > 0 && (
                                    <div className="rounded-lg border p-4">
                                        <h3 className="mb-2 font-semibold">Docker Containers</h3>
                                        {serverLoad.docker.containers.map((container) => (
                                            <div
                                                key={container.name}
                                                className="mb-2 border-b pb-2 last:border-0">
                                                <p className="font-medium">{container.name}</p>
                                                <div className="grid grid-cols-2 gap-1 text-sm">
                                                    <span>
                                                        CPU: {container.cpuPercent.toFixed(2)}%
                                                    </span>
                                                    <span>
                                                        Memory:{' '}
                                                        {Math.round(
                                                            container.memUsageBytes / 1024 / 1024
                                                        )}
                                                        MB
                                                    </span>
                                                    <span>PIDs: {container.pids}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex justify-center py-8">
                                <div className="text-muted-foreground">
                                    Unable to load performance data
                                </div>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="border-destructive/50 rounded-lg border p-8 text-center">
                    <p className="text-destructive">Unable to load server details</p>
                </div>
            )}
        </div>
    );
}
