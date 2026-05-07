// Service worker minimal — assure le critère "installable" PWA sans cache offline.
// (PWA niveau 1 — Module 25 : minimal installable.)
// Pour ajouter le mode offline lecture, voir Module 28+ (cache stratégique).

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Stratégie network-first transparente : on laisse passer toutes les requêtes
  // sans cache pour ne pas servir d'anciennes données de Server Components.
  // Le SW existe juste pour rendre la PWA installable.
  event.respondWith(fetch(event.request).catch(() => new Response('Offline', { status: 503 })))
})
