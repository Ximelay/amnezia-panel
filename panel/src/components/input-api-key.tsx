'use client';

import { forwardRef, useState } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface InputApiKeyProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const InputApiKey = forwardRef<HTMLInputElement, InputApiKeyProps>(
    ({ className, ...props }, ref) => {
        const [isVisible, setIsVisible] = useState(false);

        const toggleVisibility = () => setIsVisible((prevState) => !prevState);

        return (
            <div className="relative">
                <Input
                    {...props}
                    ref={ref}
                    type={isVisible ? 'text' : 'password'}
                    className={cn('pr-9', className)}
                />
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={toggleVisibility}
                    className="absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent">
                    {isVisible ? (
                        <EyeOffIcon className="h-4 w-4" />
                    ) : (
                        <EyeIcon className="h-4 w-4" />
                    )}
                    <span className="sr-only">
                        {isVisible ? 'Скрыть пароль' : 'Показать пароль'}
                    </span>
                </Button>
            </div>
        );
    }
);

InputApiKey.displayName = 'InputApiKey';
