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
import { InputPassword } from '@/components/input-password';
import { upsertAdminSchema, type upsertAdminFormData } from '@/lib/schemas/admins';

interface Props {
    admin?: {
        id: string;
        login: string;
    };
    trigger?: React.ReactNode;
}

export function UpsertAdminDialog({ admin, trigger }: Props) {
    const [open, setOpen] = useState(false);
    const utils = api.useUtils();

    const form = useForm<upsertAdminFormData>({
        resolver: zodResolver(upsertAdminSchema),
        defaultValues: {
            id: undefined,
            login: admin?.login || '',
            password: '',
        },
    });

    const upsertAdmin = api.admins.upsertAdmin.useMutation({
        onSuccess: () => {
            toast.success('Admin was saved successfully');
            utils.admins.getAdmins.invalidate();
            setOpen(false);
            form.reset();
        },
        onError: (error) => {
            if (error.message === 'You cant update yourself') {
                toast.error('You cant update yourself');
            } else {
                toast.error('Error saving admin');
                console.error(error);
            }
        },
    });

    const onSubmit = (data: upsertAdminFormData) => {
        upsertAdmin.mutate(data);
    };

    useEffect(() => {
        if (admin) {
            form.reset({
                id: admin.id,
                login: admin.login,
            });
        }
    }, [admin]);

    const defaultTrigger = admin ? (
        <Button variant="ghost" size="sm" className="cursor-pointer">
            <Edit className="h-4 w-4" />
        </Button>
    ) : (
        <Button className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Add admin
        </Button>
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
            <DialogContent className="sm:max-w-131.25">
                <DialogHeader>
                    <DialogTitle>{admin ? 'Edit' : 'Add new'} admin</DialogTitle>
                    <DialogDescription>Fill in the information for the admin</DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="login"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Login{' '}
                                        {admin?.id ? null : (
                                            <span className="text-destructive">*</span>
                                        )}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="Enter login"
                                            {...field}
                                            disabled={Boolean(admin?.id)}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>
                                        Password <span className="text-destructive">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <InputPassword placeholder="Enter password" {...field} />
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
                                disabled={upsertAdmin.isPending}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={upsertAdmin.isPending}>
                                {upsertAdmin.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {upsertAdmin.isPending ? 'Saving...' : 'Save Admin'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
