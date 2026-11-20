/* Dynasty HQ service worker: shows push notifications and opens the app when one is tapped. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'Dynasty HQ', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Dynasty HQ', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag || undefined,
      data: { nav: d.nav || null },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const nav = event.notification.data && event.notification.data.nav;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.focus();
          if (nav) c.postMessage({ type: 'dhq-nav', nav });
          return;
        }
      }
      return self.clients.openWindow('/');
    })
  );
});
