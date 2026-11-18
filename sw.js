self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event) {
    let notificationTitle = 'Habla Mobile';
    let notificationOptions = {
        body: 'Нове повідомлення',
        icon: '/icon.png',
        badge: '/badge.png',
        vibrate: [200, 100, 200],
        sound: 'https://github.com/stasan-dev/habla-assets/raw/main/mixkit-retro-game-notification-212.wav'
    };

    if (event.data) {
        try {
            const jsonDat = event.data.json();
            if (jsonDat.title) notificationTitle = jsonDat.title;
            if (jsonDat.body) notificationOptions.body = jsonDat.body;
        } catch (e) {
            notificationOptions.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(notificationTitle, notificationOptions)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            if (clientList.length > 0) {
                return clientList[0].focus();
            }
            return clients.openWindow('/');
        })
    );
});
