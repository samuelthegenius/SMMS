import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { Button } from './ui/Button';

export default function ReassignTechnician({ ticket, onReassign }) {
    const [technicians, setTechnicians] = useState([]);
    const [selectedTech, setSelectedTech] = useState(ticket.assigned_to || '');
    const [loading, setLoading] = useState(false);
    const [loadingTechnicians, setLoadingTechnicians] = useState(true);
    const [fetchError, setFetchError] = useState(null);

    useEffect(() => {
        const fetchTechnicians = async () => {
            setLoadingTechnicians(true);
            setFetchError(null);

            // Try category-filtered RPC first if ticket has a category
            if (ticket?.category) {
                try {
                    const { data: rpcData, error: rpcError } = await supabase
                        .rpc('get_technicians_by_category', { p_category: ticket.category });

                    if (!rpcError && rpcData && rpcData.length > 0) {
                        setTechnicians(rpcData);
                        setLoadingTechnicians(false);
                        return;
                    }
                    // If no technicians found for this category, fall through to get all technicians
                } catch {
                    // Category RPC failed, will try all technicians
                }
            }

            // Try RPC function for all technicians (bypasses RLS via SECURITY DEFINER)
            try {
                const { data: rpcData, error: rpcError } = await supabase
                    .rpc('get_technicians');

                if (!rpcError && rpcData) {
                    setTechnicians(rpcData || []);
                    if (rpcData?.length === 0) {
                        toast.warning('No technicians found in the system');
                    }
                    setLoadingTechnicians(false);
                    return;
                }
            } catch {
                // RPC failed, will try direct query
            }

            // Fallback: Direct query with role filter
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, email, role')
                .eq('role', 'technician');

            if (error) {
                setFetchError(error.message);
                toast.error(`Failed to load technicians: ${error.message}`);
            } else {
                setTechnicians(data || []);
                if (data?.length === 0) {
                    toast.warning('No technicians found in the system');
                }
            }
            setLoadingTechnicians(false);
        };

        fetchTechnicians();
    }, [ticket?.category]);

	const handleReassign = async () => {
		if (!selectedTech || selectedTech === ticket.assigned_to) return;

		setLoading(true);
		try {
			// 1. Get New Tech Details
			const newTech = technicians.find(t => t.id === selectedTech);
			if (!newTech) throw new Error("Technician not found");

			// 2. Update Database
			const { error } = await supabase
				.from('tickets')
				.update({ assigned_to: selectedTech })
				.eq('id', ticket.id);

			if (error) throw error;

			// 3. Send Notification via Edge Function
			try {
				await supabase.functions.invoke('send-email', {
					body: {
						type: 'ticket_reassigned',
						technician_email: newTech.email,
						technician_name: newTech.full_name,
						ticket_title: ticket.title,
						ticket_description: ticket.description,
						ticket_location: ticket.specific_location,
						ticket_priority: ticket.priority
					}
				});
			} catch {
				// Email notification failed silently
			}

			toast.success('Technician reassigned successfully');
			if (onReassign) onReassign();
		} catch {
			toast.error('Failed to reassign technician');
		} finally {
			setLoading(false);
		}
	};

    return (
        <div className="flex flex-col gap-2 mt-2">
            {ticket?.category && (
                <p className="text-xs text-slate-500">
                    Showing technicians with <span className="font-medium text-slate-700">{ticket.category}</span> expertise
                </p>
            )}
            <div className="flex items-center gap-2">
                <select
                    className="border p-2 rounded-md bg-white dark:bg-slate-800 dark:text-gray-100"
                    value={selectedTech}
                    onChange={(e) => setSelectedTech(e.target.value)}
                    disabled={loading || loadingTechnicians}
                >
                    <option value="">{loadingTechnicians ? 'Loading technicians...' : 'Select Technician'}</option>
                    {technicians.map((tech) => (
                        <option key={tech.id} value={tech.id}>
                            {tech.full_name}
                        </option>
                    ))}
                </select>
                <Button
                    onClick={handleReassign}
                    disabled={loading || !selectedTech || selectedTech === ticket.assigned_to}
                    size="sm"
                >
                    {loading ? 'Saving...' : 'Reassign'}
                </Button>
            </div>
            {fetchError && (
                <p className="text-xs text-red-600">Error: {fetchError}</p>
            )}
            {!loadingTechnicians && !fetchError && technicians.length === 0 && (
                <p className="text-xs text-amber-600">No technicians found. Check RLS policies.</p>
            )}
        </div>
    );
}
