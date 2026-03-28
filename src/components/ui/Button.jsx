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
    const baseStyles = "inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

    const variants = {
        primary: "bg-gradient-to-r from-primary to-slate-800 text-white hover:shadow-lg hover:shadow-primary/25 hover:brightness-110",
        secondary: "bg-accent text-white hover:bg-amber-600 hover:shadow-lg hover:shadow-accent/25",
        outline: "border-2 border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700",
        ghost: "hover:bg-slate-100 text-slate-600 hover:text-slate-900",
        danger: "bg-gradient-to-r from-red-500 to-red-600 text-white hover:shadow-lg hover:shadow-red-500/25 hover:brightness-110",
    };

    const sizes = {
        default: "h-11 px-6 py-2.5 text-sm",
        sm: "h-9 rounded-lg px-3 py-2 text-xs",
        lg: "h-12 rounded-xl px-8 py-3 text-base",
        icon: "h-10 w-10 rounded-lg",
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
