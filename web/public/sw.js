/* Service worker de la web del estudio: notificaciones push.
   Sin caché offline por ahora — solo push, para no interferir con la web. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  // Sin título: el dominio de la web (el SW no conoce el nombre del estudio)
  const title = data.title || new URL(self.registration.scope).hostname;
  const options = {
    body: data.body || '',
    icon: '/api/v1/site-config/icon/192.png',
    // Badge (barra de estado de Android): 96 px. Lo ideal sería una versión
    // monocroma (silueta blanca sobre transparente) del icono; el backend aún
    // no la genera, así que Android usará la silueta del icono a color.
    badge: '/api/v1/site-config/icon/96.png',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Si ya hay una pestaña de la web abierta, la enfocamos y navegamos
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
