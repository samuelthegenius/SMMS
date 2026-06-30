import { useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * Pill-style tab switcher used across all SMMS dashboards.
 * Surface-100 tray, active tab: primary-500 bg + white text + colored shadow.
 *
 * tabs: [{ value: string, label: string, icon?: ReactNode }]
 */
function Tabs({ tabs = [], defaultValue, value: controlledValue, onChange, className, ...props }) {
    const [internalValue, setInternalValue] = useState(defaultValue ?? tabs[0]?.value);
    const active = controlledValue !== undefined ? controlledValue : internalValue;

    const handleChange = (val) => {
        setInternalValue(val);
        onChange?.(val);
    };

    return (
        <div
            role="tablist"
            className={cn(
                'inline-flex items-center gap-1 bg-surface-100 p-1.5 rounded-2xl',
                className
            )}
            {...props}
        >
            {tabs.map((tab) => {
                const isActive = tab.value === active;
                return (
                    <button
                        key={tab.value}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => handleChange(tab.value)}
                        className={cn(
                            'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm border-none cursor-pointer transition-all duration-200 outline-none leading-none',
                            isActive
                                ? 'bg-primary-500 text-white shadow-md shadow-primary-500/25'
                                : 'bg-transparent text-surface-600 hover:text-surface-900 hover:bg-surface-200'
                        )}
                    >
                        {tab.icon && (
                            <span className="flex items-center shrink-0">{tab.icon}</span>
                        )}
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}

Tabs.displayName = 'Tabs';

export { Tabs };
