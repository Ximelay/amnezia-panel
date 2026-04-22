'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { api } from '@/trpc/react';
import {
    upsertPaymentSettingsSchema,
    type upsertPaymentSettingsFormData,
} from '@/lib/schemas/payment-settings';
import { getNormalDate } from '@/lib/utils';

export default function PaymentSettingsPage() {
    const isTelegramEnabled = process.env.NEXT_PUBLIC_USES_TELEGRAM_BOT === 'true';

    if (!isTelegramEnabled) {
        return (
            <div className="container mx-auto max-w-4xl py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight">Payment Settings</h1>
                    <p className="text-muted-foreground mt-2">
                        Configure pricing and payment link for your service
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Payment Integration Not Configured</CardTitle>
                        <CardDescription>
                            This page is only available when payment integration is enabled
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <p className="text-muted-foreground">
                                To use the payment settings feature, please ensure that:
                            </p>
                            <ul className="text-muted-foreground list-disc space-y-2 pl-5">
                                <li>
                                    The payment gateway credentials are properly configured in your
                                    environment variables
                                </li>
                                <li>
                                    The NEXT_PUBLIC_USES_TELEGRAM_BOT environment variable is set to
                                    "true"
                                </li>
                                <li>Your payment provider integration is properly set up</li>
                            </ul>
                            <div className="border-t pt-4">
                                <p className="text-muted-foreground text-sm">
                                    Once configured, you can manage payment settings from this page.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const { data: settings, isLoading: isLoadingSettings } =
        api.paymentSettings.getPaymentSettings.useQuery();

    const upsertSettings = api.paymentSettings.upsertPaymentSettings.useMutation({
        onSuccess: () => {
            toast.success('Payment settings saved successfully');
        },
        onError: (error) => {
            toast.error('Failed to save payment settings');
            console.error(error);
        },
    });

    const form = useForm<upsertPaymentSettingsFormData>({
        resolver: zodResolver(upsertPaymentSettingsSchema),
        defaultValues: {
            defaultPrice: '100',
            additionalPrice: '0',
            defaultConfigsCount: '3',
            paymentLink: '',
            adminTelegramIds: '',
        },
    });

    useEffect(() => {
        if (settings) {
            let adminIdsString = '';
            if (settings.adminTelegramIds && Array.isArray(settings.adminTelegramIds)) {
                adminIdsString = settings.adminTelegramIds.join(', ');
            }

            form.reset({
                defaultPrice: String(settings.defaultPrice),
                additionalPrice: String(settings.additionalPrice),
                defaultConfigsCount: String(settings.defaultConfigsCount),
                paymentLink: settings.paymentLink,
                adminTelegramIds: adminIdsString,
            });
        }
    }, [settings, form]);

    const onSubmit = (data: upsertPaymentSettingsFormData) => {
        upsertSettings.mutate(data);
    };

    if (isLoadingSettings) {
        return (
            <div className="container mx-auto max-w-4xl py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight">Payment Settings</h1>
                    <p className="text-muted-foreground mt-2">
                        Configure pricing and payment link for your service
                    </p>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Loading settings...</CardTitle>
                    </CardHeader>
                    <CardContent className="flex justify-center py-8">
                        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    const lastUpdateDate = settings?.updatedAt
        ? getNormalDate(settings.updatedAt)
        : settings?.createdAt
          ? getNormalDate(settings.createdAt)
          : 'Never';

    return (
        <div className="container mx-auto max-w-6xl py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Payment Settings</h1>
                <p className="text-muted-foreground mt-2">
                    Configure default pricing, additional price per configuration, payment link, and
                    admin Telegram IDs
                </p>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Payment Configuration</CardTitle>
                            <CardAction>Last update: {lastUpdateDate}</CardAction>
                            <CardDescription>
                                These settings affect all payment calculations and links
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <FormField
                                control={form.control}
                                name="defaultPrice"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            Default Price (RUB){' '}
                                            <span className="text-destructive">*</span>
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                step="0.1"
                                                placeholder="Enter default price"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="additionalPrice"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            Additional Price per Extra Config (RUB)
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                step="0.1"
                                                placeholder="Enter additional price"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="defaultConfigsCount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            Default Configs Included{' '}
                                            <span className="text-destructive">*</span>
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                step="1"
                                                placeholder="Number of configs included by default"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="paymentLink"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            Payment Link (URL){' '}
                                            <span className="text-destructive">*</span>
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="url"
                                                placeholder="https://example.com/pay"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="adminTelegramIds"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Admin Telegram IDs</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Enter admin Telegram IDs separated by commas, e.g. 123456789, 987654321"
                                                rows={3}
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                        <div className="text-muted-foreground text-sm">
                                            These users will receive notifications or have special
                                            access.
                                        </div>
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                        <CardContent className="border-t pt-6">
                            <div className="flex justify-end">
                                <Button type="submit" disabled={upsertSettings.isPending} size="lg">
                                    {upsertSettings.isPending && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    {upsertSettings.isPending ? 'Saving...' : 'Save Settings'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </form>
            </Form>
        </div>
    );
}
