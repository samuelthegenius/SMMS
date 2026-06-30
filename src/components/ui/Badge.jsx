import { cn } from '../../lib/utils';

const variantClasses = {
    default:     'bg-surface-100 text-surface-700 border border-surface-200',
    primary:     'bg-primary-50 text-primary-600 border border-primary-100',
    secondary:   'bg-secondary-50 text-secondary-700 border border-secondary-100',
    accent:      'bg-accent-50 text-accent-700 border border-accent-100',
    success:     'bg-success-50 text-success-600 border border-success-100',
    warning:     'bg-warning-50 text-warning-600 border border-warning-100',
    destructive: 'bg-destructive-50 text-destructive-600 border border-destructive-100',
    outline:     'bg-transparent text-surface-600 border border-surface-300',
};

const sizeClasses = {
    sm:      'text-[0.625rem] px-2 py-0.5 gap-1',
    default: 'text-xs px-2.5 py-1 gap-1',
    lg:      'text-sm px-3 py-1.5 gap-1.5',
};

function Badge({ variant = 'default', size = 'default', children, className, ...props }) {
    return (
        <span
            className={cn(
                'inline-flex items-center justify-center font-semibold rounded-full whitespace-nowrap leading-none',
                variantClasses[variant] ?? variantClasses.default,
                sizeClasses[size] ?? sizeClasses.default,
                className
            )}
            {...props}
        >
            {children}
        </span>
    );
}

Badge.displayName = 'Badge';

export { Badge };
