self.addEventListener('message', function (event) {
    const msg = event.data;
    if (!msg) return;

    if (msg.type === 'SET_BADGE') {
        const count = Math.max(0, Number(msg.count) || 0);
        if ('setAppBadge' in self.registration) {
            event.waitUntil(
                count > 0
                    ? self.registration.setAppBadge(count).catch(() => {})
                    : (self.registration.clearAppBadge ? self.registration.clearAppBadge().catch(() => {}) : Promise.resolve())
            );
        }
    }
});

self.addEventListener('push', function (event) {
    if (!event.data) return;

    const data = event.data.json();
    const title = data.title || 'Habla Mobile';
    const options = {
        body: data.body || 'Нове повідомлення',
        icon: '/icon.png',
        badge: '/icon.png',
        sound: data.sound || '/mixkit-retro-game-notification-212.wav',
        data: { url: data.url || '/' }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    if ('clearAppBadge' in self.registration) {
        event.waitUntil(self.registration.clearAppBadge().catch(() => {}));
    }
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if ('focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
