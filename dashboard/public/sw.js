// Service worker AlphaPay (PWA) : notifications Vérif (§M5).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'AlphaPay', body: event.data && event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'AlphaPay', {
      body: data.body || '',
      tag: data.tag,
      renotify: true,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: data.url || '/caisse' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/caisse';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).pathname === url);
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
