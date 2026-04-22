'use client';

import { forwardRef, useMemo, useState } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface InputPasswordStrengthProps extends React.InputHTMLAttributes<HTMLInputElement> {
    showRequirements?: boolean;
}

export const InputPassword = forwardRef<HTMLInputElement, InputPasswordStrengthProps>(
    ({ className, value, onChange, showRequirements = false, ...props }, ref) => {
        const [isVisible, setIsVisible] = useState(false);

        const toggleVisibility = () => setIsVisible((prevState) => !prevState);

        const password = typeof value === 'string' ? value : '';

        return (
            <div className="relative w-full">
                <Input
                    {...props}
                    ref={ref}
                    type={isVisible ? 'text' : 'password'}
                    value={password}
                    onChange={onChange}
                    className={cn('pr-9', className)}
                />
                <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={toggleVisibility}
                    className="text-muted-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent">
                    {isVisible ? (
                        <EyeOffIcon className="h-4 w-4" />
                    ) : (
                        <EyeIcon className="h-4 w-4" />
                    )}
                    <span className="sr-only">{isVisible ? 'Hide password' : 'Show password'}</span>
                </Button>
            </div>
        );
    }
);

InputPassword.displayName = 'InputPassword';
