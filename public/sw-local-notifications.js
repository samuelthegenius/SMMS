// Local/Background Notifications for SMMS - NO EXTERNAL PUSH SERVICE REQUIRED
// Uses Periodic Background Sync and Background Fetch for local polling

// Store pending notifications in IndexedDB
const DB_NAME = 'SMMS_Notifications';
const DB_VERSION = 1;
const STORE_NAME = 'pending';

// Open IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// Store notification for later
async function queueLocalNotification(notification) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await store.add({
    ...notification,
    timestamp: Date.now(),
    processed: false
  });
}

// Show local notification immediately (works when app is running or in background)
async function showLocalNotification(title, body, options = {}) {
  const notificationOptions = {
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
  };

  await self.registration.showNotification(title, notificationOptions);
}

// ============================================
// PERIODIC BACKGROUND SYNC (Chrome/Edge only)
// ============================================
// This allows the SW to wake up periodically without external push
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-escalations') {
    event.waitUntil(checkEscalationsAndNotify());
  }
});

// Check for escalations by polling your API
async function checkEscalationsAndNotify() {
  try {
    // Fetch pending escalations from your server
    const response = await fetch('/api/pending-escalations', {
      method: 'GET',
      headers: { 
        'Cache-Control': 'no-cache',
        'X-SW-Request': 'true'
      }
    });

    if (!response.ok) return;

    const escalations = await response.json();

    for (const escalation of escalations) {
      await showLocalNotification(
        `Escalation: ${escalation.priority}`,
        escalation.message,
        {
          tag: `escalation-${escalation.ticket_id}`,
          requireInteraction: escalation.priority === 'High' || escalation.priority === 'Critical',
          data: {
            ticketId: escalation.ticket_id,
            escalationId: escalation.id,
            type: 'escalation'
          },
          actions: [
            { action: 'view', title: 'View Ticket' },
            { action: 'ack', title: 'Acknowledge' }
          ]
        }
      );

      // Acknowledge to prevent duplicate notifications
      await fetch('/api/acknowledge-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          escalation_id: escalation.id,
          channel: 'local_push'
        })
      }).catch(() => {});
    }
  } catch {
    // Silent fail
  }
}

// ============================================
// BACKGROUND FETCH (Alternative for iOS/Android)
// ============================================
self.addEventListener('backgroundfetchsuccess', (event) => {
  event.waitUntil(
    event.registration.updateUI({
      title: 'SMMS Updates Available'
    })
  );
});

// ============================================
// MESSAGE HANDLING FROM MAIN THREAD
// ============================================
self.addEventListener('message', (event) => {
  const sendResponse = (data) => {
    if (event.source) {
      event.source.postMessage(data);
    }
  };

  switch (event.data.type) {
    case 'SHOW_LOCAL_NOTIFICATION':
      event.waitUntil(
        showLocalNotification(
          event.data.title,
          event.data.body,
          event.data.options
        ).then(() => {
          sendResponse({ type: 'NOTIFICATION_SHOWN', success: true });
        }).catch((err) => {
          sendResponse({ type: 'NOTIFICATION_ERROR', error: err.message });
        })
      );
      break;

    case 'REGISTER_PERIODIC_SYNC':
      event.waitUntil(
        registerPeriodicSync().then(() => {
          sendResponse({ type: 'PERIODIC_SYNC_REGISTERED', success: true });
        }).catch((err) => {
          sendResponse({ type: 'PERIODIC_SYNC_ERROR', error: err.message });
        })
      );
      break;

    case 'SCHEDULE_NOTIFICATION':
      // Schedule a notification for a future time
      event.waitUntil(
        queueLocalNotification(event.data.notification).then(() => {
          sendResponse({ type: 'NOTIFICATION_SCHEDULED', success: true });
        })
      );
      break;
  }
});

// Register periodic background sync
async function registerPeriodicSync() {
  if ('periodicSync' in self.registration) {
    try {
      // Request permission for periodic sync (usually min interval is 12 hours in production)
      await self.registration.periodicSync.register('check-escalations', {
        minInterval: 15 * 60 * 1000 // 15 minutes minimum
      });
    } catch {
      throw error;
    }
  } else {
    throw new Error('Periodic Background Sync not supported');
  }
}

// ============================================
// NOTIFICATION CLICK HANDLING
// ============================================

// ============================================
// NOTIFICATION CLICK HANDLING
// ============================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  let targetUrl = '/';

  if (data?.ticketId) {
    targetUrl = `/ticket/${data.ticketId}`;
  }

  if (event.action === 'ack' && data?.escalationId) {
    // Acknowledge the escalation
    event.waitUntil(
      fetch('/api/acknowledge-escalation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escalation_id: data.escalationId })
      }).catch(() => {})
    );
    return;
  }

  // Open or focus window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus().then(c => {
            c.postMessage({ type: 'NAVIGATE', url: targetUrl });
            return c.navigate(targetUrl);
          });
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// ============================================
// SYNC EVENT (for offline queueing)
// ============================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notifications') {
    event.waitUntil(processQueuedNotifications());
  }
});

// Process notifications that were queued while offline
async function processQueuedNotifications() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  const pending = await store.getAll();
  
  for (const notification of pending) {
    if (!notification.processed && notification.timestamp <= Date.now()) {
      await showLocalNotification(notification.title, notification.body, notification.options);
      
      // Mark as processed
      notification.processed = true;
      await store.put(notification);
    }
  }
}
