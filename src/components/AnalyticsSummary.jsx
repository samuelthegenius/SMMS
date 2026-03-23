/**
 * @file src/components/AnalyticsSummary.jsx
 * @description Visual Analytics Dashboard for Facility Managers.
 * 
 * Key Features:
 * - Data Visualization: Uses 'recharts' to render interactive charts.
 * - Status Breakdown: Doughnut chart showing the proportion of Resolved vs. Pending tickets.
 * - Fault Hotspots: Bar chart highlighting the most common maintenance categories.
 * - Responsive Design: Adapts chart size and layout for mobile and desktop screens.
 */
import { useMemo, memo } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

// Corporate Color Palette for Statuses
const STATUS_COLORS = {
    Resolved: '#10B981', // Emerald-500
    'In Progress': '#3B82F6', // Blue-500
    Pending: '#EF4444', // Red-500
    Assigned: '#F59E0B', // Amber-500
    'Pending Verification': '#8B5CF6', // Violet-500
    Open: '#6366F1',      // Indigo-500
    Completed: '#10B981', // Emerald-500 (Same as Resolved)
    Unknown: '#94A3B8'    // Slate-400
};

// Helper to safely get color regardless of casing
const getStatusColor = (status) => {
    if (!status) return STATUS_COLORS.Unknown;
    const key = Object.keys(STATUS_COLORS).find(
        k => k.toLowerCase() === status.toLowerCase()
    );
    return STATUS_COLORS[key] || STATUS_COLORS.Unknown;
};

// Vibrant Palette for Categories
const CATEGORY_COLORS = [
    '#3B82F6', // Blue-500
    '#8B5CF6', // Violet-500
    '#EC4899', // Pink-500
    '#10B981', // Emerald-500
    '#F59E0B', // Amber-500
    '#06B6D4', // Cyan-500
];

function AnalyticsSummary({ tickets = [] }) {

    // Memoized Data Processing:
    // Aggregates raw ticket data into chart-friendly formats.
    const statusData = useMemo(() => {
        const counts = tickets.reduce((acc, ticket) => {
            const status = ticket.status || 'Pending';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});

        const result = Object.keys(counts).map(key => ({
            name: key,
            value: counts[key]
        }));
        
        return result;
    }, [tickets]);

    const categoryData = useMemo(() => {
        const counts = tickets.reduce((acc, ticket) => {
            const category = ticket.category || 'Other';
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {});

        // Sort by frequency to show "Hotspots" first
        const result = Object.keys(counts)
            .map(key => ({ name: key, count: counts[key] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // Top 5 categories
            
        return result;
    }, [tickets]);

    if (tickets.length === 0) {
        return (
            <div className="bg-amber-50 border border-amber-200 p-6 rounded-xl">
                <p className="text-amber-800 text-center">No ticket data available for analytics.</p>
                <p className="text-amber-600 text-sm text-center mt-2">Create some tickets to see analytics charts here.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* 1. Resolution Status Chart (Doughnut) */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Resolution Status</h3>
                <div className="flex-1 w-full" style={{ minHeight: '300px', width: '100%', height: '100%' }}>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={statusData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60} // Creates the "Doughnut" effect
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {statusData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={getStatusColor(entry.name)}
                                    />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 2. Fault Hotspots Chart (Vertical Bar) */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Common Faults</h3>
                <div className="flex-1 w-full" style={{ minHeight: '300px', width: '100%', height: '100%' }}>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                            layout="vertical" // Better for reading long category names
                            data={categoryData}
                            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                            <XAxis type="number" hide />
                            <YAxis
                                dataKey="name"
                                type="category"
                                width={100}
                                tick={{ fill: '#475569', fontSize: 12 }}
                            />
                            <Tooltip
                                cursor={{ fill: '#F1F5F9' }}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar
                                dataKey="count"
                                radius={[0, 4, 4, 0]}
                                barSize={20}
                            >
                                {categoryData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div >
    );
}

const AnalyticsSummaryWithMemo = memo(AnalyticsSummary);

export default AnalyticsSummaryWithMemo;
