/**
 * @file src/pages/AnalyticsPage.jsx
 * @description Dedicated Analytics View for Facility Managers.
 * @author System Administrator
 * 
 * Key Features:
 * - Strategic Insights: focus on high-level data visualization.
 * - Separation of Concerns: keeps operational dashboard focused on ticket management.
 * - Access Control: Restricted to Administrators only.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Loader from '../components/Loader';
import AnalyticsSummary from '../components/AnalyticsSummary';
import { generateTicketReport } from '../utils/generateReport';
import { BarChart, PieChart } from 'lucide-react';

export default function AnalyticsPage() {
    // State Management:
    // 'tickets': Holds the raw data for visualization.
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTickets();
    }, []);

    // Data Fetching:
    // Pulls all tickets to generate comprehensive statistics.
    // Similar query to AdminDashboard but focused purely on data aggregation.
    const fetchTickets = async () => {
        try {
            const { data, error } = await supabase
                .from('tickets')
                .select(`
                    id,
                    title,
                    category,
                    facility_type,
                    specific_location,
                    status,
                    priority,
                    created_at,
                    updated_at,
                    resolved_at
                `);

            if (error) {
                console.error("Error fetching analytics data:", error);
            } else {
                setTickets(data || []);
            }
        } catch (error) {
            console.error('Error fetching analytics data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <Loader />;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <BarChart className="w-8 h-8 text-blue-600" />
                        Analytics Dashboard
                    </h1>
                    <p className="text-slate-500 mt-1">Strategic insights and system performance metrics.</p>
                </div>

                <button
                    onClick={() => generateTicketReport(tickets)}
                    disabled={tickets.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span>📄</span>
                    Download Official Report
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-800 mb-6 border-b border-slate-100 pb-2">
                    System Overview
                </h2>

                {tickets.length > 0 ? (
                    <AnalyticsSummary tickets={tickets} />
                ) : (
                    <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        <PieChart className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p>No data available for analysis yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
