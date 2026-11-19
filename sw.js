// QR Mola Takip — arka plan çalışanı: uygulama kapalıyken gelen bildirimleri gösterir.
// Dosya önbelleğe bir şey almaz; uygulama her zaman sunucudaki en yeni sürümle açılır.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const urgent = d.kind === 'soon' || d.kind === 'overdue' || d.kind === 'warning';
  const jobs = [self.registration.showNotification(d.title || 'QR Mola', {
    body: d.body || '',
    icon: 'icon-192.png',
    tag: d.tag,
    renotify: true,
    requireInteraction: urgent,
    vibrate: urgent ? [300, 120, 300, 120, 600] : [200, 100, 200],
    data: { url: d.url || './' }
  })];
  if (typeof d.badge === 'number' && self.navigator.setAppBadge) {
    jobs.push((d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()).catch(() => {}));
  }
  // Uygulama açıksa hemen yenilensin (ses + ekrandaki uyarı)
  jobs.push(self.clients.matchAll({ type: 'window' }).then((list) => list.forEach((c) => c.postMessage({ type: 'push', kind: d.kind }))));
  e.waitUntil(Promise.all(jobs));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
