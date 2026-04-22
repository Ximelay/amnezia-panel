'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

const loginSchema = z.object({
    login: z.string().min(1, 'Enter the login'),
    password: z.string().min(1, 'Enter the password'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const { clearUserCache } = useUserData();

    const form = useForm<LoginForm>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            login: '',
            password: '',
        },
    });

    const onSubmit = async (data: LoginForm) => {
        setIsLoading(true);
        clearUserCache();
        try {
            const result = await signIn('credentials', {
                login: data.login,
                password: data.password,
                redirect: false,
            });

            if (result?.error) {
                toast.error('Invalid login or password');
                return;
            }

            router.push('/clients');
        } catch (error) {
            toast.error('Invalid login or password');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-background flex min-h-screen items-center justify-center">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-center text-2xl font-bold">
                        {process.env.NEXT_PUBLIC_VPN_NAME} Panel
                    </CardTitle>
                    <CardDescription className="text-center">
                        Enter your login and password to sign in
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="login"
                                render={({ field }) => (
                                    <FormItem className="space-y-2">
                                        <FormLabel>Login</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Enter your login" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem className="space-y-2">
                                        <FormLabel>Password</FormLabel>
                                        <FormControl>
                                            <InputPassword
                                                placeholder="Enter your password"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isLoading ? 'Logging in...' : 'Sign in'}
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
