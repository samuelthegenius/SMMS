import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, CheckCircle, Send, MapPin, AlertTriangle, FileText, Tag, Building } from 'lucide-react';

const FACILITY_TYPES = [
    'Hostel', 'Lecture Hall', 'Laboratory', 'Office',
    'Sports Complex', 'Chapel', 'Other'
];

const CATEGORIES = [
    'Electrical', 'Plumbing', 'AC', 'Furniture', 'Civil', 'ICT'
];

export default function TicketForm() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        category: 'Electrical',
        facilityType: 'Hostel',
        specificLocation: '',
        priority: 'Medium',
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase
                .from('tickets')
                .insert([
                    {
                        title: formData.title,
                        description: formData.description,
                        category: formData.category,
                        facility_type: formData.facilityType,
                        specific_location: formData.specificLocation,
                        priority: formData.priority,
                        user_id: user.id,
                    }
                ]);

            if (error) throw error;

            setSuccess(true);
            setTimeout(() => navigate('/'), 2000);
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="max-w-2xl mx-auto mt-8 p-8 bg-emerald-50 rounded-xl border border-emerald-200 text-center shadow-sm">
                <CheckCircle className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
                <h2 className="text-3xl font-bold text-emerald-800 mb-2">Report Submitted!</h2>
                <p className="text-emerald-700 text-lg">Your ticket has been created successfully. Redirecting...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Report a Fault</h1>
                <p className="text-slate-500 mt-2">Submit a new maintenance request ticket.</p>
            </div>

            <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-8">
                <form onSubmit={handleSubmit} className="space-y-8">
                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                            <AlertCircle className="w-5 h-5" />
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-1">
                                Title
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <FileText className="h-5 w-5 text-slate-400" />
                                </div>
                                <input
                                    type="text"
                                    name="title"
                                    id="title"
                                    required
                                    className="block w-full pl-10 pr-3 py-3 rounded-xl border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border transition-colors"
                                    placeholder="e.g., Broken Fan in Room 101"
                                    value={formData.title}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="facilityType" className="block text-sm font-medium text-slate-700 mb-1">
                                Facility Type
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Building className="h-5 w-5 text-slate-400" />
                                </div>
                                <select
                                    name="facilityType"
                                    id="facilityType"
                                    required
                                    className="block w-full pl-10 pr-3 py-3 rounded-xl border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border transition-colors bg-white appearance-none"
                                    value={formData.facilityType}
                                    onChange={handleChange}
                                >
                                    {FACILITY_TYPES.map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-1">
                                Category
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Tag className="h-5 w-5 text-slate-400" />
                                </div>
                                <select
                                    name="category"
                                    id="category"
                                    required
                                    className="block w-full pl-10 pr-3 py-3 rounded-xl border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border transition-colors bg-white appearance-none"
                                    value={formData.category}
                                    onChange={handleChange}
                                >
                                    {CATEGORIES.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="specificLocation" className="block text-sm font-medium text-slate-700 mb-1">
                                Specific Location
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <MapPin className="h-5 w-5 text-slate-400" />
                                </div>
                                <input
                                    type="text"
                                    name="specificLocation"
                                    id="specificLocation"
                                    required
                                    className="block w-full pl-10 pr-3 py-3 rounded-xl border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border transition-colors"
                                    placeholder="e.g., Room 101, Block A"
                                    value={formData.specificLocation}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="priority" className="block text-sm font-medium text-slate-700 mb-1">
                                Priority
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <AlertTriangle className="h-5 w-5 text-slate-400" />
                                </div>
                                <select
                                    name="priority"
                                    id="priority"
                                    required
                                    className="block w-full pl-10 pr-3 py-3 rounded-xl border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border transition-colors bg-white appearance-none"
                                    value={formData.priority}
                                    onChange={handleChange}
                                >
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                </select>
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
                                Description
                            </label>
                            <textarea
                                name="description"
                                id="description"
                                rows={4}
                                required
                                className="block w-full rounded-xl border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-3 px-4 border transition-colors"
                                placeholder="Describe the issue in detail..."
                                value={formData.description}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full md:w-auto md:min-w-[200px] flex justify-center items-center gap-2 py-3 px-6 border border-transparent shadow-lg text-sm font-bold rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all active:scale-[0.98] ml-auto"
                        >
                            {loading ? 'Submitting...' : (
                                <>
                                    <Send className="w-4 h-4" />
                                    Submit Report
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
