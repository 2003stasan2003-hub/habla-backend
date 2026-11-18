self.addEventListener('push', function(event) {
    if (!event.data) return;
    const data = event.data.json();
    
    const options = {
        body: data.body || 'Нове повідомлення',
        icon: '/icon.png',
        badge: '/badge.png',
        vibrate: [200, 100, 200],
        data: { url: '/' },
        // Шлях до твого звукового файлу в репозиторії
        sound: '/audio.mp3'
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Habla Mobile', options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
