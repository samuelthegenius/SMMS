// Push Notification Support for SMMS
// Add this to your existing service worker or include separately

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'SMMS Alert';
    const options = {
      body: data.body || 'You have a new notification',
      icon: data.icon || '/apple-touch-icon.png',
      badge: data.badge || '/favicon.ico',
      tag: data.tag || 'default',
      requireInteraction: data.requireInteraction || false,
      data: data.data || {},
      actions: data.actions || [
        {
          action: 'view',
          title: 'View Ticket',
          icon: '/icon-view.png'
        },
        {
          action: 'dismiss',
          title: 'Dismiss',
          icon: '/icon-dismiss.png'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );

    // Track notification received
    event.waitUntil(
      fetch('/api/log-push-received', {
        method: 'POST',
        body: JSON.stringify({ 
          notification_id: data.data?.notificationId,
          received_at: new Date().toISOString()
        })
      }).catch(() => {})
    );
  } catch (error) {
    console.error('[SW] Push event error:', error);
  }
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notificationData = event.notification.data;
  let targetUrl = '/';

  // Determine target URL based on notification type
  if (notificationData?.ticketId) {
    targetUrl = `/ticket/${notificationData.ticketId}`;
  } else if (notificationData?.dashboard) {
    targetUrl = '/dashboard';
  }

  if (event.action === 'view' && notificationData?.ticketId) {
    // View action clicked
    event.waitUntil(
      clients.openWindow(targetUrl)
    );
  } else if (event.action === 'dismiss') {
    // Just close the notification
    return;
  } else {
    // Default click - open the app
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // Focus existing window if open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then(c => c.navigate(targetUrl));
          }
        }
        // Otherwise open new window
        return clients.openWindow(targetUrl);
      })
    );
  }

  // Track notification click
  event.waitUntil(
    fetch('/api/log-push-click', {
      method: 'POST',
      body: JSON.stringify({
        notification_id: notificationData?.notificationId,
        action: event.action || 'default',
        clicked_at: new Date().toISOString()
      })
    }).catch(() => {})
  );
});

// Handle push subscription change
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    // Re-subscribe and update server
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        'YOUR_VAPID_PUBLIC_KEY_HERE'
      )
    }).then((newSubscription) => {
      // Send new subscription to server
      return fetch('/api/update-push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: newSubscription,
          old_endpoint: event.oldSubscription?.endpoint
        })
      });
    })
  );
});

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

console.log('[SW] Push notification support loaded');
