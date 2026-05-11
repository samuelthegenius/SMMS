// Optimized Service Worker for Maximum Performance
// Implements Cache-First for static assets and Stale-While-Revalidate for dynamic content

const CACHE_NAME = 'smms-v10';
const STATIC_CACHE = 'smms-static-v10';
const API_CACHE = 'smms-api-v10';
const IMAGE_CACHE = 'smms-images-v10';

// Resources to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico'
];

// Cache strategies
const CACHE_STRATEGIES = {
  // Static assets: Cache First, then Network (aggressive caching)
  static: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    maxEntries: 100
  },
  // API responses: Stale While Revalidate
  api: {
    maxAge: 5 * 60 * 1000, // 5 minutes
    maxEntries: 50
  },
  // Images: Cache First with long TTL
  image: {
    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
    maxEntries: 200
  }
};

// Install event - pre-cache critical resources
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force update to replace any stuck broken SW

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        // Pre-cache in parallel for faster install
        return Promise.all(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(() => {
              // Silent fail on cache error
            })
          )
        );
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheName.includes('v10')) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Helper: Check if response is valid and safe to cache
// Accept 'basic' (same-origin) and 'cors' (cross-origin, e.g. Supabase)
// Never cache auth errors (401/403) — they would lock users out
const isValidResponse = (response) => {
  if (!response) return false;
  if (response.status === 401 || response.status === 403) return false;
  return response.status === 200 && (response.type === 'basic' || response.type === 'cors');
};

// Helper: Check if URL is a static asset
const isStaticAsset = (url) => {
  return url.includes('/assets/') ||
         /\.(js|css|woff2?|png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url);
};

// Helper: Check if URL is an API call
const isApiCall = (url) => {
  return url.includes('/api/') || 
         url.includes('supabase.co') ||
         url.includes('.vercel.app/api');
};

// Helper: Check if URL is an image
const isImage = (url) => {
  return /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url);
};

// Fetch event - intelligent caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Skip non-HTTP requests
  if (!url.startsWith('http')) {
    return;
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip opaque requests that can't be cached
  if (request.mode === 'no-cors') {
    return;
  }

  // API calls: Stale While Revalidate
  if (isApiCall(url)) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE, CACHE_STRATEGIES.api));
    return;
  }

  // Images: Cache First
  if (isImage(url)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, CACHE_STRATEGIES.image));
    return;
  }

  // Static assets: Cache First
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, CACHE_STRATEGIES.static));
    return;
  }

  // Navigation requests: Network First with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  // Default: Cache First
  event.respondWith(cacheFirst(request, STATIC_CACHE, CACHE_STRATEGIES.static));
});

// Cache First strategy - best for static assets
async function cacheFirst(request, cacheName, strategy) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    // Check if cache is still fresh
    const dateHeader = cached.headers.get('date');
    if (dateHeader) {
      const age = Date.now() - new Date(dateHeader).getTime();
      if (age < strategy.maxAge) {
        return cached;
      }
    } else {
      return cached;
    }
  }

  try {
    const response = await fetch(request);
    if (isValidResponse(response)) {
      // Clone before caching
      const responseToCache = response.clone();
      await cache.put(request, responseToCache);
      // Clean up old entries
      await cleanupCache(cacheName, strategy.maxEntries);
    }
    return response;
  } catch (error) {
    // Return cached response if network fails
    if (cached) {
      return cached;
    }
    // Graceful fallback to avoid Uncaught Promise Rejection in SW
    return new Response(
      JSON.stringify({ error: 'Service Unavailable', offline: true }), 
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Stale While Revalidate strategy - best for APIs
async function staleWhileRevalidate(request, cacheName, strategy) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Return cached version immediately
  const fetchPromise = fetch(request).then(async (response) => {
    if (isValidResponse(response)) {
      await cache.put(request, response.clone());
      await cleanupCache(cacheName, strategy.maxEntries);
    }
    return response;
  }).catch((error) => {
    if (cached) return cached;
    // Graceful fallback
    return new Response(
      JSON.stringify({ error: 'Service Unavailable', offline: true }), 
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  });

  return cached || fetchPromise;
}

// Network First strategy - best for navigation
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (isValidResponse(networkResponse)) {
      const cache = await caches.open(cacheName);
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    
    // Fallback to /index.html for SPA routing if offline
    if (request.mode === 'navigate') {
      const indexCached = await cache.match('/index.html');
      if (indexCached) {
        return indexCached;
      }
    }
    
    // Graceful fallback
    return new Response(
      'Service Unavailable - You are offline and the page is not cached.', 
      { status: 503, headers: { 'Content-Type': 'text/plain' } }
    );
  }
}

// Clean up old cache entries
async function cleanupCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    const entriesToDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(entriesToDelete.map(key => cache.delete(key)));
  }
}

// Push Notification Support
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
        { action: 'view', title: 'View Ticket' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch {
    // Silent fail
  }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notificationData = event.notification.data;
  let targetUrl = '/';

  if (notificationData?.ticketId) {
    targetUrl = `/ticket/${notificationData.ticketId}`;
  } else if (notificationData?.dashboard) {
    targetUrl = '/dashboard';
  }

  if (event.action === 'view' && notificationData?.ticketId) {
    event.waitUntil(clients.openWindow(targetUrl));
  } else if (event.action === 'dismiss') {
    return;
  } else {
    // Default click - focus or open window
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then(c => c.navigate(targetUrl));
          }
        }
        return clients.openWindow(targetUrl);
      })
    );
  }
});

// Handle push subscription change
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    fetch('/api/update-push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: event.newSubscription,
        old_endpoint: event.oldSubscription?.endpoint
      })
    }).catch(() => {})
  );
});

// Message handling from main thread
self.addEventListener('message', (event) => {
  const sendResponse = (data) => {
    if (event.source) {
      event.source.postMessage(data);
    }
  };

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
      .then(() => {
        sendResponse({ type: 'SKIP_WAITING_SUCCESS' });
      })
      .catch((err) => {
        sendResponse({ type: 'SKIP_WAITING_ERROR', error: err.message });
      });
    return;
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }).then(() => {
        sendResponse({ type: 'CLEAR_CACHE_SUCCESS' });
      }).catch((err) => {
        sendResponse({ type: 'CLEAR_CACHE_ERROR', error: err.message });
      })
    );
    return;
  }

  // Handle local notification requests from main thread
  if (event.data.type === 'SHOW_NOTIFICATION') {
    event.waitUntil(
      self.registration.showNotification(event.data.title, {
        body: event.data.body,
        icon: '/apple-touch-icon.png',
        badge: '/favicon.ico',
        tag: event.data.tag || `local-${Date.now()}`,
        data: event.data.data || {}
      }).then(() => {
        sendResponse({ type: 'NOTIFICATION_SHOWN', success: true });
      }).catch((err) => {
        sendResponse({ type: 'NOTIFICATION_ERROR', error: err.message });
      })
    );
    return;
  }
});
