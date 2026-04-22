'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signOut, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/trpc/react';
import { toast } from 'sonner';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import { useUserData } from '@/hooks/user/use-user-data';
import { InputPassword } from '@/components/input-password';
import { useRouter } from 'next/navigation';

const changePasswordSchema = z
    .object({
        login: z.string().optional(),
        currentPassword: z.string().min(1, 'Enter current password'),
        newPassword: z
            .string()
            .min(8, 'The password must contain at least 8 characters')
            .max(40, 'The password must contain a maximum of 40 characters'),

        confirmPassword: z.string().min(1, 'Confirm your password'),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: 'Passwords didnt match',
        path: ['confirmPassword'],
    });

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export default function ChangePasswordPage() {
    const { data: session } = useSession();
    const { clearUserCache } = useUserData();
    const router = useRouter();

    const changePasswordMutation = api.admins.changePassword.useMutation({
        onSuccess: async () => {
            toast.success('Password was changed successfully');
            clearUserCache();
            await signOut({ redirect: false });
            router.push('/auth/login');
        },
        onError: (error) => {
            if (error.message === 'Password invalid') {
                toast.error('Current password is invalid');
            } else if (error.message === 'User is existing') {
                toast.error('Admin with this username exists');
            } else if (error.message === 'Current and new passwords match') {
                toast.error('The current password matches the current one');
            } else {
                toast.error('Unknown error');
                console.error(error);
            }
        },
    });

    const form = useForm<ChangePasswordForm>({
        resolver: zodResolver(changePasswordSchema),
        defaultValues: {
            login: '',
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
        },
    });

    const onSubmit = ({ login, currentPassword, newPassword }: ChangePasswordForm) => {
        changePasswordMutation.mutate({
            login,
            currentPassword,
            newPassword,
        });
    };

    return (
        <div className="bg-background flex min-h-screen items-center justify-center">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-center text-2xl">Change Password</CardTitle>
                    {session?.user.isFirstLogin && (
                        <CardDescription className="text-center">
                            {session.user.role === 'ROOT'
                                ? 'This is your first login. Please change your password and login optionally.'
                                : 'This is your first login. Please change your password.'}
                        </CardDescription>
                    )}
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            {session?.user.role === 'ROOT' && (
                                <FormField
                                    control={form.control}
                                    name="login"
                                    render={({ field }) => (
                                        <FormItem className="space-y-2">
                                            <FormLabel>Login (optional field)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Enter login" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            <FormField
                                control={form.control}
                                name="currentPassword"
                                render={({ field }) => (
                                    <FormItem className="space-y-2">
                                        <FormLabel>Current Password</FormLabel>
                                        <FormControl>
                                            <InputPassword
                                                placeholder="Enter current password"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="newPassword"
                                render={({ field }) => (
                                    <FormItem className="space-y-2">
                                        <FormLabel>New Password</FormLabel>
                                        <FormControl>
                                            <InputPassword
                                                placeholder="Enter new password"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="confirmPassword"
                                render={({ field }) => (
                                    <FormItem className="space-y-2">
                                        <FormLabel>Confirm New Password</FormLabel>
                                        <FormControl>
                                            <InputPassword
                                                placeholder="Confirm new password"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={changePasswordMutation.isPending}>
                                {changePasswordMutation.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {changePasswordMutation.isPending ? 'Saving...' : 'Save'}
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
