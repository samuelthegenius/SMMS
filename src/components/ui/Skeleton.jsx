import { cn } from '../../lib/utils';

function Skeleton({ className, ...props }) {
    return (
        <div
            className={cn('skeleton', className)}
            aria-hidden="true"
            {...props}
        />
    );
}

export { Skeleton };
