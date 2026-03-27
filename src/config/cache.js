/**
 * Simple Cache utility for Vite/Vercel
 * Note: For true Runtime Cache with tag invalidation, use Vercel Functions
 * with the Cache API or upgrade to Next.js
 * 
 * This is a client-side compatible cache implementation
 */

const DEFAULT_TTL = 60000; // 1 minute default

class MemoryCache {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get a cached value
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  /**
   * Set a cached value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds
   */
  set(key, value, ttl = DEFAULT_TTL) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
    });
  }

  /**
   * Delete a cached value
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all cached values
   */
  clear() {
    this.cache.clear();
  }
}

// Singleton instance
const globalCache = new MemoryCache();

/**
 * Cache a function's result
 * @param {Function} fn - Function to cache
 * @param {string} key - Cache key
 * @param {number} ttl - Time to live in milliseconds
 * @returns {Function} Cached function
 */
export function withCache(fn, key, ttl = DEFAULT_TTL) {
  return async (...args) => {
    const cacheKey = `${key}:${JSON.stringify(args)}`;
    const cached = globalCache.get(cacheKey);
    
    if (cached !== null) {
      return cached;
    }
    
    const result = await fn(...args);
    globalCache.set(cacheKey, result, ttl);
    return result;
  };
}

/**
 * Cache tags for organization (manual invalidation)
 */
export const CacheTags = {
  TICKETS: 'tickets',
  USERS: 'users',
  ANALYTICS: 'analytics',
  SETTINGS: 'settings',
  BLOB: 'blob',
};

/**
 * Fetch with caching
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @returns {Promise<any>} Fetched data
 */
export async function cachedFetch(url, options = {}) {
  const { 
    cacheKey = url, 
    ttl = DEFAULT_TTL,
    ...fetchOptions 
  } = options;

  const cached = globalCache.get(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const response = await fetch(url, fetchOptions);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }

  const data = await response.json();
  globalCache.set(cacheKey, data, ttl);
  return data;
}

/**
 * Clear cache by pattern
 * @param {string} pattern - Pattern to match keys
 */
export function clearCache(pattern) {
  for (const key of globalCache.cache.keys()) {
    if (key.includes(pattern)) {
      globalCache.delete(key);
    }
  }
}

export { globalCache };
export default globalCache;
