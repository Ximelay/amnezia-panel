'use client';

import { api } from '@/trpc/react';
import ServerInfo from './components/server-info';
import ServerActions from './components/server-actions';
import { useEffect, useState } from 'react';
import MultipleSelector, { type Option } from '@/components/ui/multi-select';

export default function ServerPage() {
    const [selectedServer, setSelectedServer] = useState<Option[]>();

    const { data: serversData } = api.servers.getServers.useQuery();

    const serverOptions =
        serversData?.map((server) => ({
            value: String(server.id),
            label: server.name,
        })) || [];

    const { data: serverInfo, isLoading } = api.servers.getServerInfo.useQuery(
        { serverId: Number(selectedServer?.[0]?.value) },
        { enabled: !!selectedServer?.[0]?.value }
    );

    useEffect(() => {
        if (serversData) {
            const firstServer = serversData[0];
            if (!firstServer) return;
            setSelectedServer([{ value: String(firstServer.id), label: firstServer.name }]);
        }
    }, [serversData, selectedServer]);

    const handleServerChange = (selected: Option[]) => {
        setSelectedServer(selected);
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Server Details</h1>
                <p className="text-muted-foreground">View and manage server configuration</p>
            </div>

            <div className="mb-6">
                <div className="mb-4 flex items-center justify-between">
                    <label className="block text-sm font-medium">Select Server</label>
                    {selectedServer && (
                        <span className="text-muted-foreground text-sm">
                            Selected: {selectedServer[0]?.label}
                        </span>
                    )}
                </div>
                <MultipleSelector
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
            ) : isLoading ? (
                <div className="flex justify-center py-8">
                    <div className="text-muted-foreground">Loading server details...</div>
                </div>
            ) : serverInfo ? (
                <div className="grid gap-6 md:grid-cols-2">
                    <ServerInfo server={serverInfo} />
                    <ServerActions serverId={Number(selectedServer[0].value)} />
                </div>
            ) : (
                <div className="border-destructive/50 rounded-lg border p-8 text-center">
                    <p className="text-destructive">Unable to load server details</p>
                </div>
            )}
        </div>
    );
}
