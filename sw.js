self.addEventListener('push', function (event) {
    let data = {};

    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = {
                title: 'Habla Mobile',
                body: event.data.text() || 'Нове повідомлення'
            };
        }
    }

    const title = data.title || 'Habla Mobile';
    const targetUrl = (data.data && data.data.url) || data.url || '/';

    const options = {
        body: data.body || 'Нове повідомлення',
        icon: '/icon.png',
        badge: '/icon.png',
        tag: data.tag || 'habla-message',
        renotify: true,
        vibrate: [200, 100, 200],
        sound: data.sound || '/mixkit-retro-game-notification-212.wav',
        data: { url: targetUrl }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if ('focus' in client) {
                    if ('navigate' in client && targetUrl && !client.url.endsWith(targetUrl)) {
                        return client.navigate(targetUrl).then(() => client.focus());
                    }
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
