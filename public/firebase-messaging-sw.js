// Firebase Cloud Messaging Service Worker
// Reçoit les notifications push en arrière-plan (site fermé)
importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyBee1WKyQmZSuzHVsn1DBoZ0p-fRkUvlI0',
  authDomain: 'liveinblack-15d30.firebaseapp.com',
  projectId: 'liveinblack-15d30',
  storageBucket: 'liveinblack-15d30.firebasestorage.app',
  messagingSenderId: '758710974251',
  appId: '1:758710974251:web:613dfca10c5f8e7aedb76e',
})

const messaging = firebase.messaging()

// Notification reçue quand le site est en arrière-plan ou fermé
messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification || {}
  self.registration.showNotification(title || 'L|VE IN BLACK', {
    body: body || 'Nouveau message',
    icon: icon || '/logo192.png',
    badge: '/logo192.png',
    tag: 'liveinblack-msg',
    data: payload.data || {},
    actions: [{ action: 'open', title: 'Voir' }],
  })
})

// Clic sur la notification → ouvrir l'app
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(self.location.origin + '/messagerie')
    })
  )
})
