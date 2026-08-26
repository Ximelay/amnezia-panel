'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, Copy, Download, Loader2, QrCode, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/trpc/react';
import Image from 'next/image';

interface Props {
    id: string;
    clientName: string;
}

interface ReissueResult {
    id: string;
    clientName: string;
    vpnKey: string;
    qrCode: { total: number; items: string[] } | null;
}

export default function ReissueConfigDialog({ id, clientName }: Readonly<Props>) {
    const [open, setOpen] = useState(false);
    const [result, setResult] = useState<ReissueResult | null>(null);
    const [copied, setCopied] = useState(false);

    const utils = api.useUtils();

    const reissueConfig = api.configs.reissueConfig.useMutation({
        onSuccess: (data) => {
            setResult(data);
            utils.clients.getClientsWithConfigs.invalidate();
            toast.success('Config was successfully reissued');
        },
        onError: (error) => {
            toast.error(error.message || 'Error reissuing config');
            console.error(error);
        },
    });

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) {
            setResult(null);
            setCopied(false);
        }
    };

    const copyKeyToClipboard = async () => {
        if (!result) return;

        try {
            await navigator.clipboard.writeText(result.vpnKey);
            setCopied(true);
            toast.success('VPN Config copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy key');
        }
    };

    const downloadKey = () => {
        if (!result) return;

        const url = URL.createObjectURL(new Blob([result.vpnKey], { type: 'text/plain' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${result.clientName}.conf`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer text-amber-500 hover:text-amber-600"
                        onClick={() => setOpen(true)}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Reissue config</p>
                </TooltipContent>
            </Tooltip>

            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-125">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <RefreshCw className="h-5 w-5" />
                            Reissue config
                        </DialogTitle>
                        <DialogDescription>
                            {result
                                ? 'The new config is ready to be sent to the client.'
                                : `A new config replaces <${clientName}> on the same server and protocol, keeping the client and expiration date. The old one stops working.`}
                        </DialogDescription>
                    </DialogHeader>

                    {result ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">VPN Config</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={result.vpnKey}
                                        readOnly
                                        className="flex-1 font-mono"
                                    />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={copyKeyToClipboard}
                                        disabled={copied}
                                        className="shrink-0">
                                        {copied ? (
                                            <Check className="h-4 w-4" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={downloadKey}
                                        className="shrink-0">
                                        <Download className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {result.qrCode && result.qrCode.total > 0 && (
                                <div className="rounded-md border p-3 pt-4">
                                    <div className="mb-2 flex items-center gap-2">
                                        <QrCode className="text-muted-foreground h-4 w-4" />
                                        <span className="text-sm font-medium">
                                            QR Code ({result.qrCode.total} part
                                            {result.qrCode.total > 1 ? 's' : ''})
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap justify-center gap-3">
                                        {result.qrCode.items.map((src, index) => (
                                            <div
                                                key={index}
                                                className="rounded border bg-gray-50 p-1 dark:bg-gray-800">
                                                <div className="relative h-45 w-45">
                                                    <Image
                                                        src={src}
                                                        alt={`QR part ${index + 1}`}
                                                        fill
                                                        className="object-contain"
                                                        sizes="180px"
                                                    />
                                                </div>
                                                {result.qrCode!.total > 1 && (
                                                    <div className="text-muted-foreground mt-1 text-center text-xs">
                                                        {index + 1}/{result.qrCode!.total}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {result.qrCode.total > 1 && (
                                        <p className="text-muted-foreground mt-2 text-xs">
                                            Scan parts in order to import the full configuration.
                                        </p>
                                    )}
                                </div>
                            )}

                            <DialogFooter>
                                <Button onClick={() => handleOpenChange(false)}>Done</Button>
                            </DialogFooter>
                        </div>
                    ) : (
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => handleOpenChange(false)}
                                disabled={reissueConfig.isPending}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() => reissueConfig.mutate({ id })}
                                disabled={reissueConfig.isPending}>
                                {reissueConfig.isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Reissuing...
                                    </>
                                ) : (
                                    'Reissue'
                                )}
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}