'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Loader2,
    Copy,
    Check,
    User,
    Wifi,
    Calendar,
    Globe,
    Clock,
    Activity,
    Shield,
    Info,
    QrCode,
} from 'lucide-react';
import { cn, formatBytes, formatLastHandshake, getProtocolColor } from '@/lib/utils';
import { toast } from 'sonner';
import { api } from '@/trpc/react';
import type { Protocols } from 'prisma/generated/enums';
import { protocolsMapping } from '@/lib/data/mappings';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import Image from 'next/image';

interface ConfigInfoDialogProps {
    config: {
        id: string;
        clientName: string;
        protocol: Protocols;
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
    };
}

export function ConfigDialog({ config }: ConfigInfoDialogProps) {
    const [open, setOpen] = useState(false);
    const [selectedClientId, setSelectedClientId] = useState<string>(
        config.clientId ? String(config.clientId) : 'none'
    );
    const [copiedKey, setCopiedKey] = useState(false);
    const utils = api.useUtils();

    const { data: qrData, isLoading: isLoadingQr } = api.configs.generateQrCode.useQuery(
        { id: config.id },
        { enabled: open }
    );
    const [enlargedQrIndex, setEnlargedQrIndex] = useState<number | null>(null);

    const { data: vpnKey, isLoading: isLoadingKey } = api.configs.getVpnKey.useQuery(
        { id: config.id },
        { enabled: open }
    );

    const { data: clients } = api.clients.getClients.useQuery({
        serverId: String(config.serverId),
    });

    const getTruncatedKey = (key: string): string => {
        const protocolMatch = key.match(/^([a-zA-Z]+):\/\//);
        if (protocolMatch) {
            return `${protocolMatch[0]}...`;
        }
        return '...';
    };

    const copyKeyToClipboard = async () => {
        if (!vpnKey) return;

        try {
            await navigator.clipboard.writeText(vpnKey);
            setCopiedKey(true);
            toast.success('VPN Config copied to clipboard');
            setTimeout(() => setCopiedKey(false), 2000);
        } catch (err) {
            toast.error('Failed to copy key');
        }
    };

    const updateConfigClient = api.configs.updateClientConfig.useMutation({
        onSuccess: () => {
            toast.success('Client was updated successfully');
            utils.clients.getClientsWithConfigs.invalidate();
            setOpen(false);
        },
        onError: (error) => {
            toast.error('Error updating client');
            console.error(error);
        },
    });

    const handleSaveClient = () => {
        if (selectedClientId === 'none') return;

        updateConfigClient.mutate({
            id: config.id,
            clientId: selectedClientId,
        });
    };

    const totalTraffic = config.traffic.received + config.traffic.sent;

    return (
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                <Tooltip>
                    <DialogTrigger asChild>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <Info className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                    </DialogTrigger>
                    <TooltipContent>
                        <p>Config info</p>
                    </TooltipContent>
                </Tooltip>
                <DialogContent
                    className="max-h-[95vh] overflow-y-auto sm:max-w-150"
                    // onInteractOutside={(e) => {
                    //     if (enlargedQrIndex !== null) e.preventDefault();
                    // }}
                    // onEscapeKeyDown={(e) => {
                    //     if (enlargedQrIndex !== null) e.preventDefault();
                    // }}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5" />
                            Config Details
                        </DialogTitle>
                        <DialogDescription>
                            View and manage configuration settings
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label className="text-muted-foreground text-sm font-medium">
                                    Username
                                </Label>
                                <div className="flex items-center gap-2">
                                    <User className="text-muted-foreground h-4 w-4" />
                                    <span className="font-medium">{config.clientName}</span>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-muted-foreground text-sm font-medium">
                                    Status
                                </Label>
                                <Badge
                                    variant={config.online ? 'default' : 'secondary'}
                                    className={cn(
                                        config.online
                                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
                                    )}>
                                    {config.online ? 'Online' : 'Offline'}
                                </Badge>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-muted-foreground text-sm font-medium">
                                    Protocol
                                </Label>
                                <Badge
                                    variant="default"
                                    className={getProtocolColor(config.protocol)}>
                                    {protocolsMapping[config.protocol]}
                                </Badge>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-muted-foreground text-sm font-medium">
                                    Created at
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Calendar className="text-muted-foreground h-4 w-4" />
                                    <span>{format(config.createdAt, 'PP')}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-medium">VPN Config</Label>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Input
                                        value={vpnKey ? getTruncatedKey(vpnKey) : ''}
                                        readOnly
                                        className="font-mono"
                                        placeholder={
                                            isLoadingKey ? 'Loading...' : 'No key available'
                                        }
                                    />
                                    <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-transparent via-transparent to-white dark:to-gray-950" />
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={copyKeyToClipboard}
                                    disabled={!vpnKey || copiedKey}
                                    className="shrink-0">
                                    {copiedKey ? (
                                        <Check className="h-4 w-4" />
                                    ) : (
                                        <Copy className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                            {isLoadingQr ? (
                                <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin" />
                            ) : (
                                qrData &&
                                qrData.total > 0 && (
                                    <div className="rounded-md border p-3 pt-4">
                                        <div className="mb-2 flex items-center gap-2">
                                            <QrCode className="text-muted-foreground h-4 w-4" />
                                            <span className="text-sm font-medium">
                                                QR Code ({qrData.total} part
                                                {qrData.total > 1 ? 's' : ''})
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-3">
                                            {qrData.items.map((src, index) => (
                                                <div
                                                    key={index}
                                                    className="relative cursor-pointer rounded border bg-gray-50 p-1 hover:border-blue-400 dark:bg-gray-800"
                                                    onClick={() => setEnlargedQrIndex(index)}>
                                                    <div className="relative h-20 w-20">
                                                        <Image
                                                            src={src}
                                                            alt={`QR part ${index + 1}`}
                                                            fill
                                                            className="object-contain"
                                                            sizes="80px"
                                                        />
                                                    </div>
                                                    <div className="text-muted-foreground mt-1 text-center text-xs">
                                                        {index + 1}/{qrData.total}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {qrData.total > 1 && (
                                            <p className="text-muted-foreground mt-2 text-xs">
                                                Scan parts in order to import the full
                                                configuration.
                                            </p>
                                        )}
                                    </div>
                                )
                            )}
                        </div>

                        <div className="space-y-3">
                            <h3 className="flex items-center gap-2 font-medium">
                                <Activity className="h-4 w-4" />
                                Connection Statistics
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground text-sm font-medium">
                                        Traffic (Total)
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        <Wifi className="text-muted-foreground h-4 w-4" />
                                        <span>{formatBytes(totalTraffic)}</span>
                                    </div>
                                    <div className="text-muted-foreground text-xs">
                                        ↑ {formatBytes(config.traffic.sent)} / ↓{' '}
                                        {formatBytes(config.traffic.received)}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-muted-foreground text-sm font-medium">
                                        Last Handshake
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        <Clock className="text-muted-foreground h-4 w-4" />
                                        <span>{formatLastHandshake(config.lastHandshake)}</span>
                                    </div>
                                </div>

                                {config.endpoint && (
                                    <div className="col-span-2 space-y-1">
                                        <Label className="text-muted-foreground text-sm font-medium">
                                            Endpoint
                                        </Label>
                                        <div className="flex items-center gap-2">
                                            <Globe className="text-muted-foreground h-4 w-4" />
                                            <span className="font-mono text-sm">
                                                {config.endpoint}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {config.allowedIps.length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">Allowed IPs</Label>
                                <div className="flex flex-wrap gap-2">
                                    {config.allowedIps.map((ip, index) => (
                                        <Badge key={index} variant="outline" className="font-mono">
                                            {ip}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-3 border-t pt-3">
                            <Label className="text-sm font-medium">Client Assignment</Label>

                            <div className="flex items-center gap-2">
                                <Select
                                    value={selectedClientId}
                                    onValueChange={setSelectedClientId}
                                    disabled={updateConfigClient.isPending}>
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Select a client" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No client (Orphan)</SelectItem>
                                        {clients?.map((client) => (
                                            <SelectItem key={client.id} value={String(client.id)}>
                                                {client.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Button
                                    onClick={handleSaveClient}
                                    disabled={
                                        updateConfigClient.isPending ||
                                        selectedClientId ===
                                            (config.clientId ? String(config.clientId) : 'none')
                                    }
                                    className="shrink-0">
                                    {updateConfigClient.isPending ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        'Save'
                                    )}
                                </Button>
                            </div>
                        </div>

                        {config.expiresAt && (
                            <div className="space-y-1 border-t pt-3">
                                <Label className="text-muted-foreground text-sm font-medium">
                                    Expiration Date
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Calendar className="text-muted-foreground h-4 w-4" />
                                    <span>
                                        {format(new Date(Number(config.expiresAt) * 1000), 'PPP')}
                                    </span>
                                    <Badge variant="outline" className="ml-2">
                                        {new Date(config.expiresAt) > new Date()
                                            ? 'Active'
                                            : 'Expired'}
                                    </Badge>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={enlargedQrIndex !== null} onOpenChange={() => setEnlargedQrIndex(null)}>
                <DialogContent
                    className="flex h-screen w-screen max-w-none items-center justify-center border-0 bg-transparent p-0 shadow-none"
                    showCloseButton={false}>
                    <DialogHeader>
                        <DialogTitle />
                        <DialogDescription />
                    </DialogHeader>
                    <div className="relative max-h-[90vh] max-w-[90vw] rounded-lg bg-white p-4 shadow-xl dark:bg-gray-900">
                        <button
                            onClick={() => setEnlargedQrIndex(null)}
                            className="absolute -top-3 -right-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white shadow-md dark:bg-gray-800">
                            ✕
                        </button>
                        <div className="relative h-[80vh] w-[50vw]">
                            {enlargedQrIndex !== null && qrData?.items[enlargedQrIndex] && (
                                <Image
                                    src={qrData.items[enlargedQrIndex]}
                                    alt={`QR part ${enlargedQrIndex + 1} enlarged`}
                                    fill
                                    className="object-contain"
                                    sizes="50vw"
                                />
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
