import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Styled native <select> that matches the Input component's visual language
 * (rounded-xl, surface ring, primary focus ring) so every dropdown in the
 * app looks and behaves the same way.
 */
const Select = forwardRef(({ className, children, icon: Icon, ...props }, ref) => {
    return (
        <div className="relative">
            {Icon && (
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Icon className="h-4 w-4 text-surface-400" />
                </div>
            )}
            <select
                ref={ref}
                className={cn(
                    "flex h-11 w-full appearance-none rounded-xl border border-surface-300 bg-white px-4 py-2 text-sm shadow-sm transition-all duration-200 placeholder:text-surface-400 focus-visible:outline-none focus-visible:border-primary-400 focus-visible:ring-4 focus-visible:ring-primary-400/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-50 cursor-pointer",
                    Icon && "pl-10",
                    "pr-10",
                    className
                )}
                {...props}
            >
                {children}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                <ChevronDown className="h-4 w-4 text-surface-400" />
            </div>
        </div>
    );
});
Select.displayName = "Select";

export { Select };
