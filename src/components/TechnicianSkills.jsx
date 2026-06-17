import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/useAuth';
import { Wrench, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const ALL_SKILLS = [
    'Electrical',
    'Plumbing',
    'HVAC (Air Conditioning)',
    'Carpentry & Furniture',
    'IT & Networking',
    'General Maintenance',
    'Painting',
    'Civil Works',
    'Appliance Repair',
    'Cleaning Services',
];

export default function TechnicianSkills() {
    const { profile } = useAuth();
    const [selectedSkills, setSelectedSkills] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchSkills = useCallback(async () => {
        if (!profile?.id) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('technician_skills')
                .select('skill')
                .eq('profile_id', profile.id);
            if (error) throw error;
            setSelectedSkills(new Set(data.map(r => r.skill)));
        } catch {
            toast.error('Failed to load skills');
        } finally {
            setLoading(false);
        }
    }, [profile?.id]);

    useEffect(() => { fetchSkills(); }, [fetchSkills]);

    const toggleSkill = (skill) => {
        setSelectedSkills(prev => {
            const next = new Set(prev);
            next.has(skill) ? next.delete(skill) : next.add(skill);
            return next;
        });
    };

    const saveSkills = async () => {
        if (!profile?.id) return;
        setSaving(true);
        try {
            // Delete all existing skills then re-insert selected ones
            const { error: deleteError } = await supabase
                .from('technician_skills')
                .delete()
                .eq('profile_id', profile.id);
            if (deleteError) throw deleteError;

            if (selectedSkills.size > 0) {
                const rows = [...selectedSkills].map(skill => ({ profile_id: profile.id, skill }));
                const { error: insertError } = await supabase
                    .from('technician_skills')
                    .insert(rows);
                if (insertError) throw insertError;
            }

            toast.success('Skills updated successfully');
        } catch {
            toast.error('Failed to save skills');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-amber-100 rounded-lg">
                        <Wrench className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">My Skills</h2>
                        <p className="text-sm text-slate-500">Select the maintenance categories you can handle</p>
                    </div>
                </div>
                <div className="flex items-center justify-center h-20">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-100 rounded-lg">
                        <Wrench className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">My Skills</h2>
                        <p className="text-sm text-slate-500">Select the maintenance categories you can handle</p>
                    </div>
                </div>
                <span className="text-xs text-slate-400">{selectedSkills.size} selected</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
                {ALL_SKILLS.map(skill => {
                    const active = selectedSkills.has(skill);
                    return (
                        <button
                            key={skill}
                            onClick={() => toggleSkill(skill)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium transition-colors text-left
                                ${active
                                    ? 'border-amber-400 bg-amber-50 text-amber-800'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                                }`}
                        >
                            <span className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border ${active ? 'bg-amber-500 border-amber-500' : 'border-slate-300 bg-white'}`}>
                                {active && <Check className="w-3 h-3 text-white" />}
                            </span>
                            {skill}
                        </button>
                    );
                })}
            </div>

            <button
                onClick={saveSkills}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Skills'}
            </button>
        </div>
    );
}
