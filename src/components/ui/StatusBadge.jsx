import { cn } from '../../lib/utils';

const statusClasses = {
    'Open':                 'bg-warning-50 text-warning-600 border-warning-100',
    'Assigned':             'bg-primary-50 text-primary-600 border-primary-100',
    'In Progress':          'bg-secondary-50 text-secondary-700 border-secondary-100',
    'Pending Verification': 'bg-primary-50 text-primary-600 border-primary-100',
    'Escalated':            'bg-destructive-50 text-destructive-700 border-destructive-100',
    'Resolved':             'bg-success-50 text-success-600 border-success-100',
    'Completed':            'bg-success-50 text-success-600 border-success-100',
    'Closed':               'bg-surface-50 text-surface-600 border-surface-200',
    'Rejected':             'bg-destructive-50 text-destructive-700 border-destructive-100',
};

const priorityClasses = {
    'High':   'bg-destructive-50 text-destructive-700 border-destructive-100',
    'Medium': 'bg-warning-50 text-warning-600 border-warning-100',
    'Low':    'bg-success-50 text-success-600 border-success-100',
};

/**
 * Ticket status pill — maps all 9 SMMS ticket states to semantic colours.
 */
function StatusBadge({ status, className, ...props }) {
    const classes = statusClasses[status] ?? 'bg-surface-100 text-surface-600 border-surface-200';
    return (
        <span
            className={cn(
                'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap leading-none border',
                classes,
                className
            )}
            {...props}
        >
            {status}
        </span>
    );
}

StatusBadge.displayName = 'StatusBadge';

/**
 * Ticket priority badge — High (rose), Medium (amber), Low (emerald).
 * All-caps with wide letter-spacing.
 */
function PriorityBadge({ priority, className, ...props }) {
    const classes = priorityClasses[priority] ?? 'bg-surface-100 text-surface-600 border-surface-200';
    return (
        <span
            className={cn(
                'inline-flex items-center px-2.5 py-1 rounded-full text-[0.6875rem] font-bold whitespace-nowrap uppercase tracking-wider leading-none border',
                classes,
                className
            )}
            {...props}
        >
            {priority}
        </span>
    );
}

PriorityBadge.displayName = 'PriorityBadge';

export { StatusBadge, PriorityBadge };
