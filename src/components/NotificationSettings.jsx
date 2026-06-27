import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/useAuth';
import { supabase } from '../lib/supabase';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Bell, Mail, Smartphone, AlertTriangle, Loader2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';

export default function NotificationSettings() {
  const { user } = useAuth();
  const { 
    isSupported: pushSupported, 
    permission: pushPermission, 
    isLoading: pushLoading,
    subscribe: subscribePush,
    unsubscribe: unsubscribePush,
    testNotification 
  } = usePushNotifications(user?.id);

  const [preferences, setPreferences] = useState({
    escalate_email: true,
    escalate_push: true,
    escalate_sms: false,
    assign_email: true,
    assign_push: true,
    assign_sms: false,
    status_email: false,
    status_push: true,
    status_sms: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch preferences on mount
  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    
    const fetchPreferences = async () => {
      try {
        const { data, error } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (!error && data) {
          setPreferences({
            escalate_email: data.escalate_email,
            escalate_push: data.escalate_push,
            escalate_sms: data.escalate_sms,
            assign_email: data.assign_email,
            assign_push: data.assign_push,
            assign_sms: data.assign_sms,
            status_email: data.status_email,
            status_push: data.status_push,
            status_sms: data.status_sms,
          });
        }
      } catch {
        // Silent fail
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreferences();
  }, [user?.id]);

  const handleToggle = (key) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const savePreferences = async () => {
    if (!user?.id) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          ...preferences,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;
      toast.success('Notification preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePushSubscribe = async () => {
    try {
      await subscribePush();
      toast.success('Push notifications enabled');
    } catch (err) {
      toast.error(err.message || 'Failed to enable push notifications');
    }
  };

  const handlePushUnsubscribe = async () => {
    try {
      await unsubscribePush();
      toast.success('Push notifications disabled');
    } catch {
      toast.error('Failed to disable push notifications');
    }
  };

  const handleTestPush = async () => {
    try {
      await testNotification();
      toast.success('Test notification sent');
    } catch (err) {
      toast.error(err.message || 'Test failed');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardContent className="p-6">
      <h2 className="text-xl font-bold text-surface-900 mb-6 flex items-center gap-2">
        <Bell className="w-5 h-5" />
        Notification Settings
      </h2>

      {/* Push Notifications Section */}
      {pushSupported && (
        <div className="mb-8 p-4 bg-primary-50 rounded-xl border border-primary-100">
          <h3 className="font-semibold text-primary-900 mb-2 flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            Push Notifications (Browser)
          </h3>
          <p className="text-sm text-primary-700 mb-4">
            Receive instant notifications on your device even when the app is closed.
          </p>

          <div className="flex items-center gap-3">
            {pushPermission === 'granted' ? (
              <>
                <span className="flex items-center gap-1 text-sm text-success-700 bg-success-100 px-3 py-1 rounded-full">
                  <Check className="w-4 h-4" />
                  Enabled
                </span>
                <Button
                  onClick={handleTestPush}
                  disabled={pushLoading}
                  size="sm"
                >
                  Test Notification
                </Button>
                <Button
                  onClick={handlePushUnsubscribe}
                  disabled={pushLoading}
                  variant="ghost"
                  size="sm"
                  className="text-destructive-600 hover:text-destructive-700 hover:bg-destructive-50"
                >
                  Disable
                </Button>
              </>
            ) : pushPermission === 'denied' ? (
              <span className="flex items-center gap-1 text-sm text-destructive-700 bg-destructive-100 px-3 py-1 rounded-full">
                <X className="w-4 h-4" />
                Blocked - Please enable in browser settings
              </span>
            ) : (
              <Button
                onClick={handlePushSubscribe}
                disabled={pushLoading}
                size="sm"
                className="gap-2"
              >
                {pushLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Enable Push Notifications
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Escalation Alerts */}
      <div className="mb-6">
        <h3 className="font-semibold text-surface-900 mb-1 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Escalation Alerts
        </h3>
        <p className="text-sm text-surface-500 mb-3">
          When verified tickets are not attended to after the threshold time
        </p>
        
        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 bg-surface-50 rounded-xl cursor-pointer hover:bg-surface-100 transition-colors">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-surface-500" />
              <span className="text-sm font-medium">Email Notifications</span>
            </div>
            <input
              type="checkbox"
              checked={preferences.escalate_email}
              onChange={() => handleToggle('escalate_email')}
              className="w-5 h-5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
            />
          </label>

          <label className="flex items-center justify-between p-3 bg-surface-50 rounded-xl cursor-pointer hover:bg-surface-100 transition-colors">
            <div className="flex items-center gap-3">
              <Smartphone className="w-4 h-4 text-surface-500" />
              <span className="text-sm font-medium">Push Notifications</span>
            </div>
            <input
              type="checkbox"
              checked={preferences.escalate_push}
              onChange={() => handleToggle('escalate_push')}
              className="w-5 h-5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
            />
          </label>

          <label className="flex items-center justify-between p-3 bg-surface-50 rounded-xl cursor-pointer hover:bg-surface-100 transition-colors">
            <div className="flex items-center gap-3">
              <Smartphone className="w-4 h-4 text-surface-500" />
              <div>
                <span className="text-sm font-medium">SMS Notifications</span>
                <p className="text-xs text-surface-400">Critical escalations only (3+ alerts)</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={preferences.escalate_sms}
              onChange={() => handleToggle('escalate_sms')}
              className="w-5 h-5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
            />
          </label>
        </div>
      </div>

      {/* Assignment Alerts */}
      <div className="mb-6">
        <h3 className="font-semibold text-surface-900 mb-1">Assignment Alerts</h3>
        <p className="text-sm text-surface-500 mb-3">
          When tickets are assigned to you
        </p>
        
        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 bg-surface-50 rounded-xl cursor-pointer hover:bg-surface-100 transition-colors">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-surface-500" />
              <span className="text-sm font-medium">Email Notifications</span>
            </div>
            <input
              type="checkbox"
              checked={preferences.assign_email}
              onChange={() => handleToggle('assign_email')}
              className="w-5 h-5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
            />
          </label>

          <label className="flex items-center justify-between p-3 bg-surface-50 rounded-xl cursor-pointer hover:bg-surface-100 transition-colors">
            <div className="flex items-center gap-3">
              <Smartphone className="w-4 h-4 text-surface-500" />
              <span className="text-sm font-medium">Push Notifications</span>
            </div>
            <input
              type="checkbox"
              checked={preferences.assign_push}
              onChange={() => handleToggle('assign_push')}
              className="w-5 h-5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
            />
          </label>
        </div>
      </div>

      {/* Status Updates */}
      <div className="mb-6">
        <h3 className="font-semibold text-surface-900 mb-1">Status Updates</h3>
        <p className="text-sm text-surface-500 mb-3">
          When your tickets status changes
        </p>
        
        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 bg-surface-50 rounded-xl cursor-pointer hover:bg-surface-100 transition-colors">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-surface-500" />
              <span className="text-sm font-medium">Email Notifications</span>
            </div>
            <input
              type="checkbox"
              checked={preferences.status_email}
              onChange={() => handleToggle('status_email')}
              className="w-5 h-5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
            />
          </label>

          <label className="flex items-center justify-between p-3 bg-surface-50 rounded-xl cursor-pointer hover:bg-surface-100 transition-colors">
            <div className="flex items-center gap-3">
              <Smartphone className="w-4 h-4 text-surface-500" />
              <span className="text-sm font-medium">Push Notifications</span>
            </div>
            <input
              type="checkbox"
              checked={preferences.status_push}
              onChange={() => handleToggle('status_push')}
              className="w-5 h-5 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
            />
          </label>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={savePreferences}
          disabled={isSaving}
          className="gap-2"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Preferences
        </Button>
      </div>
      </CardContent>
    </Card>
  );
}
