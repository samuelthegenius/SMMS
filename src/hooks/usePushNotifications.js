import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

/**
 * Hook for managing Web Push Notifications
 * Handles subscription, unsubscription, and permission management
 */
export function usePushNotifications(userId) {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [subscription, setSubscription] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check if push is supported
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  // Convert VAPID key
  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // Get existing subscription from server
  const fetchServerSubscription = useCallback(async () => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('subscription_json')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('last_used_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        setSubscription(data[0].subscription_json);
      }
    } catch (err) {
      // No active subscription found
    }
  }, [userId]);

  useEffect(() => {
    fetchServerSubscription();
  }, [fetchServerSubscription]);

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    if (!isSupported || !userId || !VAPID_PUBLIC_KEY) {
      throw new Error('Push notifications not supported or configured');
    }

    setIsLoading(true);
    
    try {
      // Request permission
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result !== 'granted') {
        throw new Error('Notification permission denied');
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;
      
      // Check for existing push subscription
      let pushSubscription = await registration.pushManager.getSubscription();
      
      if (!pushSubscription) {
        // Create new subscription
        pushSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }

      // Save to server
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: userId,
          subscription_json: pushSubscription.toJSON(),
          device_info: navigator.userAgent,
          is_active: true,
          last_used_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,device_info'
        });

      if (error) throw error;

      setSubscription(pushSubscription.toJSON());
      return pushSubscription;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, userId]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    if (!isSupported || !userId) return;

    setIsLoading(true);
    
    try {
      const registration = await navigator.serviceWorker.ready;
      const pushSubscription = await registration.pushManager.getSubscription();
      
      if (pushSubscription) {
        await pushSubscription.unsubscribe();
      }

      // Mark as inactive in database
      await supabase
        .from('push_subscriptions')
        .update({ is_active: false })
        .eq('user_id', userId);

      setSubscription(null);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, userId]);

  // Test notification
  const testNotification = useCallback(async () => {
    if (!subscription || permission !== 'granted') {
      throw new Error('Not subscribed or permission not granted');
    }

    const registration = await navigator.serviceWorker.ready;
    
    // Show local notification
    await registration.showNotification('SMMS Test', {
      body: 'Push notifications are working!',
      icon: '/apple-touch-icon.png',
      badge: '/favicon.ico',
      tag: 'test',
      requireInteraction: false
    });
  }, [subscription, permission]);

  return {
    isSupported,
    permission,
    subscription,
    isLoading,
    subscribe,
    unsubscribe,
    testNotification
  };
}

export default usePushNotifications;
