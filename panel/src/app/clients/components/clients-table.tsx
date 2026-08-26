'use client';

import { useMemo, useState } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Check,
    ChevronDownIcon,
    ChevronRightIcon,
    Copy,
    Loader2,
    Send,
    TriangleAlert,
    UserIcon,
} from 'lucide-react';
import {
    cn,
    formatBytes,
    formatDate,
    formatLastHandshake,
    getProtocolColor,
    telegramToastError,
} from '@/lib/utils';
import type { Languages, Protocols } from 'prisma/generated/enums';
import { UpdateClientDialog } from './client-dialog';
import DeleteClientDialog from './delete-client-dialog';
import TelegramLinkDialog from './telegram-link-dialog';
import { protocolLabel } from '@/lib/data/mappings';
import DeleteConfigDialog from './delete-config-dialog';
import ReissueConfigDialog from './reissue-config-dialog';
import { ConfigDialog } from './config-dialog';
import { api } from '@/trpc/react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AddConfigClientDialog } from './add-config-dialog';
import { Switch } from '@/components/ui/switch';
import { UpdateExpiresAtDialog } from './update-expires-at-dialog';

interface ConfigsWithClientsProps {
    clients: Array<{
        id: number;
        name: string;
        language: Languages;
        status: boolean;
        telegramId: string | null;
        createdAt: Date;
        configsCount: number;
        configs: Array<{
            id: string;
            clientName: string;
            protocol: Protocols;
            protocolVersion: string | null;
            protocolOutdated: boolean;
            online: boolean;
            status: boolean;
            lastHandshake: string | null;
            traffic: {
                received: number;
                sent: number;
            };
            allowedIps: string[];
            endpoint: string | null;
            expiresAt: string | null;
            createdAt: Date;
            clientId: number | null;
            serverId: number;
        }>;
    }>;
    orphanConfigs: Array<{
        id: string;
        clientName: string;
        protocol: Protocols;
        protocolVersion: string | null;
        protocolOutdated: boolean;
        online: boolean;
        status: boolean;
        lastHandshake: string | null;
        traffic: {
            received: number;
            sent: number;
        };
        allowedIps: string[];
        endpoint: string | null;
        expiresAt: string | null;
        createdAt: Date;
        clientId: number | null;
        serverId: number;
    }>;
    selectedServerId: string;
}

export function ConfigsWithClientsTable({
    clients,
    orphanConfigs,
    selectedServerId,
}: Readonly<ConfigsWithClientsProps>) {
    const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

    const toggleClient = (clientId: string) => {
        const newExpanded = new Set(expandedClients);
        if (newExpanded.has(clientId)) {
            newExpanded.delete(clientId);
        } else {
            newExpanded.add(clientId);
        }
        setExpandedClients(newExpanded);
    };

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-12.5"></TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Online</TableHead>
                    <TableHead>Expires at</TableHead>
                    <TableHead>Protocol</TableHead>
                    <TableHead>Last handshake</TableHead>
                    <TableHead>Traffic</TableHead>
                    <TableHead className="w-25">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {clients.map((client) => (
                    <ClientRow
                        key={client.id}
                        client={client}
                        selectedServerId={selectedServerId}
                        isExpanded={expandedClients.has(String(client.id))}
                        onToggle={() => toggleClient(String(client.id))}
                    />
                ))}

                {orphanConfigs.map((config) => (
                    <ConfigRow key={config.id} config={config} isNested={false} />
                ))}
            </TableBody>
        </Table>
    );
}

function ClientRow({
    client,
    isExpanded,
    selectedServerId,
    onToggle,
}: Readonly<{
    client: {
        id: number;
        name: string;
        language: Languages;
        status: boolean;
        telegramId: string | null;
        createdAt: Date;
        configsCount: number;
        configs: Array<{
            id: string;
            clientName: string;
            protocol: Protocols;
            protocolVersion: string | null;
            protocolOutdated: boolean;
            status: boolean;
            online: boolean;
            lastHandshake: string | null;
            traffic: {
                received: number;
                sent: number;
            };
            allowedIps: string[];
            endpoint: string | null;
            expiresAt: string | null;
            createdAt: Date;
            clientId: number | null;
            serverId: number;
        }>;
    };
    selectedServerId: string;
    isExpanded: boolean;
    onToggle: () => void;
}>) {
    const utils = api.useUtils();

    const [copiedChatId, setCopiedChatId] = useState(false);

    // Collapsed rows hide the per-config badges, so the count has to surface here or an
    // upgraded server would leave stale configs invisible until someone expands a row.
    const outdatedConfigsCount = useMemo(
        () => client.configs.filter((config) => config.protocolOutdated).length,
        [client.configs]
    );

    const configsWord = useMemo(() => {
        const count = client.configsCount;

        if (count === 1) {
            return 'config';
        } else {
            return 'configs';
        }
    }, [client.configsCount]);

    const totalTraffic = useMemo(() => {
        return client.configs.reduce((total, config) => {
            return total + config.traffic.received + config.traffic.sent;
        }, 0);
    }, [client.configs]);

    const sendConfigs = api.clients.sendKeysForClient.useMutation({
        onSuccess: () => {
            toast.success('VPN configs were sent successfully');
        },
        onError: (error) => {
            telegramToastError(error);
        },
    });

    const onSubmitConfigs = () => {
        sendConfigs.mutate({ id: client.id });
    };

    const sendLinks = api.clients.sendDownloadLinks.useMutation({
        onSuccess: () => {
            toast.success('AmneziaVPN links were sent successfully');
        },
        onError: (error) => {
            telegramToastError(error);
        },
    });

    const onSubmitLinks = () => {
        sendLinks.mutate({ id: client.id });
    };

    const updateStatus = api.clients.updateStatus.useMutation({
        onSuccess: () => {
            toast.success('Status was changed successfully');
            utils.clients.getClientsWithConfigs.invalidate();
        },
        onError: (error) => {
            toast.error('Failed to change status');
            console.error(error);
        },
    });

    const onToggleStatus = (newStatus: boolean) => {
        updateStatus.mutate({
            clientId: client.id,
            status: newStatus ? 'active' : 'disabled',
        });
    };

    const copyChatIdToClipboard = async (chatId: string | null) => {
        if (!chatId) return;

        try {
            await navigator.clipboard.writeText(chatId);
            setCopiedChatId(true);
            toast.success('Telegram Chat ID copied to clipboard');
            setTimeout(() => setCopiedChatId(false), 2000);
        } catch (err) {
            toast.error('Failed to copy Telegram Chat ID');
        }
    };

    const isTelegramEnabled = process.env.NEXT_PUBLIC_USES_TELEGRAM_BOT === 'true';

    const { data: paymentSettings } = api.paymentSettings.getPaymentSettings.useQuery(undefined, {
        enabled: isTelegramEnabled,
    });

    const calculatedTotalPrice = useMemo(() => {
        if (!paymentSettings) return;

        const configsCount = Number(client.configsCount);
        if (configsCount <= paymentSettings.defaultConfigsCount) {
            return paymentSettings.defaultPrice;
        }

        const extraCount = configsCount - paymentSettings.defaultConfigsCount;
        return paymentSettings.defaultPrice + extraCount * paymentSettings.additionalPrice;
    }, [client, paymentSettings]);

    return (
        <>
            <TableRow>
                <TableCell>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onToggle}
                        className="h-8 w-8 p-0"
                        disabled={client.configsCount === 0}>
                        {client.configsCount > 0 ? (
                            isExpanded ? (
                                <ChevronDownIcon className="h-4 w-4" />
                            ) : (
                                <ChevronRightIcon className="h-4 w-4" />
                            )
                        ) : (
                            <div className="h-4 w-4" />
                        )}
                    </Button>
                </TableCell>
                <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onToggle}
                            disabled={client.configsCount === 0}
                            className="flex items-center gap-2 hover:bg-transparent">
                            <UserIcon className="h-4 w-4" />
                            <div className="grid">
                                {client.name}
                                {paymentSettings && <span className='text-red-500 text-left'>{calculatedTotalPrice}₽</span>}
                            </div>
                        </Button>

                        {outdatedConfigsCount > 0 && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge
                                        variant="outline"
                                        className="cursor-help border-amber-500/40 text-xs whitespace-nowrap text-amber-600 dark:text-amber-400">
                                        <TriangleAlert className="mr-1 h-3 w-3" />
                                        {outdatedConfigsCount}
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>
                                        {outdatedConfigsCount} of this client&apos;s configs
                                        were issued on an older protocol version than the
                                        server now hands out. Expand the row to reissue
                                        them.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        )}

                        {client.telegramId && (
                            <Badge
                                variant="outline"
                                className="cursor-pointer text-xs whitespace-nowrap"
                                onClick={() => {
                                    copyChatIdToClipboard(client.telegramId);
                                }}>
                                <div className="flex items-center gap-1">
                                    <span>{client.telegramId}</span>
                                    {copiedChatId ? (
                                        <Check className="h-3 w-3" />
                                    ) : (
                                        <Copy className="h-3 w-3" />
                                    )}
                                </div>
                            </Badge>
                        )}
                    </div>
                </TableCell>
                <TableCell>
                    <Switch
                        checked={client.status}
                        onCheckedChange={onToggleStatus}
                        disabled={updateStatus.isPending}
                    />
                    {updateStatus.isPending && (
                        <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />
                    )}
                </TableCell>
                <TableCell>
                    <span className="text-muted-foreground">
                        {client.configsCount} {configsWord}
                    </span>
                </TableCell>
                <TableCell>
                    <UpdateExpiresAtDialog isClient id={String(client.id)} />
                </TableCell>
                <TableCell>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                disabled={sendConfigs.isPending}
                                onClick={onSubmitConfigs}
                                size="sm"
                                variant="outline">
                                {sendConfigs.isPending && (
                                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                )}
                                {sendConfigs.isPending ? 'Sending...' : 'Send configs'}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Send config keys to Telegram</p>
                        </TooltipContent>
                    </Tooltip>
                </TableCell>
                <TableCell>
                    {process.env.NEXT_PUBLIC_USES_TELEGRAM_BOT === 'true' && client.telegramId ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    disabled={sendLinks.isPending}
                                    onClick={onSubmitLinks}
                                    variant="outline"
                                    size="sm">
                                    {sendLinks.isPending && (
                                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                    )}
                                    {sendLinks.isPending ? 'Sending...' : 'Send links'}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Send AmneziaVPN links to Telegram</p>
                            </TooltipContent>
                        </Tooltip>
                    ) : (
                        '—'
                    )}
                </TableCell>
                <TableCell>{formatBytes(totalTraffic)}</TableCell>
                <TableCell>
                    <div className="flex items-center justify-end gap-1">
                        <AddConfigClientDialog
                            clientId={String(client.id)}
                            clientName={client.name}
                            serverId={selectedServerId}
                        />
                        <TelegramLinkDialog
                            id={client.id}
                            name={client.name}
                            telegramId={client.telegramId}
                        />
                        <UpdateClientDialog
                            id={client.id}
                            name={client.name}
                            language={client.language}
                            telegramId={client.telegramId}
                        />
                        <DeleteClientDialog id={client.id} />
                    </div>
                </TableCell>
            </TableRow>

            {isExpanded &&
                client.configs.map((config) => (
                    <ConfigRow key={config.id} config={config} isNested={true} />
                ))}
        </>
    );
}

function ConfigRow({
    config,
    isNested = false,
}: Readonly<{
    config: {
        id: string;
        clientName: string;
        protocol: Protocols;
        protocolVersion: string | null;
        protocolOutdated: boolean;
        online: boolean;
        status: boolean;
        lastHandshake: string | null;
        traffic: {
            received: number;
            sent: number;
        };
        allowedIps: string[];
        endpoint: string | null;
        expiresAt: string | null;
        createdAt: Date;
        clientId: number | null;
        serverId: number;
    };
    isNested?: boolean;
}>) {
    const utils = api.useUtils();

    const totalTraffic = config.traffic.received + config.traffic.sent;
    const numberExpiresAt = Number(config.expiresAt);

    const sendMessage = api.configs.sendVpnKey.useMutation({
        onSuccess: () => {
            toast.success('VPN config was sent successfully');
        },
        onError: (error) => {
            telegramToastError(error);
        },
    });

    const onSubmit = () => {
        sendMessage.mutate({ id: config.id });
    };

    const updateStatus = api.configs.updateStatus.useMutation({
        onSuccess: () => {
            toast.success('Status was changed successfully');
            utils.clients.getClientsWithConfigs.invalidate();
        },
        onError: (error) => {
            toast.error('Failed to change status');
            console.error(error);
        },
    });

    const onToggleStatus = (newStatus: boolean) => {
        updateStatus.mutate({
            id: config.id,
            serverId: config.serverId,
            protocol: config.protocol,
            status: newStatus ? 'active' : 'disabled',
        });
    };

    return (
        <TableRow className={isNested ? 'bg-muted/20' : ''}>
            <TableCell>{isNested && <div className="ml-4"></div>}</TableCell>
            <TableCell>
                <div className={`flex items-center gap-2 ${isNested ? 'ml-6' : ''}`}>
                    <span>{config.clientName}</span>
                </div>
            </TableCell>
            <TableCell>
                <Switch
                    checked={config.status}
                    onCheckedChange={onToggleStatus}
                    disabled={updateStatus.isPending}
                />
                {updateStatus.isPending && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
            </TableCell>
            <TableCell>
                <Badge
                    variant={config.online ? 'default' : 'secondary'}
                    className={cn(
                        config.online
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
                    )}>
                    {config.online ? 'Online' : 'Offline'}
                </Badge>
            </TableCell>
            <TableCell>
                <div className="flex items-center">
                    {formatDate(numberExpiresAt * 1000)}
                    <UpdateExpiresAtDialog
                        isClient={false}
                        id={config.id}
                        expiresAt={config.expiresAt}
                    />
                </div>
            </TableCell>
            <TableCell>
                <div className="flex items-center gap-1.5">
                    <Badge variant="default" className={getProtocolColor(config.protocol)}>
                        {protocolLabel(config.protocol, config.protocolVersion)}
                    </Badge>
                    {config.protocolOutdated && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <TriangleAlert className="h-4 w-4 shrink-0 cursor-help text-amber-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>
                                    Issued on an older protocol version than this server
                                    now hands out. Reissue it to bring the client up to
                                    date.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </TableCell>
            <TableCell>{formatLastHandshake(config.lastHandshake)}</TableCell>
            <TableCell>{formatBytes(totalTraffic)}</TableCell>
            <TableCell>
                <div className="flex items-center justify-end gap-2">
                    {process.env.NEXT_PUBLIC_USES_TELEGRAM_BOT === 'true' && isNested && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="cursor-pointer text-blue-400 hover:text-blue-600"
                                    onClick={onSubmit}
                                    disabled={sendMessage.isPending}>
                                    {sendMessage.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="h-4 w-4" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Send config to Telegram</p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                    <ConfigDialog config={config} />
                    <ReissueConfigDialog id={config.id} clientName={config.clientName} />
                    <DeleteConfigDialog
                        id={config.id}
                        serverId={config.serverId}
                        protocol={config.protocol}
                    />
                </div>
            </TableCell>
        </TableRow>
    );
}
