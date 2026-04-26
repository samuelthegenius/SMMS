import { useState } from 'react';
import { useAuth } from '../contexts/useAuth';
import NotificationSettings from '../components/NotificationSettings';
import { supabase } from '../lib/supabase';
import { Bell, User, Shield, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
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
      
      console.log('[Settings] Refreshed profile:', data);
      toast.success(`Profile refreshed. Role: ${data.role}`);
      // Force page reload to pick up new profile data
      window.location.reload();
    } catch (err) {
      console.error('[Settings] Failed to refresh profile:', err);
      toast.error('Failed to refresh profile: ' + err.message);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
          <p className="mt-2 text-slate-600">
            Manage your account preferences and notification settings
          </p>
        </div>

        <div className="space-y-6">
          {/* Profile Info Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-100 rounded-lg">
                  <User className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Profile Information</h2>
                  <p className="text-sm text-slate-500">Your account details</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshProfile}
                disabled={refreshing}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <label className="text-xs font-medium text-slate-500 uppercase">User ID</label>
                <p className="text-sm font-mono text-slate-700 truncate">{user?.id || 'N/A'}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <label className="text-xs font-medium text-slate-500 uppercase">Email</label>
                <p className="text-sm font-medium text-slate-900">{profile?.email || user?.email || 'N/A'}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <label className="text-xs font-medium text-slate-500 uppercase">Name</label>
                <p className="text-sm font-medium text-slate-900">{profile?.full_name || 'N/A'}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <label className="text-xs font-medium text-slate-500 uppercase">Role</label>
                <p className={`text-sm font-medium capitalize ${profile?.role === 'admin' ? 'text-emerald-600' : 'text-slate-900'}`}>
                  {profile?.role || 'N/A'}
                  {profile?._isFallback && <span className="text-amber-500 ml-2">(fallback)</span>}
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <label className="text-xs font-medium text-slate-500 uppercase">Department</label>
                <p className="text-sm font-medium text-slate-900">{profile?.department || 'N/A'}</p>
              </div>
            </div>
            
            {import.meta.env.DEV && (
              <div className="mt-4 p-3 bg-slate-100 rounded-lg">
                <label className="text-xs font-medium text-slate-500 uppercase">Debug: Full Profile</label>
                <pre className="text-xs text-slate-600 overflow-auto mt-1">
                  {JSON.stringify(profile, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Notification Settings */}
          <NotificationSettings />

          {/* Security Settings Placeholder */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Shield className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Security</h2>
                  <p className="text-sm text-slate-500">Password and authentication settings</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
