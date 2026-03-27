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
    const baseStyles = "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

    const variants = {
        primary: "bg-primary text-white hover:text-accent shadow-md hover:shadow-lg",
        secondary: "bg-accent text-white hover:bg-accent/90 shadow-sm",
        outline: "border border-slate-200 bg-transparent hover:bg-slate-100 text-slate-900",
        ghost: "hover:bg-slate-100 text-slate-700",
        danger: "bg-red-500 text-white hover:bg-red-600 shadow-sm",
    };

    const sizes = {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
    };

    return (
        <button
            ref={ref}
            className={cn(baseStyles, variants[variant], sizes[size], className)}
            disabled={isLoading || props.disabled}
            {...props}
        >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {children}
        </button>
    );
});

Button.displayName = "Button";

export { Button };
