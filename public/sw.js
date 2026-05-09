// Service worker — PWA installable + Push notifications.
//
// Push : reçoit les events depuis le serveur (Web Push), affiche une notif
// native. Tap sur la notif → ouvre l'URL associée dans l'app.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Stratégie network-first transparente — le SW existe surtout pour rendre
  // la PWA installable et pour gérer les push notifications.
  event.respondWith(fetch(event.request).catch(() => new Response('Offline', { status: 503 })))
})

// ─── Push notifications ──────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try { payload = event.data.json() }
  catch { payload = { title: 'Notification', body: event.data.text() } }

  const title = payload.title || '🍽 Resto'
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
    // Si une fenêtre de l'app est déjà ouverte, on la focus + navigate
    for (const client of all) {
      if ('focus' in client) {
        try { await client.focus() } catch { /* ignore */ }
        if ('navigate' in client && client.url !== url) {
          try { await client.navigate(url) } catch { /* ignore */ }
        }
        return
      }
    }
    // Sinon ouvre une nouvelle fenêtre
    if (self.clients.openWindow) await self.clients.openWindow(url)
  })())
})
