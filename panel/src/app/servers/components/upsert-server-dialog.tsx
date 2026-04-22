'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/trpc/react';
import { upsertServerSchema, type upsertServerFormData } from '@/lib/schemas/servers';
import { InputPassword } from '@/components/input-password';

interface Props {
    server?: {
        id: number;
        name: string;
        ip: string;
        port: number;
        apiKey: string | null;
    };
    trigger?: React.ReactNode;
}

export function UpsertServerDialog({ server, trigger }: Props) {
    const [open, setOpen] = useState(false);
    const utils = api.useUtils();

    const form = useForm<upsertServerFormData>({
        resolver: zodResolver(upsertServerSchema),
        defaultValues: {
            id: undefined,
            name: '',
            ip: '',
            port: '80',
            apiKey: '',
        },
    });

    const upsertServer = api.servers.upsertServer.useMutation({
        onSuccess: () => {
            toast.success('Server was saved successfully');
            utils.servers.getServersTable.invalidate();
            utils.servers.getServers.invalidate();
            setOpen(false);
            form.reset();
        },
        onError: (error) => {
            toast.error('Error saving server');
            console.error(error);
        },
    });

    const onSubmit = (data: upsertServerFormData) => {
        upsertServer.mutate(data);
    };

    useEffect(() => {
        if (server) {
            form.reset({
                id: server.id,
                name: server.name,
                ip: server.ip,
                port: String(server.port),
                apiKey: server.apiKey || undefined,
            });
        }
    }, [server]);

    const defaultTrigger = server ? (
        <Button variant="ghost" size="sm" className="cursor-pointer">
            <Edit className="h-4 w-4" />
        </Button>
    ) : (
        <Button className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Add server
        </Button>
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
            <DialogContent className="sm:max-w-131.25">
                <DialogHeader>
                    <DialogTitle>{server ? 'Edit' : 'Add new'} server</DialogTitle>
                    <DialogDescription>Fill in the information for the server</DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Server name <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter server name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="ip"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        IP/Domain <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter IP or domain" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="port"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Port <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter port" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="apiKey"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Amnezia API Key <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <InputPassword placeholder="Enter API key" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                                disabled={upsertServer.isPending}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={upsertServer.isPending}>
                                {upsertServer.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {upsertServer.isPending ? 'Saving...' : 'Save server'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
