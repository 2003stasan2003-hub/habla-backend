self.addEventListener('push', function (event) {
    if (!event.data) return;

    let data = {};
    try {
        data = event.data.json();
    } catch (e) {
        data = { title: 'Habla Mobile', body: event.data.text() };
    }

    const title = data.title || 'Habla Mobile';
    const badgeCount = typeof data.badgeCount === 'number' ? data.badgeCount : 1;

    const options = {
        body: data.body || 'Нове повідомлення',
        icon: '/icon.png',
        badge: '/icon.png',
        tag: data.tag || 'habla-msg',
        renotify: true,
        sound: data.sound || '/mixkit-retro-game-notification-212.wav',
        data: {
            url: data.url || '/',
            badgeCount: badgeCount
        }
    };

    const badgePromise = (self.navigator && 'setAppBadge' in self.navigator)
        ? (badgeCount > 0
            ? self.navigator.setAppBadge(badgeCount).catch(() => {})
            : self.navigator.clearAppBadge().catch(() => {}))
        : Promise.resolve();

    event.waitUntil(
        Promise.all([
            self.registration.showNotification(title, options),
            badgePromise
        ])
    );
});

self.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'SET_BADGE') return;
    const count = Math.max(0, Number(event.data.count) || 0);
    if (self.navigator && 'setAppBadge' in self.navigator) {
        if (count > 0) {
            self.navigator.setAppBadge(count).catch(() => {});
        } else if ('clearAppBadge' in self.navigator) {
            self.navigator.clearAppBadge().catch(() => {});
        }
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if ('focus' in client) {
                    client.postMessage({ type: 'NOTIFICATION_CLICKED' });
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
