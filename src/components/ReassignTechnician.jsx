import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { Button } from './ui/Button';

export default function ReassignTechnician({ ticket, onReassign }) {
    const [technicians, setTechnicians] = useState([]);
    const [selectedTech, setSelectedTech] = useState(ticket.assigned_to || '');
    const [loading, setLoading] = useState(false);
    const [loadingTechnicians, setLoadingTechnicians] = useState(true);

    useEffect(() => {
        const fetchTechnicians = async () => {
            setLoadingTechnicians(true);
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .eq('role', 'technician');

            if (error) {
                console.error('Error fetching technicians:', error);
            } else {
                setTechnicians(data || []);
            }
            setLoadingTechnicians(false);
        };

        fetchTechnicians();
    }, []);

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
                .update({ assigned_to: selectedTech, status: 'In Progress' })
                .eq('id', ticket.id);

            if (error) throw error;

            // 3. Send Notification via Edge Function
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

            toast.success('Technician reassigned successfully');
            if (onReassign) onReassign(); // Callback to refresh parent list
        } catch (error) {
            console.error('Reassign Error:', error);
            toast.error('Failed to reassign technician');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center gap-2 mt-2">
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
    );
}
