'use client';

import { useState, useEffect, useMemo } from 'react';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, Loader2 } from 'lucide-react';
import { addMonths, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { api } from '@/trpc/react';
import { createConfigSchema, type createConfigFormData } from '@/lib/schemas/configs';
import { protocolsMapping } from '@/lib/data/mappings';
import MultipleSelector from '@/components/ui/multi-select';

export function CreateConfigDialog() {
    const [open, setOpen] = useState(false);
    const [clientNameTouched, setClientNameTouched] = useState(false);
    const utils = api.useUtils();

    const form = useForm<createConfigFormData>({
        resolver: zodResolver(createConfigSchema),
        defaultValues: {
            clientId: '',
            serverId: '',
            clientName: '',
            expiresAt: '',
            protocol: undefined,
        },
    });

    const { data: servers, isLoading: isLoadingServers } = api.servers.getServers.useQuery(
        undefined,
        { enabled: open }
    );

    const [localServers, setLocalServers] = useState<typeof servers>([]);

    useEffect(() => {
        if (servers) {
            setLocalServers(servers);
        }
    }, [servers]);

    const watchServerId = form.watch('serverId');

    const { data: clients, isLoading: isLoadingClients } = api.clients.getClients.useQuery(
        {
            serverId: watchServerId,
        },
        { enabled: open }
    );

    const watchClientId = form.watch('clientId');

    const [localClients, setLocalClients] = useState<typeof clients>([]);

    useEffect(() => {
        if (clients) {
            setLocalClients(clients);
        }
    }, [clients]);

    const clientOptions = useMemo(() => {
        if (!localClients) return [];
        return localClients.map((client) => ({
            value: String(client.id),
            label: client.name,
        }));
    }, [localClients]);

    useEffect(() => {
        if (watchClientId && watchClientId !== '') {
            const selectedClient = clients?.find((client) => String(client.id) === watchClientId);
            if (selectedClient) {
                form.setValue('clientName', `${selectedClient.name}-`, {
                    shouldValidate: true,
                });
            }
        }
    }, [watchClientId, clients, form, clientNameTouched]);

    useEffect(() => {
        const subscription = form.watch((_, { name }) => {
            if (name === 'clientName') {
                setClientNameTouched(true);
            }
        });
        return () => subscription.unsubscribe();
    }, [form]);

    useEffect(() => {
        if (!open) {
            setClientNameTouched(false);
        }
    }, [open]);

    const createConfig = api.configs.createConfig.useMutation({
        onSuccess: () => {
            toast.success('Config was created successfully');
            utils.clients.getClientsWithConfigs.invalidate();
            setOpen(false);
            setClientNameTouched(false);
            form.reset();
        },
        onError: (error) => {
            toast.error('Error creating config');
            console.error(error);
        },
    });

    const onSubmit = (data: createConfigFormData) => {
        createConfig.mutate(data);
    };

    const setQuickDate = (monthsToAdd: number) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const newDate = addMonths(today, monthsToAdd);
        const unixTimestamp = Math.floor(newDate.getTime() / 1000).toString();
        
        form.setValue('expiresAt', unixTimestamp, {
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true,
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="cursor-pointer" variant={'outline'}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Config
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-131.25">
                <DialogHeader>
                    <DialogTitle>Create New Config</DialogTitle>
                    <DialogDescription>
                        Fill in the information for the new configuration
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {isLoadingServers || !localServers ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="ml-2 text-sm">Loading servers...</span>
                            </div>
                        ) : (
                            <FormField
                                control={form.control}
                                name="serverId"
                                render={({ field }) => {
                                    const serverOptions = useMemo(() => {
                                        if (!localServers) return [];
                                        return localServers.map((server) => ({
                                            value: String(server.id),
                                            label: server.name,
                                        }));
                                    }, [localServers]);

                                    const currentValue = useMemo(() => {
                                        if (!field.value) return [];
                                        const server = localServers?.find(
                                            (c) => String(c.id) === String(field.value)
                                        );
                                        return server
                                            ? [
                                                  {
                                                      value: String(server.id),
                                                      label: server.name,
                                                  },
                                              ]
                                            : [];
                                    }, [field.value, localServers]);

                                    return (
                                        <FormItem>
                                            <FormLabel>
                                                Server <span className="text-destructive">*</span>
                                            </FormLabel>
                                            <MultipleSelector
                                                value={currentValue}
                                                onChange={(selectedOptions) => {
                                                    if (selectedOptions.length === 0) {
                                                        field.onChange('');
                                                    } else {
                                                        field.onChange(
                                                            selectedOptions[0]?.value || ''
                                                        );
                                                    }
                                                }}
                                                options={serverOptions}
                                                placeholder="Search server..."
                                                emptyIndicator={
                                                    <p className="text-center text-sm">
                                                        No results found
                                                    </p>
                                                }
                                                className="w-full"
                                                maxSelected={1}
                                                hidePlaceholderWhenSelected
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    );
                                }}
                            />
                        )}

                        {isLoadingClients || !localClients ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="ml-2 text-sm">Loading clients...</span>
                            </div>
                        ) : (
                            <FormField
                                control={form.control}
                                name="clientId"
                                render={({ field }) => {
                                    const currentValue = useMemo(() => {
                                        if (!field.value) return [];
                                        const client = localClients?.find(
                                            (c) => String(c.id) === String(field.value)
                                        );
                                        return client
                                            ? [
                                                  {
                                                      value: String(client.id),
                                                      label: client.name,
                                                  },
                                              ]
                                            : [];
                                    }, [field.value, localClients]);

                                    return (
                                        <FormItem>
                                            <FormLabel>Client (Optional)</FormLabel>
                                            <MultipleSelector
                                                value={currentValue}
                                                onChange={(selectedOptions) => {
                                                    if (selectedOptions.length === 0) {
                                                        field.onChange('');
                                                    } else {
                                                        field.onChange(
                                                            selectedOptions[0]?.value || ''
                                                        );
                                                    }
                                                }}
                                                options={clientOptions}
                                                placeholder="Search client..."
                                                emptyIndicator={
                                                    <p className="text-center text-sm">
                                                        No results found
                                                    </p>
                                                }
                                                className="w-full"
                                                maxSelected={1}
                                                hidePlaceholderWhenSelected
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    );
                                }}
                            />
                        )}

                        <FormField
                            control={form.control}
                            name="clientName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Config name <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="Enter config name"
                                            {...field}
                                            onChange={(e) => {
                                                setClientNameTouched(true);
                                                field.onChange(e);
                                            }}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="protocol"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Protocol <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select protocol" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {Object.entries(protocolsMapping).map(
                                                ([value, label]) => (
                                                    <SelectItem key={value} value={value}>
                                                        {label}
                                                    </SelectItem>
                                                )
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="expiresAt"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <div className="mb-2 flex items-center justify-between">
                                        <FormLabel>
                                            Expiration Date{' '}
                                            <span className="text-destructive">*</span>
                                        </FormLabel>
                                        <div className="flex gap-1">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setQuickDate(1)}
                                                className="h-7 text-xs">
                                                1 month
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setQuickDate(3)}
                                                className="h-7 text-xs">
                                                3 months
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setQuickDate(6)}
                                                className="h-7 text-xs">
                                                6 months
                                            </Button>
                                        </div>
                                    </div>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <FormControl>
                                                <Button
                                                    variant="outline"
                                                    className={cn(
                                                        'w-full pl-3 text-left font-normal',
                                                        !field.value && 'text-muted-foreground'
                                                    )}>
                                                    {field.value ? (
                                                        format(
                                                            new Date(Number(field.value) * 1000),
                                                            'PPP'
                                                        )
                                                    ) : (
                                                        <span>Pick a date</span>
                                                    )}
                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                </Button>
                                            </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={
                                                    field.value
                                                        ? new Date(Number(field.value) * 1000)
                                                        : undefined
                                                }
                                                onSelect={(date) => {
                                                    const unixTimestamp = date
                                                        ? Math.floor(
                                                              date.getTime() / 1000
                                                          ).toString()
                                                        : '';
                                                    field.onChange(unixTimestamp);
                                                }}
                                                disabled={(date) => date < new Date()}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                                disabled={createConfig.isPending}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={createConfig.isPending}>
                                {createConfig.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {createConfig.isPending ? 'Creating...' : 'Create Config'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
