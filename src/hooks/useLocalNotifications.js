import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Hook for Local/Background Notifications
 * Works WITHOUT external push services (FCM, VAPID, etc.)
 * Uses Periodic Background Sync and local polling
 */
export function useLocalNotifications(userId) {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [syncRegistered, setSyncRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);

  // Check what's supported
  useEffect(() => {
    const checkSupport = () => {
      const hasServiceWorker = 'serviceWorker' in navigator;
      const hasNotification = 'Notification' in window;
      const hasPeriodicSync = 'periodicSync' in (navigator?.serviceWorker || {});
      const hasBackgroundSync = 'sync' in (navigator?.serviceWorker || {});

      const supported = hasServiceWorker && hasNotification;
      
      setIsSupported(supported);
      
      if (hasNotification) {
        setPermission(Notification.permission);
      }

      console.log('[LocalNotifications] Support check:', {
        serviceWorker: hasServiceWorker,
        notification: hasNotification,
        periodicSync: hasPeriodicSync,
        backgroundSync: hasBackgroundSync,
        supported
      });
    };

    checkSupport();
  }, []);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      throw new Error('Notifications not supported');
    }

    setIsLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Register periodic background sync
  const registerBackgroundSync = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker not supported');
    }

    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;

      // Check for periodic background sync support
      if ('periodicSync' in registration) {
        try {
          // Request permission for periodic sync
          const status = await navigator.permissions.query({
            name: 'periodic-background-sync',
          });

          if (status.state === 'granted') {
            // Register periodic sync
            await registration.periodicSync.register('check-escalations', {
              minInterval: 15 * 60 * 1000 // 15 minutes minimum
            });
            setSyncRegistered(true);
            console.log('[LocalNotifications] Periodic sync registered');
            return { type: 'periodic', registered: true };
          } else {
            console.log('[LocalNotifications] Periodic sync permission denied, falling back to polling');
          }
        } catch (error) {
          console.log('[LocalNotifications] Periodic sync failed:', error);
        }
      }

      // Fallback: Use regular background sync
      if ('sync' in registration) {
        await registration.sync.register('sync-notifications');
        setSyncRegistered(true);
        console.log('[LocalNotifications] Background sync registered');
        return { type: 'sync', registered: true };
      }

      // Final fallback: Just use polling from main thread
      return { type: 'polling', registered: false };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Show immediate local notification
  const showNotification = useCallback(async (title, body, options = {}) => {
    if (!('serviceWorker' in navigator)) {
      // Fallback to regular Notification API
      if (Notification.permission === 'granted') {
        new Notification(title, { body, ...options });
        return;
      }
      throw new Error('Permission not granted');
    }

    const registration = await navigator.serviceWorker.ready;
    
    await registration.showNotification(title, {
      body,
      icon: '/apple-touch-icon.png',
      badge: '/favicon.ico',
      tag: options.tag || `local-${Date.now()}`,
      requireInteraction: options.requireInteraction || false,
      data: options.data || {},
      actions: options.actions || [
        { action: 'view', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
      ...options
    });
  }, []);

  // Schedule a notification for later
  const scheduleNotification = useCallback(async (notification) => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker required');
    }

    const registration = await navigator.serviceWorker.ready;
    
    // Send to service worker to store in IndexedDB
    if (registration.active) {
      registration.active.postMessage({
        type: 'SCHEDULE_NOTIFICATION',
        notification: {
          ...notification,
          scheduledTime: notification.scheduledTime || Date.now()
        }
      });
    }
  }, []);

  // Manual check for escalations (for polling fallback)
  const checkEscalations = useCallback(async () => {
    if (!userId) return [];

    try {
      const { data: escalations, error } = await supabase
        .rpc('get_pending_escalations_for_user', {
          p_user_id: userId
        });

      if (error) throw error;

      setLastCheck(new Date());

      // Show notifications for each escalation
      for (const escalation of escalations || []) {
        await showNotification(
          `Escalation Alert`,
          escalation.message,
          {
            tag: `escalation-${escalation.ticket_id}`,
            requireInteraction: true,
            data: {
              ticketId: escalation.ticket_id,
              type: 'escalation'
            }
          }
        );

        // Acknowledge notification to prevent duplicates
        await supabase.rpc('acknowledge_escalation_notification', {
          p_escalation_id: escalation.id,
          p_channel: 'local'
        });
      }

      return escalations || [];
    } catch (error) {
      console.error('[LocalNotifications] Check failed:', error);
      return [];
    }
  }, [userId, showNotification]);

  // Test notification
  const testNotification = useCallback(async () => {
    await showNotification(
      'SMMS Test',
      'Local notifications are working!',
      {
        tag: 'test',
        requireInteraction: false
      }
    );
  }, [showNotification]);

  // Set up polling interval (fallback when background sync isn't available)
  useEffect(() => {
    if (!userId || syncRegistered) return;

    // Poll every 2 minutes as fallback
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        // Only poll when tab is visible to save battery
        checkEscalations();
      }
    }, 2 * 60 * 1000);

    // Also check when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkEscalations();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId, syncRegistered, checkEscalations]);

  return {
    isSupported,
    permission,
    syncRegistered,
    isLoading,
    lastCheck,
    requestPermission,
    registerBackgroundSync,
    showNotification,
    scheduleNotification,
    checkEscalations,
    testNotification
  };
}

export default useLocalNotifications;
