'use client';

import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import MultipleSelector from '@/components/ui/multi-select';
import { Textarea } from '@/components/ui/textarea';
import { sendNotificationSchema, type sendNotificationFormData } from '@/lib/schemas/clients';
import { api } from '@/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function NotificationPage() {
    const isTelegramEnabled = process.env.NEXT_PUBLIC_USES_TELEGRAM_BOT === 'true';

    if (!isTelegramEnabled) {
        return (
            <div className="container mx-auto max-w-4xl py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight">Send Notification</h1>
                    <p className="text-muted-foreground mt-2">
                        Send a message to a client or group of clients via Telegram
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Telegram Bot Not Configured</CardTitle>
                        <CardDescription>
                            This page is only available when Telegram bot integration is enabled
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <p className="text-muted-foreground">
                                To use the notification feature, please ensure that:
                            </p>
                            <ul className="text-muted-foreground list-disc space-y-2 pl-5">
                                <li>
                                    The Telegram bot token is properly configured in your
                                    environment variables
                                </li>
                                <li>
                                    The NEXT_PUBLIC_USES_TELEGRAM_BOT environment variable is set to
                                    "true"
                                </li>
                                <li>Your Telegram bot is properly set up and running</li>
                            </ul>
                            <div className="border-t pt-4">
                                <p className="text-muted-foreground text-sm">
                                    Once configured, you can send notifications directly to clients
                                    through Telegram.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const form = useForm<sendNotificationFormData>({
        resolver: zodResolver(sendNotificationSchema),
        defaultValues: {
            clientId: '',
            message: '',
        },
    });

    const { data: clients, isLoading: isLoadingClients } = api.clients.getClients.useQuery({
        serverId: undefined,
    });

    const [localClients, setLocalClients] = useState<typeof clients>([]);

    useEffect(() => {
        if (clients) {
            setLocalClients(clients);
        }
    }, [clients]);

    const GROUP_OPTIONS = useMemo(
        () => [
            {
                value: 'All Russian',
                label: 'All Russian Clients',
                description: 'Send to all clients with Russian language preference',
            },
            {
                value: 'All English',
                label: 'All English Clients',
                description: 'Send to all clients with English language preference',
            },
        ],
        []
    );

    const clientOptions = useMemo(() => {
        const individualClients =
            localClients?.map((client) => ({
                value: String(client.id),
                label: client.name,
            })) || [];

        return [...GROUP_OPTIONS, ...individualClients];
    }, [localClients, GROUP_OPTIONS]);

    const sendNotification = api.clients.sendNotification.useMutation({
        onSuccess: (data) => {
            toast.success('Notification sent successfully');
            form.reset();
        },
        onError: (error) => {
            toast.error('Error sending notification');
            console.error(error);
        },
    });

    const onSubmit = (data: sendNotificationFormData) => {
        sendNotification.mutate(data);
    };

    const selectedValue = form.watch('clientId');
    const selectedOption = useMemo(() => {
        return clientOptions.find((option) => option.value === selectedValue);
    }, [selectedValue, clientOptions]);

    return (
        <div className="container mx-auto max-w-4xl py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Send Notification</h1>
                <p className="text-muted-foreground mt-2">
                    Send a message to a client or group of clients
                </p>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Notification Details</CardTitle>
                            <CardDescription>
                                Select a recipient and write your message
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {isLoadingClients ? (
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
                                            const option = clientOptions.find(
                                                (opt) => opt.value === field.value
                                            );
                                            return option ? [option] : [];
                                        }, [field.value, clientOptions]);

                                        return (
                                            <FormItem>
                                                <FormLabel>
                                                    Recipient{' '}
                                                    <span className="text-destructive">*</span>
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
                                                    options={clientOptions}
                                                    placeholder="Search client or select group..."
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
                                name="message"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className="flex items-center justify-between">
                                            <FormLabel>
                                                Message <span className="text-destructive">*</span>
                                            </FormLabel>
                                            <span className="text-muted-foreground text-xs">
                                                {field.value?.length || 0}/4096 characters
                                            </span>
                                        </div>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Enter your message..."
                                                rows={5}
                                                className="resize-y"
                                                maxLength={4096}
                                                {...field}
                                            />
                                        </FormControl>
                                        <div className="text-muted-foreground mt-2 text-xs">
                                            HTML formatting is supported
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    <div className="flex items-center justify-between">
                        <div className="text-muted-foreground text-sm">
                            Notification will be delivered via Telegram
                            {selectedValue && selectedOption && (
                                <span className="ml-1 font-medium">
                                    • Selected: {selectedOption.label}
                                </span>
                            )}
                        </div>
                        <Button
                            type="submit"
                            disabled={sendNotification.isPending || !form.formState.isValid}
                            size="lg">
                            {sendNotification.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            {sendNotification.isPending ? 'Sending...' : 'Send Notification'}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}
