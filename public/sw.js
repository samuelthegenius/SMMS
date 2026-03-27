// Optimized Service Worker for Maximum Performance
// Implements Cache-First for static assets and Stale-While-Revalidate for dynamic content

const CACHE_NAME = 'smms-v5';
const STATIC_CACHE = 'smms-static-v5';
const API_CACHE = 'smms-api-v5';
const IMAGE_CACHE = 'smms-images-v5';

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
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        // Pre-cache in parallel for faster install
        return Promise.all(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => {
              console.warn(`[SW] Failed to cache ${url}:`, err.message);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheName.includes('v5')) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Helper: Check if response is valid
const isValidResponse = (response) => {
  return response && response.status === 200 && response.type === 'basic';
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
    throw error;
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
  }).catch(() => cached); // Fallback to cache on error

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
    throw error;
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

// Message handling from main thread
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      })
    );
  }
});
