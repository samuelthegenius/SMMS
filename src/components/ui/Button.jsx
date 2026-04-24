import { forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

/**
 * Primary Button Component
 * Features:
 * - Transition effects
 * - Active scale animation
 * - Loading state
 * - Variants: primary, secondary, outline, ghost, danger
 */
const Button = forwardRef(({
    className,
    variant = 'primary',
    size = 'default',
    isLoading = false,
    children,
    ...props
}, ref) => {
    const baseStyles = "inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2";

    const variants = {
        primary: "bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:shadow-lg hover:shadow-primary-500/25 hover:brightness-110 border border-primary-600",
        secondary: "bg-secondary-500 text-white hover:bg-secondary-600 hover:shadow-lg hover:shadow-secondary-500/25 border border-secondary-600",
        accent: "bg-accent-500 text-primary-900 hover:bg-accent-400 hover:shadow-lg hover:shadow-accent-500/25 font-bold border border-accent-600",
        outline: "border-2 border-surface-300 bg-white hover:bg-surface-50 hover:border-surface-400 text-surface-700",
        ghost: "hover:bg-surface-100 text-surface-600 hover:text-surface-900",
        danger: "bg-gradient-to-r from-red-500 to-red-600 text-white hover:shadow-lg hover:shadow-red-500/25 hover:brightness-110 border border-red-600",
    };

    const sizes = {
        default: "h-11 px-6 py-2.5 text-sm",
        sm: "h-9 rounded-lg px-4 py-2 text-xs",
        lg: "h-12 rounded-xl px-8 py-3 text-base",
        icon: "h-10 w-10 rounded-lg",
        'icon-sm': "h-8 w-8 rounded-lg",
    };

    return (
        <button
            ref={ref}
            className={cn(baseStyles, variants[variant], sizes[size], className)}
            disabled={isLoading || props.disabled}
            aria-disabled={isLoading || props.disabled}
            aria-busy={isLoading}
            {...props}
        >
            {isLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {children}
        </button>
    );
});

Button.displayName = "Button";

export { Button };
