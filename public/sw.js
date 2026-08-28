// Service worker — PWA installable + Push notifications + cache offline.
//
// Stratégies :
//  - Assets statiques (_next/static/*, /icons/*, fonts) : cache-first (rapide, immuables)
//  - Pages HTML : network-first avec fallback offline.html (toujours frais si online)
//  - API/POST/Supabase : pas de cache, network only (fail si offline → géré côté UI)

const CACHE_VERSION = 'v186-2026-08-28-scanner-allergenes'
const STATIC_CACHE  = `static-${CACHE_VERSION}`
const PAGES_CACHE   = `pages-${CACHE_VERSION}`
const OFFLINE_URL   = '/offline.html'

// Pages à pré-cacher pour qu'elles soient dispo offline dès la 1ère install
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/icon-192.png',
  '/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      // Pre-cache best-effort : ne bloque pas l'install si une URL échoue
      await Promise.allSettled(PRECACHE_URLS.map(u => cache.add(u)))
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Nettoie les anciens caches d'autres versions
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== PAGES_CACHE)
          .map(k => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

// ─── Stratégies de fetch ──────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request

  // Seules les requêtes GET sont éligibles au cache
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Skip cross-origin (Supabase, fonts CDN, analytics…) → laisse passer en network
  if (url.origin !== self.location.origin) return

  // 1. Assets statiques Next.js : cache-first (immuables, hash dans l'URL)
  if (url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/icon-')         ||
      url.pathname.endsWith('.woff2')           ||
      url.pathname.endsWith('.woff')            ||
      url.pathname.endsWith('.ttf')             ||
      url.pathname.endsWith('.svg')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE))
    return
  }

  // 2. Pages HTML (navigations) : network-first avec fallback offline
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstHtml(req))
    return
  }

  // 3. Reste (API, JSON, etc.) : pas de cache, laisse le browser gérer
})

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req)
  if (hit) return hit
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch {
    return new Response('Offline asset', { status: 503 })
  }
}

async function networkFirstHtml(req) {
  try {
    const res = await fetch(req)
    // Cache la dernière version réussie de chaque page navigée
    if (res.ok) {
      const cache = await caches.open(PAGES_CACHE)
      cache.put(req, res.clone())
    }
    return res
  } catch {
    // Hors ligne : sert la dernière version cachée si dispo, sinon la page offline
    const cache = await caches.open(PAGES_CACHE)
    const hit = await cache.match(req)
    if (hit) return hit
    const offline = await caches.match(OFFLINE_URL)
    return offline ?? new Response('Hors-ligne', { status: 503 })
  }
}

// ─── Push notifications ──────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try { payload = event.data.json() }
  catch { payload = { title: 'Notification', body: event.data.text() } }

  const title = payload.title || '🍽 CASATASIA'
  const options = {
    body:    payload.body || '',
    icon:    payload.icon  || '/icon-192.png',
    badge:   payload.badge || '/icon-192.png',
    tag:     payload.tag,
    data:    { url: payload.url || '/', ...(payload.data ?? {}) },
    vibrate: payload.vibrate || [80, 40, 80],
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Tap sur la notif → ouvre l'URL ou focus une fenêtre déjà ouverte
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of all) {
      if ('focus' in client) {
        try { await client.focus() } catch { /* ignore */ }
        if ('navigate' in client && client.url !== url) {
          try { await client.navigate(url) } catch { /* ignore */ }
        }
        return
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url)
  })())
})
