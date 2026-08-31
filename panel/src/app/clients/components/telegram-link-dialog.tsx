'use client';

import { useEffect, useRef, useState } from 'react';
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
import { Check, Copy, Link2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/trpc/react';
import { format } from 'date-fns';

interface Props {
    id: number;
    name: string;
    telegramId?: string | null;
}

export default function TelegramLinkDialog({ id, name, telegramId }: Readonly<Props>) {
    const [open, setOpen] = useState(false);
    const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const utils = api.useUtils();

    // A link issued earlier is still valid, so restore it instead of offering a new one:
    // reissuing would invalidate the payload the client may already have pressed Start on.
    const { data: pendingLink } = api.clients.getTelegramLink.useQuery(
        { id },
        { enabled: open, refetchOnWindowFocus: false }
    );

    useEffect(() => {
        if (pendingLink && !link) setLink(pendingLink);
    }, [pendingLink, link]);

    const generateLink = api.clients.generateTelegramLink.useMutation({
        onSuccess: (data) => setLink(data),
        onError: (error) => {
            toast.error(error.message || 'Failed to generate the link');
            console.error(error);
        },
    });

    // Set while a check was started by the poller rather than by the button, so that
    // "not bound yet" stays silent until the admin actually asks.
    const isAutoCheck = useRef(false);

    const syncLink = api.clients.syncTelegramLink.useMutation({
        onSuccess: (data) => {
            if (!data.bound) {
                if (!isAutoCheck.current)
                    toast.info('No Start yet — ask the client to open the link');
                return;
            }

            toast.success(`Telegram bound: ${data.telegramId}`);
            utils.clients.getClientsWithConfigs.invalidate();
            utils.clients.getTelegramLink.invalidate({ id });
            setLink(null);
            setOpen(false);
        },
        onError: (error) => {
            if (!isAutoCheck.current) {
                toast.error(error.message || 'Failed to check the link');
                console.error(error);
            }
        },
    });

    // Polls while the dialog is open so pressing Start is all the client has to do.
    useEffect(() => {
        if (!open || !link) return;

        const interval = setInterval(() => {
            if (syncLink.isPending) return;
            isAutoCheck.current = true;
            syncLink.mutate({ id });
        }, 3000);

        return () => clearInterval(interval);
    }, [open, link, id, syncLink.isPending]);

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) {
            setLink(null);
            setCopied(false);
        }
    };

    const copyLink = async () => {
        if (!link) return;

        try {
            await navigator.clipboard.writeText(link.url);
            setCopied(true);
            toast.success('Link copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy the link');
        }
    };

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer text-sky-500 hover:text-sky-600"
                        onClick={() => setOpen(true)}>
                        <Link2 className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{telegramId ? 'Rebind Telegram' : 'Bind Telegram'}</p>
                </TooltipContent>
            </Tooltip>

            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="sm:max-w-125">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Link2 className="h-5 w-5" />
                            Bind Telegram
                        </DialogTitle>
                        <DialogDescription>
                            {link
                                ? `Send this link to ${name}. Once they press Start, check the binding below.`
                                : `Generates a one-time link for ${name}. No username or chat id needed — pressing Start is enough.`}
                        </DialogDescription>
                    </DialogHeader>

                    {telegramId && !link && (
                        <div className="space-y-1">
                            <Label className="text-muted-foreground text-sm font-medium">
                                Currently bound chat id
                            </Label>
                            <p className="font-mono text-sm">{telegramId}</p>
                        </div>
                    )}

                    {link && (
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">One-time link</Label>
                            <div className="flex items-center gap-2">
                                <Input value={link.url} readOnly className="flex-1 font-mono" />
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={copyLink}
                                    disabled={copied}
                                    className="shrink-0">
                                    {copied ? (
                                        <Check className="h-4 w-4" />
                                    ) : (
                                        <Copy className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                            <p className="text-muted-foreground text-xs">
                                Waiting for Start — this binds on its own, keep the window open.
                                Valid until {format(new Date(link.expiresAt), 'PPp')}. Anyone with
                                this link can bind their own Telegram to {name}, so send it
                                directly.
                            </p>
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={generateLink.isPending || syncLink.isPending}>
                            Close
                        </Button>
                        {link ? (
                            <Button
                                onClick={() => {
                                    isAutoCheck.current = false;
                                    syncLink.mutate({ id });
                                }}
                                disabled={syncLink.isPending}>
                                {syncLink.isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Checking...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Check now
                                    </>
                                )}
                            </Button>
                        ) : (
                            <Button
                                onClick={() => generateLink.mutate({ id })}
                                disabled={generateLink.isPending}>
                                {generateLink.isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    'Generate link'
                                )}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}