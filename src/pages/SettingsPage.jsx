import { useState } from 'react';
import { useAuth } from '../contexts/useAuth';
import NotificationSettings from '../components/NotificationSettings';
import SecuritySettings from '../components/SecuritySettings';
import TechnicianSkills from '../components/TechnicianSkills';
import { supabase } from '../lib/supabase';
import { User, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { profile, user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshProfile = async () => {
    if (!user?.id) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;

      toast.success(`Profile refreshed. Role: ${data.role}`);
      // Force page reload to pick up new profile data
      window.location.reload();
    } catch (err) {
      toast.error('Failed to refresh profile: ' + err.message);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-surface-900">Settings</h1>
        <p className="mt-2 text-surface-600">
          Manage your account preferences and notification settings
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile Info Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary-100 rounded-2xl">
                  <User className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-surface-900">Profile Information</h2>
                  <p className="text-sm text-surface-500">Your account details</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleRefreshProfile}
                disabled={refreshing}
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 bg-surface-50 rounded-xl">
                <label className="text-xs font-medium text-surface-500 uppercase">User ID</label>
                <p className="text-sm font-mono text-surface-700 truncate">{user?.id || 'N/A'}</p>
              </div>
              <div className="p-3 bg-surface-50 rounded-xl">
                <label className="text-xs font-medium text-surface-500 uppercase">Email</label>
                <p className="text-sm font-medium text-surface-900">{profile?.email || user?.email || 'N/A'}</p>
              </div>
              <div className="p-3 bg-surface-50 rounded-xl">
                <label className="text-xs font-medium text-surface-500 uppercase">Name</label>
                <p className="text-sm font-medium text-surface-900">{profile?.full_name || 'N/A'}</p>
              </div>
              <div className="p-3 bg-surface-50 rounded-xl">
                <label className="text-xs font-medium text-surface-500 uppercase">Role</label>
                <p className={`text-sm font-medium capitalize ${profile?.role === 'it_admin' ? 'text-secondary-600' : 'text-surface-900'}`}>
                  {profile?.role || 'N/A'}
                  {profile?._isFallback && <span className="text-warning-500 ml-2">(fallback)</span>}
                </p>
              </div>
              <div className="p-3 bg-surface-50 rounded-xl">
                <label className="text-xs font-medium text-surface-500 uppercase">Department</label>
                <p className="text-sm font-medium text-surface-900">{profile?.department || 'N/A'}</p>
              </div>
            </div>

            {import.meta.env.DEV && (
              <div className="mt-4 p-3 bg-surface-100 rounded-xl">
                <label className="text-xs font-medium text-surface-500 uppercase">Debug: Full Profile</label>
                <pre className="text-xs text-surface-600 overflow-auto mt-1">
                  {JSON.stringify(profile, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Technician Skills (only for technician/team_lead roles) */}
        {(profile?.role === 'technician' || profile?.role === 'team_lead') && (
          <TechnicianSkills />
        )}

        {/* Notification Settings */}
        <NotificationSettings />

        {/* Security Settings */}
        <SecuritySettings />
      </div>
    </div>
  );
}
