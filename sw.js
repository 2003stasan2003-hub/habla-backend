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
