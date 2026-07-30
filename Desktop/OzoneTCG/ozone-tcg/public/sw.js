// OzoneTCG Service Worker — card image cache
// Cache-first strategy for card images; all other requests pass through untouched.

const CACHE_NAME = "ozone-card-images-v1";
const MAX_ENTRIES = 1000;

// ── URL matcher ───────────────────────────────────────────────────────────────

function isCacheableImage(url) {
  try {
    const u = new URL(url);
    // Never intercept Next.js internal routes
    if (u.origin === self.location.origin) {
      if (u.pathname.startsWith("/_next/") || u.pathname.startsWith("/api/")) return false;
      return /\.(png|jpe?g|webp|gif|avif)$/i.test(u.pathname);
    }
    // Cross-origin: Supabase storage, TCGdex, pokemontcg.io CDN
    return (
      u.hostname.endsWith("supabase.co") ||
      u.hostname === "api.tcgdex.net" ||
      u.hostname.endsWith("pokemontcg.io") ||
      /\.(png|jpe?g|webp)$/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

// ── Order tracking ────────────────────────────────────────────────────────────
// Module-level array — resets when the SW restarts, which is fine. On restart
// we rebuild from the live cache on first access.

let cacheOrder = /** @type {string[]} */ ([]);
let orderInitialized = false;

async function initOrder() {
  if (orderInitialized) return;
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  cacheOrder = keys.map((r) => r.url);
  orderInitialized = true;
}

async function evictIfNeeded(cache) {
  while (cacheOrder.length > MAX_ENTRIES) {
    const oldest = cacheOrder.shift();
    if (oldest) await cache.delete(oldest);
  }
}

async function addToCache(cache, url, response) {
  await cache.put(url, response);
  if (!cacheOrder.includes(url)) {
    cacheOrder.push(url);
    await evictIfNeeded(cache);
  }
}

// ── Fetch intercept ───────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!isCacheableImage(event.request.url)) return;

  event.respondWith(
    (async () => {
      await initOrder();
      const cache = await caches.open(CACHE_NAME);

      // Cache-first
      const cached = await cache.match(event.request);
      if (cached) return cached;

      // Network fallback — store clone for next time
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          await addToCache(cache, event.request.url, response.clone());
        }
        return response;
      } catch {
        return new Response(null, { status: 503, statusText: "Service Unavailable" });
      }
    })()
  );
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener("install", () => {
  // Skip waiting so the new SW activates immediately on update
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of all open clients right away
  event.waitUntil(self.clients.claim());
});

// ── Message handler ───────────────────────────────────────────────────────────

self.addEventListener("message", (event) => {
  const { type, urls } = event.data ?? {};

  if (type === "precache-images" && Array.isArray(urls)) {
    event.waitUntil(precacheImages(urls));
  }

  if (type === "clear-image-cache") {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        cacheOrder = [];
        orderInitialized = false;
      })
    );
  }
});

// ── Background pre-cache ──────────────────────────────────────────────────────

const BATCH = 5;

async function precacheImages(urls) {
  await initOrder();
  const cache = await caches.open(CACHE_NAME);

  // Only fetch URLs that aren't already cached and look like images
  const toFetch = [];
  for (const url of urls) {
    if (!url || !isCacheableImage(url)) continue;
    const existing = await cache.match(url);
    if (!existing) toFetch.push(url);
  }

  for (let i = 0; i < toFetch.length; i += BATCH) {
    await Promise.allSettled(
      toFetch.slice(i, i + BATCH).map(async (url) => {
        try {
          // Use no-cors for cross-origin images to avoid CORS pre-flight failures
          const u = new URL(url);
          const sameOrigin = u.origin === self.location.origin;
          const response = await fetch(url, sameOrigin ? undefined : { mode: "no-cors" });
          // ok is false for opaque (no-cors) responses, so also check type
          if (response.ok || response.type === "opaque") {
            await addToCache(cache, url, response);
          }
        } catch {
          // Skip unreachable images — they'll cache naturally on first view
        }
      })
    );
  }
}
