'use client';

import { useEffect, useState } from 'react';
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
import { Loader2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/trpc/react';
import { updateClientSchema, type updateClientFormData } from '@/lib/schemas/clients';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Languages } from 'prisma/generated/enums';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { LanguagesMapping } from '@/lib/data/mappings';

interface Props {
    id?: number;
    name?: string;
    language?: Languages;
    telegramId?: string | null;
}

export function UpdateClientDialog({ id, name, language, telegramId }: Props) {
    const [open, setOpen] = useState(false);
    const utils = api.useUtils();

    const form = useForm<updateClientFormData>({
        resolver: zodResolver(updateClientSchema),
        defaultValues: {
            id,
            name,
            language,
            telegramId: telegramId || undefined,
        },
    });

    const updateClient = api.clients.updateClient.useMutation({
        onSuccess: () => {
            toast.success('Client was successfully updated');
            utils.clients.getClientsWithConfigs.invalidate();
            setOpen(false);
            form.reset();
        },
        onError: (error) => {
            // The server explains what is wrong — which client already holds this chat
            // id, for instance — and that is the only thing that makes the error fixable.
            toast.error(error.message || 'Error updating client');

            console.error(error);
        },
    });

    const onSubmit = (data: updateClientFormData) => {
        updateClient.mutate(data);
    };

    useEffect(() => {
        if (!id || !name) return;

        form.reset({
            id,
            name,
            language,
            telegramId: telegramId || undefined,
        });
    }, [id, name, telegramId]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Tooltip>
                <DialogTrigger asChild>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="cursor-pointer">
                            <Edit className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                </DialogTrigger>
                <TooltipContent>
                    <p>Edit client</p>
                </TooltipContent>
            </Tooltip>
            <DialogContent className="sm:max-w-131.25">
                <DialogHeader>
                    <DialogTitle>Update client</DialogTitle>
                    <DialogDescription>Change client info</DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Name <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter a name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

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
                                    <FormLabel>Telegram Chat ID (optional)</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter a Telegram Chat ID" {...field} />
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
                                disabled={updateClient.isPending}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={updateClient.isPending}>
                                {updateClient.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {updateClient.isPending ? 'Updating...' : 'Update'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
