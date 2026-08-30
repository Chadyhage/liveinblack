// Service worker minimal — uniquement pour les notifications Web Push
// (lib/server/push.ts côté serveur). Pas de cache offline/PWA ici : hors
// scope de cette fonctionnalité, à ne pas confondre avec un futur chantier
// PWA complet.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'LIVEINBLACK', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'LIVEINBLACK'
  const options = {
    body: data.body || '',
    icon: '/branding/icon-192.png',
    badge: '/branding/liveinblack-monogram.png',
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
