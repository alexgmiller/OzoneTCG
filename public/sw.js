'use strict';

// ── Config ────────────────────────────────────────────────────────────────────

const CACHE_NAME = 'ozone-card-images-v1';
const MAX_ENTRIES = 1000;
const EVICT_COUNT = 100;       // delete oldest N when cap is reached
const PRECACHE_CONCURRENCY = 5;
const SUPABASE_HOST = 'ukcwenkakivcflnonihu.supabase.co';
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif|svg)(\?[^#]*)?$/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isCacheableImage(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    // Supabase Storage objects
    if (u.hostname === SUPABASE_HOST && u.pathname.includes('/storage/v1/object/')) return true;
    // Standard image file extensions
    if (IMAGE_EXT_RE.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

// FIFO eviction: cache.keys() is insertion-ordered per spec.
// Delete the oldest EVICT_COUNT entries when cap is exceeded.
async function maybeEvict(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  const toEvict = keys.slice(0, EVICT_COUNT);
  await Promise.all(toEvict.map((req) => cache.delete(req)));
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  // Activate immediately — don't wait for existing tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim all open clients so the SW controls them right away.
  event.waitUntil(self.clients.claim());
});

// ── Fetch: cache-first for images ─────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  // Only handle GET requests to cacheable image URLs.
  if (event.request.method !== 'GET') return;
  if (!isCacheableImage(event.request.url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache hit — return immediately.
      const cached = await cache.match(event.request);
      if (cached) return cached;

      // Cache miss — fetch from network, cache in background, return response.
      const response = await fetch(event.request);
      if (response.ok) {
        // Background cache population — do not await so the response is
        // returned to the page without delay.
        cache.put(event.request, response.clone())
          .then(() => maybeEvict(cache))
          .catch(() => {});
      }
      return response;
    })
  );
});

// ── Message handler ───────────────────────────────────────────────────────────

async function precacheImages(urls, source) {
  const cache = await caches.open(CACHE_NAME);
  let cached = 0;
  let failed = 0;

  for (let i = 0; i < urls.length; i += PRECACHE_CONCURRENCY) {
    const batch = urls.slice(i, i + PRECACHE_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        if (!isCacheableImage(url)) return;
        // Skip already-cached entries to avoid wasting bandwidth.
        if (await cache.match(url)) return;
        // mode: no-cors is appropriate for cross-origin image assets.
        const resp = await fetch(url, { mode: 'no-cors' });
        await cache.put(url, resp);
        cached++;
      })
    );
    for (const r of results) {
      if (r.status === 'rejected') failed++;
    }
  }

  await maybeEvict(cache);

  if (source) {
    try {
      source.postMessage({ type: 'precache-complete', cached, failed });
    } catch {}
  }
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  const source = event.source;

  if (data.type === 'precache-images') {
    const urls = Array.isArray(data.urls) ? data.urls : [];
    if (urls.length > 0) {
      event.waitUntil(precacheImages(urls, source));
    }
  } else if (data.type === 'clear-image-cache') {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        if (source) {
          try { source.postMessage({ type: 'cache-cleared' }); } catch {}
        }
      })
    );
  } else if (data.type === 'query-cache-size') {
    event.waitUntil(
      caches.open(CACHE_NAME).then(async (cache) => {
        const keys = await cache.keys();
        if (source) {
          try { source.postMessage({ type: 'cache-size', size: keys.length }); } catch {}
        }
      })
    );
  }
});
