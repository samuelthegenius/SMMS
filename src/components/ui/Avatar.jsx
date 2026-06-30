import { cn } from '../../lib/utils';

const gradients = [
    'from-primary-500 to-primary-400',
    'from-secondary-500 to-secondary-300',
    'from-accent-500 to-accent-600',
    'from-primary-500 to-secondary-500',
    'from-violet-600 to-blue-500',
    'from-cyan-600 to-cyan-400',
];

function getGradient(name = '') {
    const code = name.charCodeAt(0) || 0;
    return gradients[code % gradients.length];
}

function getInitials(name = '') {
    return name
        .split(' ')
        .slice(0, 2)
        .map(w => (w[0] || '').toUpperCase())
        .join('');
}

const sizes = {
    sm: 'w-8 h-8 text-[0.6875rem] font-bold',
    md: 'w-10 h-10 text-sm font-bold',
    lg: 'w-12 h-12 text-base font-bold',
    xl: 'w-16 h-16 text-xl font-bold',
};

function Avatar({ name = '', src, size = 'md', className, ...props }) {
    const sizeClass = sizes[size] ?? sizes.md;
    const initials = getInitials(name);

    const base = cn(
        'rounded-full flex items-center justify-center text-white shrink-0 overflow-hidden',
        sizeClass,
        className
    );

    if (src) {
        return (
            <div className={base} title={name} {...props}>
                <img src={src} alt={name} className="w-full h-full object-cover" />
            </div>
        );
    }

    return (
        <div
            className={cn(base, `bg-gradient-to-br ${getGradient(name)}`)}
            title={name}
            aria-label={name || 'User avatar'}
            {...props}
        >
            {initials || '?'}
        </div>
    );
}

Avatar.displayName = 'Avatar';

export { Avatar };
