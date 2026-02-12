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

export default function CreateClientPage() {
    const utils = api.useUtils();
    const router = useRouter();

    const { data: serversData, isLoading: isLoadingServers } = api.servers.getServers.useQuery();

    const [clientServerId, setClientServerId] = useState<string>('none');

    const serverOptions = useMemo(() => {
        if (!serversData) return [];
        return serversData.map((server) => ({
            value: String(server.id),
            label: server.name,
        }));
    }, [serversData]);

    const form = useForm<createClientFormData>({
        resolver: zodResolver(createClientSchema),
        defaultValues: {
            name: '',
            language: '',
            telegramId: '',
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

    const watchClientName = form.watch('name');
    const watchConfigs = form.watch('configs');

    useEffect(() => {
        if (clientServerId && clientServerId !== 'none') {
            fields.forEach((_, index) => {
                const currentServerId = form.getValues(`configs.${index}.serverId`);
                if (!currentServerId || currentServerId === 'none') {
                    form.setValue(`configs.${index}.serverId`, clientServerId, {
                        shouldValidate: false,
                        shouldDirty: false,
                        shouldTouch: false,
                    });
                }
            });
        }
    }, [clientServerId, fields, form]);

    const createClientWithConfigs = api.clients.createClient.useMutation({
        onSuccess: () => {
            toast.success('Client and configs created successfully');
            form.reset();
            setClientServerId('none');
            utils.clients.getClientsWithConfigs.invalidate();
            router.push('/');
        },
        onError: (error) => {
            toast.error('Error creating client');
            console.error(error);
        },
    });

    const onSubmit = (data: createClientFormData) => {
        // Преобразуем 'none' в пустую строку для serverId
        const configsWithDefaultServer = data.configs.map((config) => ({
            ...config,
            serverId: config.serverId === 'none' ? '' : config.serverId,
            clientName:
                data.name && config.clientName
                    ? `${data.name}-${config.clientName}`
                    : config.clientName,
        }));

        // Подставляем clientServerId, если в конфиге serverId пустой
        const finalConfigs = configsWithDefaultServer.map((config) => ({
            ...config,
            serverId: config.serverId || (clientServerId !== 'none' ? clientServerId : ''),
        }));

        createClientWithConfigs.mutate({
            name: data.name,
            telegramId: data.telegramId || undefined,
            language: data.language,
            configs: finalConfigs,
        });
    };

    const addConfig = () => {
        const newConfig = {
            serverId: clientServerId !== 'none' ? clientServerId : 'none',
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

                            {isLoadingServers ? (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span className="ml-2 text-sm">Loading servers...</span>
                                </div>
                            ) : (
                                <FormItem>
                                    <FormLabel>Default Server</FormLabel>
                                    <Select
                                        value={clientServerId}
                                        onValueChange={(value) => {
                                            setClientServerId(value);
                                        }}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select default server" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            {serverOptions.map((server) => (
                                                <SelectItem key={server.value} value={server.value}>
                                                    {server.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
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
                        <CardContent className="flex flex-col gap-5">
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

                                        const selectedServer = serversData?.find(
                                            (server) => String(server.id) === configServerId
                                        );

                                        const clientServer = serversData?.find(
                                            (server) => String(server.id) === clientServerId
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
                                                    <div className="mb-2 text-sm font-medium">
                                                        Server Configuration:
                                                    </div>
                                                    <div className="text-sm">
                                                        {configServerId &&
                                                        configServerId !== 'none' ? (
                                                            <>
                                                                <span className="text-muted-foreground">
                                                                    Selected server:{' '}
                                                                </span>
                                                                <span className="font-medium">
                                                                    {selectedServer?.name ||
                                                                        (configServerId ===
                                                                        clientServerId
                                                                            ? `${clientServer?.name} (client default)`
                                                                            : 'Unknown server')}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="text-muted-foreground">
                                                                    Using client default:{' '}
                                                                </span>
                                                                <span className="font-medium">
                                                                    {clientServer?.name ||
                                                                        'Not selected'}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                <FormField
                                                    control={form.control}
                                                    name={`configs.${index}.serverId`}
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>
                                                                Server{' '}
                                                                <span className="text-destructive">
                                                                    *
                                                                </span>
                                                            </FormLabel>
                                                            {isLoadingServers ? (
                                                                <div className="flex items-center justify-center py-4">
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                    <span className="ml-2 text-sm">
                                                                        Loading servers...
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <Select
                                                                    value={field.value}
                                                                    onValueChange={(value) => {
                                                                        field.onChange(value);
                                                                    }}>
                                                                    <FormControl>
                                                                        <SelectTrigger>
                                                                            <SelectValue placeholder="Select server" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        <SelectItem value="none">
                                                                            Use client default
                                                                            server
                                                                        </SelectItem>
                                                                        {serverOptions.map(
                                                                            (server) => (
                                                                                <SelectItem
                                                                                    key={
                                                                                        server.value
                                                                                    }
                                                                                    value={
                                                                                        server.value
                                                                                    }>
                                                                                    {server.label}
                                                                                </SelectItem>
                                                                            )
                                                                        )}
                                                                    </SelectContent>
                                                                </Select>
                                                            )}
                                                            <div className="text-muted-foreground text-xs">
                                                                Select "Use client default server"
                                                                to inherit from client's default
                                                                server
                                                            </div>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

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
                            <Button
                                type="button"
                                variant="outline"
                                onClick={addConfig}
                                className="flex cursor-pointer self-end">
                                <Plus className="mr-2 h-4 w-4" />
                                Add Config
                            </Button>
                        </CardContent>
                    </Card>

                    <div className="flex items-center justify-between">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                form.reset();
                                setClientServerId('none');
                                remove();
                                append({
                                    serverId: 'none',
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
