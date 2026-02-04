'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { CalendarIcon, Plus, Trash2, Loader2 } from 'lucide-react';
import { addMonths, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { api } from '@/trpc/react';
import { LanguagesMapping, protocolsMapping } from '@/lib/data/mappings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createClientSchema, type createClientFormData } from '@/lib/schemas/clients';
import { useRouter } from 'next/navigation';
import MultipleSelector from '@/components/ui/multi-select';

export default function CreateClientPage() {
    const utils = api.useUtils();
    const router = useRouter();

    const { data: serversData, isLoading: isLoadingServers } = api.servers.getServers.useQuery();

    const serverOptions = useMemo(() => {
        if (!serversData) return [];
        return serversData.map((server) => ({
            value: String(server.id),
            label: server.name,
        }));
    }, [serversData]);

    const [localServers, setLocalServers] = useState<typeof serversData>([]);

    useEffect(() => {
        if (serversData) {
            setLocalServers(serversData);
        }
    }, [serversData]);

    const form = useForm<createClientFormData & { clientServerId?: string }>({
        resolver: zodResolver(createClientSchema),
        defaultValues: {
            name: '',
            language: '',
            telegramId: '',
            clientServerId: '',
            configs: [
                {
                    serverId: 'none',
                    clientName: '',
                    expiresAt: '',
                    protocol: undefined,
                },
            ],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'configs',
    });

    const watchClientServerId = form.watch('clientServerId');
    const watchClientName = form.watch('name');
    const watchConfigs = form.watch('configs');

    useEffect(() => {
        if (watchClientServerId) {
            fields.forEach((_, index) => {
                const currentServerId = form.getValues(`configs.${index}.serverId`);
                if (!currentServerId) {
                    form.setValue(`configs.${index}.serverId`, watchClientServerId, {
                        shouldValidate: true,
                    });
                }
            });
        }
    }, [watchClientServerId, fields, form]);

    const createClientWithConfigs = api.clients.createClient.useMutation({
        onSuccess: () => {
            toast.success('Client and configs created successfully');
            form.reset();
            utils.clients.getClientsWithConfigs.invalidate();
            router.push('/');
        },
        onError: (error) => {
            toast.error('Error creating client');
            console.error(error);
        },
    });

    const onSubmit = (data: createClientFormData & { clientServerId?: string }) => {
        const configsWithClientNames = data.configs.map((config) => ({
            ...config,
            serverId: config.serverId || data.clientServerId || '',
            clientName:
                data.name && config.clientName
                    ? `${data.name}-${config.clientName}`
                    : config.clientName,
        }));

        createClientWithConfigs.mutate({
            name: data.name,
            telegramId: data.telegramId || undefined,
            language: data.language,
            configs: configsWithClientNames,
        });
    };

    const addConfig = () => {
        const newConfig = {
            serverId: '',
            clientName: '',
            expiresAt: '',
            protocol: 'AMNEZIAWG' as const,
        };

        append(newConfig);
    };

    const setQuickDate = (monthsToAdd: number, index: number) => {
        const now = new Date();
        const newDate = addMonths(now, monthsToAdd);
        const unixTimestamp = Math.floor(newDate.getTime() / 1000).toString();
        form.setValue(`configs.${index}.expiresAt`, unixTimestamp, {
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true,
        });
    };

    const handleConfigServerChange = (index: number, serverId: string) => {
        form.setValue(`configs.${index}.serverId`, serverId, {
            shouldValidate: true,
        });
    };

    const clearConfigServer = (index: number) => {
        form.setValue(`configs.${index}.serverId`, '', {
            shouldValidate: true,
        });
    };

    return (
        <div className="container mx-auto max-w-4xl py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Create New Client</h1>
                <p className="text-muted-foreground mt-2">
                    Add a new client and their VPN configurations
                </p>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Client Information</CardTitle>
                            <CardDescription>
                                Enter the basic information for the client
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            Client Name <span className="text-destructive">*</span>
                                        </FormLabel>
                                        <FormControl>
                                            <Input placeholder="Enter client name" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {isLoadingServers || !localServers ? (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span className="ml-2 text-sm">Loading servers...</span>
                                </div>
                            ) : (
                                <FormField
                                    control={form.control}
                                    name="clientServerId"
                                    render={({ field }) => {
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
                                                <FormLabel>Default Server</FormLabel>
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

                            <FormField
                                control={form.control}
                                name="language"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            Language <span className="text-destructive">*</span>
                                        </FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select language" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {Object.entries(LanguagesMapping).map(
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
                                name="telegramId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Telegram Chat ID (Optional)</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="123456789"
                                                {...field}
                                                value={field.value || ''}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>VPN Configurations</CardTitle>
                                    <CardDescription>
                                        Add one or more VPN configurations for this client
                                    </CardDescription>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={addConfig}
                                    className="cursor-pointer">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add Config
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {fields.length === 0 ? (
                                <div className="rounded-lg border-2 border-dashed py-8 text-center">
                                    <p className="text-muted-foreground">
                                        No configurations added yet
                                    </p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={addConfig}
                                        className="mt-4">
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add First Config
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {fields.map((field, index) => {
                                        const configServerId = watchConfigs[index]?.serverId;
                                        const configClientName =
                                            watchConfigs[index]?.clientName || '';
                                        const fullClientName =
                                            watchClientName && configClientName
                                                ? `${watchClientName}-${configClientName}`
                                                : configClientName || '[waiting for input]';

                                        const clientServer = serversData?.find(
                                            (server) => String(server.id) === watchClientServerId
                                        );

                                        const selectedServer = serversData?.find(
                                            (server) => String(server.id) === configServerId
                                        );

                                        return (
                                            <div
                                                key={field.id}
                                                className="space-y-4 rounded-lg border p-4">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="font-semibold">
                                                        Config #{index + 1}
                                                    </h3>
                                                    {fields.length > 1 && (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => remove(index)}
                                                            className="text-destructive h-8 w-8 p-0">
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>

                                                <div className="bg-muted/50 rounded-md p-3">
                                                    <div className="mb-2 flex items-center justify-between">
                                                        <div className="text-sm font-medium">
                                                            Server Configuration:
                                                        </div>
                                                        {configServerId &&
                                                            configServerId !==
                                                                watchClientServerId && (
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() =>
                                                                        clearConfigServer(index)
                                                                    }
                                                                    className="h-7 text-xs">
                                                                    Reset to client server
                                                                </Button>
                                                            )}
                                                    </div>

                                                    {configServerId === watchClientServerId ||
                                                    !configServerId ? (
                                                        <div className="text-sm">
                                                            <span className="text-muted-foreground">
                                                                Using client server:{' '}
                                                            </span>
                                                            <span className="font-medium">
                                                                {clientServer?.name ||
                                                                    'Not selected'}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm">
                                                            <span className="text-muted-foreground">
                                                                Custom server:{' '}
                                                            </span>
                                                            <span className="font-medium">
                                                                {selectedServer?.name}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-2">
                                                    <FormLabel>Server (Optional)</FormLabel>

                                                    {isLoadingServers || !localServers ? (
                                                        <div className="flex items-center justify-center py-4">
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                            <span className="ml-2 text-sm">
                                                                Loading servers...
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            <MultipleSelector
                                                                value={(() => {
                                                                    if (
                                                                        !configServerId ||
                                                                        configServerId ===
                                                                            watchClientServerId
                                                                    ) {
                                                                        return [
                                                                            {
                                                                                value: 'client-server',
                                                                                label: `Use client server: ${clientServer?.name || 'Not selected'}`,
                                                                            },
                                                                        ];
                                                                    }

                                                                    const server =
                                                                        serversData?.find(
                                                                            (s) =>
                                                                                String(s.id) ===
                                                                                configServerId
                                                                        );
                                                                    return server
                                                                        ? [
                                                                              {
                                                                                  value: String(
                                                                                      server.id
                                                                                  ),
                                                                                  label: server.name,
                                                                              },
                                                                          ]
                                                                        : [];
                                                                })()}
                                                                onChange={(selectedOptions) => {
                                                                    if (
                                                                        selectedOptions.length === 0
                                                                    ) {
                                                                        handleConfigServerChange(
                                                                            index,
                                                                            ''
                                                                        );
                                                                    } else {
                                                                        const selectedValue =
                                                                            selectedOptions[0]
                                                                                ?.value;
                                                                        if (
                                                                            selectedValue ===
                                                                            'client-server'
                                                                        ) {
                                                                            handleConfigServerChange(
                                                                                index,
                                                                                ''
                                                                            );
                                                                        } else {
                                                                            if (selectedValue)
                                                                                handleConfigServerChange(
                                                                                    index,
                                                                                    selectedValue
                                                                                );
                                                                        }
                                                                    }
                                                                }}
                                                                options={(() => {
                                                                    const baseOptions =
                                                                        serverOptions;
                                                                    const clientServerOption = {
                                                                        value: 'client-server',
                                                                        label: `Use client server: ${clientServer?.name || 'Not selected'}`,
                                                                    };
                                                                    return [
                                                                        clientServerOption,
                                                                        ...baseOptions,
                                                                    ];
                                                                })()}
                                                                placeholder="Select server..."
                                                                emptyIndicator={
                                                                    <p className="text-center text-sm">
                                                                        No servers available
                                                                    </p>
                                                                }
                                                                className="w-full"
                                                                maxSelected={1}
                                                                hidePlaceholderWhenSelected
                                                            />

                                                            <div className="text-muted-foreground text-xs">
                                                                Select "Use client server" to
                                                                inherit from client's default server
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <FormField
                                                    control={form.control}
                                                    name={`configs.${index}.clientName`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>
                                                                ClientName Suffix{' '}
                                                                <span className="text-destructive">
                                                                    *
                                                                </span>
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    placeholder="Enter clientName suffix"
                                                                    {...field}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                    <FormField
                                                        control={form.control}
                                                        name={`configs.${index}.protocol`}
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    Protocol{' '}
                                                                    <span className="text-destructive">
                                                                        *
                                                                    </span>
                                                                </FormLabel>
                                                                <Select
                                                                    onValueChange={field.onChange}
                                                                    value={field.value}>
                                                                    <FormControl>
                                                                        <SelectTrigger>
                                                                            <SelectValue placeholder="Select protocol" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        {Object.entries(
                                                                            protocolsMapping
                                                                        ).map(([value, label]) => (
                                                                            <SelectItem
                                                                                key={value}
                                                                                value={value}>
                                                                                {label}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>

                                                <div className="bg-muted rounded-md p-3">
                                                    <div className="mb-1 text-sm font-medium">
                                                        Generated ClientName:
                                                    </div>
                                                    <div className="font-mono text-sm">
                                                        {watchClientName ? (
                                                            <>
                                                                <span className="text-blue-600">
                                                                    {watchClientName}
                                                                </span>
                                                                <span className="text-muted-foreground">
                                                                    -
                                                                </span>
                                                                <span className="text-green-600">
                                                                    {configClientName ||
                                                                        '[clientName]'}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <span className="text-muted-foreground">
                                                                Enter client name to see full
                                                                clientName
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-muted-foreground mt-1 text-xs">
                                                        Final clientName:{' '}
                                                        <Badge variant="secondary">
                                                            {fullClientName}
                                                        </Badge>
                                                    </div>
                                                </div>

                                                <FormField
                                                    control={form.control}
                                                    name={`configs.${index}.expiresAt`}
                                                    render={({ field }) => (
                                                        <FormItem className="flex flex-col">
                                                            <div className="mb-2 flex items-center justify-between">
                                                                <FormLabel>
                                                                    Expiration Date{' '}
                                                                    <span className="text-destructive">
                                                                        *
                                                                    </span>
                                                                </FormLabel>
                                                                <div className="flex gap-1">
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() =>
                                                                            setQuickDate(1, index)
                                                                        }
                                                                        className="h-7 text-xs">
                                                                        1 month
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() =>
                                                                            setQuickDate(3, index)
                                                                        }
                                                                        className="h-7 text-xs">
                                                                        3 months
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() =>
                                                                            setQuickDate(6, index)
                                                                        }
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
                                                                                !field.value &&
                                                                                    'text-muted-foreground'
                                                                            )}>
                                                                            {field.value ? (
                                                                                format(
                                                                                    new Date(
                                                                                        Number(
                                                                                            field.value
                                                                                        ) * 1000
                                                                                    ),
                                                                                    'PPP'
                                                                                )
                                                                            ) : (
                                                                                <span>
                                                                                    Pick a date
                                                                                </span>
                                                                            )}
                                                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                                        </Button>
                                                                    </FormControl>
                                                                </PopoverTrigger>
                                                                <PopoverContent
                                                                    className="w-auto p-0"
                                                                    align="start">
                                                                    <Calendar
                                                                        mode="single"
                                                                        selected={
                                                                            field.value
                                                                                ? new Date(
                                                                                      Number(
                                                                                          field.value
                                                                                      ) * 1000
                                                                                  )
                                                                                : undefined
                                                                        }
                                                                        onSelect={(date) => {
                                                                            const unixTimestamp =
                                                                                date
                                                                                    ? Math.floor(
                                                                                          date.getTime() /
                                                                                              1000
                                                                                      ).toString()
                                                                                    : '';
                                                                            field.onChange(
                                                                                unixTimestamp
                                                                            );
                                                                        }}
                                                                        disabled={(date) =>
                                                                            date < new Date()
                                                                        }
                                                                    />
                                                                </PopoverContent>
                                                            </Popover>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="flex items-center justify-between">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                form.reset();
                                remove();
                                append({
                                    serverId: '',
                                    clientName: '',
                                    expiresAt: '',
                                    protocol: 'AMNEZIAWG',
                                });
                            }}
                            disabled={createClientWithConfigs.isPending}>
                            Reset Form
                        </Button>

                        <div className="flex items-center gap-4">
                            <div className="text-muted-foreground text-sm">
                                {fields.length} configuration{fields.length !== 1 ? 's' : ''} added
                            </div>
                            <Button
                                type="submit"
                                disabled={createClientWithConfigs.isPending}
                                size="lg">
                                {createClientWithConfigs.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {createClientWithConfigs.isPending
                                    ? 'Creating...'
                                    : 'Create Client & Configs'}
                            </Button>
                        </div>
                    </div>
                </form>
            </Form>
        </div>
    );
}
