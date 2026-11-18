/* Firebase Cloud Messaging background alerts for the private birthday updates. */
importScripts('./private-firebase-config.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');
const config = self.PRIVATE_UPDATES_CONFIG?.firebase;
if (config?.apiKey && !config.apiKey.includes('PASTE_')) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(payload => {
    const type = payload.data?.kind;
    const title = 'Our little corner ♡';
    const body = type === 'read' ? 'Your update was read 💗' : 'Someone special posted a new update 💌';
    return self.registration.showNotification(title, {
      body, icon:'./favicon.svg', badge:'./favicon.svg',
      tag:`private-${payload.data?.eventId || type || 'update'}`,
      data:{ url:new URL('./?private=1',self.registration.scope).href }
    });
  });
}
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const link = event.notification.data?.url || new URL('./?private=1',self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(link);
      return existing.focus();
    }
    return self.clients.openWindow(link);
  })());
});
