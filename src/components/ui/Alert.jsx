import { forwardRef } from 'react';
import { Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

const variants = {
    info: {
        wrapper: 'bg-primary-50 border-primary-200 text-primary-700',
        icon: 'text-primary-500',
        Icon: Info,
    },
    success: {
        wrapper: 'bg-success-50 border-success-100 text-success-600',
        icon: 'text-success-500',
        Icon: CheckCircle2,
    },
    warning: {
        wrapper: 'bg-warning-50 border-warning-100 text-warning-600',
        icon: 'text-warning-500',
        Icon: AlertTriangle,
    },
    destructive: {
        wrapper: 'bg-destructive-50 border-destructive-100 text-destructive-700',
        icon: 'text-destructive-500',
        Icon: XCircle,
    },
};

const Alert = forwardRef(function Alert({ variant = 'info', title, children, className, ...props }, ref) {
    const config = variants[variant] ?? variants.info;
    const { Icon } = config;

    return (
        <div
            ref={ref}
            role="alert"
            className={cn(
                'flex gap-3 p-4 rounded-xl border text-sm leading-relaxed',
                config.wrapper,
                className
            )}
            {...props}
        >
            <Icon className={cn('w-5 h-5 mt-0.5 shrink-0', config.icon)} aria-hidden="true" />
            <div className="flex-1 min-w-0">
                {title && (
                    <p className="font-semibold mb-1">{title}</p>
                )}
                {children && <div className="opacity-90">{children}</div>}
            </div>
        </div>
    );
});

Alert.displayName = 'Alert';

export { Alert };
