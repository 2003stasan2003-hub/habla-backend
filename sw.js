self.addEventListener('push', function (event) {
    if (!event.data) return;

    const data = event.data.json();
    const title = data.title || 'Habla Mobile';
    const count = data.unreadCount || 1;

    const options = {
        body: data.body || 'Нове повідомлення',
        icon: '/icon.png',
        badge: '/icon.png',
        tag: data.tag || 'habla-msg',
        renotify: true,
        sound: data.sound || '/mixkit-retro-game-notification-212.wav',
        data: { url: data.url || '/', sender: title }
    };

    const promises = [self.registration.showNotification(title, options)];
    if (self.navigator && 'setAppBadge' in self.navigator) {
        promises.push(self.navigator.setAppBadge(count).catch(() => {}));
    }

    event.waitUntil(Promise.all(promises));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if ('focus' in client) {
                    client.postMessage({ type: 'SYNC_OFFLINE' });
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
