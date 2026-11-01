// Service worker aplikace Vixen: jen upozornění v telefonu (Web Push), nic neukládá do mezipaměti.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulek: 'Vixen', text: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulek || 'Vixen', {
    body: d.text || '', icon: 'ikony/ikona-192.png', badge: 'ikony/ikona-192.png', tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || './' },
  }));
});
// klepnutí na upozornění: otevřít aplikaci (už otevřené okno přepnout na odkaz z upozornění)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((okna) => {
    for (const o of okna) if (o.url.startsWith(self.registration.scope) && 'focus' in o) { o.navigate(url); return o.focus(); }
    return self.clients.openWindow(url);
  }));
});
