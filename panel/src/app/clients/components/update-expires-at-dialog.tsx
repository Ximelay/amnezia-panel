'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    Dialog,
    DialogContent,
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
import { Button } from '@/components/ui/button';
import { Loader2, Edit, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/trpc/react';
import { updateExpiresAtSchema, type updateExpiresAtFormData } from '@/lib/schemas/configs';
import { addMonths, format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DialogDescription } from '@radix-ui/react-dialog';

interface Props {
    id: string;
    isClient: boolean;
    expiresAt?: string | null;
    trigger?: React.ReactNode;
}

export function UpdateExpiresAtDialog({ id, expiresAt, isClient, trigger }: Props) {
    const [open, setOpen] = useState(false);
    const utils = api.useUtils();

    const form = useForm<updateExpiresAtFormData>({
        resolver: zodResolver(updateExpiresAtSchema),
        defaultValues: {
            id,
            expiresAt: expiresAt ? expiresAt : '',
        },
    });

    const updateExpiresAtClient = api.clients.updateExpiresAt.useMutation({
        onSuccess: () => {
            toast.success('Configs were saved successfully');
            utils.clients.getClientsWithConfigs.invalidate();
            setOpen(false);
            form.reset();
        },
        onError: (error) => {
            toast.error('Error saving configs');
            console.error(error);
        },
    });

    const updateExpiresAtConfig = api.configs.updateExpiresAt.useMutation({
        onSuccess: () => {
            toast.success('Config was saved successfully');
            utils.clients.getClientsWithConfigs.invalidate();
            setOpen(false);
            form.reset();
        },
        onError: (error) => {
            toast.error('Error saving config');
            console.error(error);
        },
    });

    const onSubmit = (data: updateExpiresAtFormData) => {
        if (isClient) {
            updateExpiresAtClient.mutate(data);
        } else {
            updateExpiresAtConfig.mutate(data);
        }
    };

    useEffect(() => {
        if (id) {
            form.reset({
                id,
                expiresAt: expiresAt ? expiresAt : '',
            });
        }
    }, [id, expiresAt]);

    const defaultTrigger = isClient ? (
        <Tooltip>
            <DialogTrigger asChild>
                <TooltipTrigger asChild>
                    <Button className="cursor-pointer">Change date</Button>
                </TooltipTrigger>
            </DialogTrigger>
            <TooltipContent>
                <p>Update date for client configs</p>
            </TooltipContent>
        </Tooltip>
    ) : (
        <Tooltip>
            <DialogTrigger asChild>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="cursor-pointer">
                        <Edit className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
            </DialogTrigger>
            <TooltipContent>
                <p>Update date for config</p>
            </TooltipContent>
        </Tooltip>
    );

    const setQuickDate = (monthsToAdd: number) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const numberExpiresAt = Number(expiresAt);

        const newDate = addMonths(
            new Date(expiresAt ? numberExpiresAt * 1000 : today),
            monthsToAdd
        );
        const unixTimestamp = Math.floor(newDate.getTime() / 1000).toString();
        
        form.setValue('expiresAt', unixTimestamp, {
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true,
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
            <DialogContent className="sm:max-w-131.25">
                <DialogHeader>
                    <DialogTitle>
                        Change date for {isClient ? 'client configs' : 'config'}
                    </DialogTitle>
                    <DialogDescription />
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="mt-10 space-y-10">
                        <FormField
                            control={form.control}
                            name="expiresAt"
                            render={({ field }) => (
                                <FormItem className="flex flex-col gap-2">
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
                                disabled={
                                    updateExpiresAtClient.isPending ||
                                    updateExpiresAtConfig.isPending
                                }>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={
                                    updateExpiresAtClient.isPending ||
                                    updateExpiresAtConfig.isPending
                                }>
                                {updateExpiresAtClient.isPending ||
                                    (updateExpiresAtConfig.isPending && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ))}
                                {updateExpiresAtClient.isPending || updateExpiresAtConfig.isPending
                                    ? 'Saving...'
                                    : `Save config${isClient ? 's' : ''}`}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
