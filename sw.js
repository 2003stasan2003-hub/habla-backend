// Повний файл sw.js для Habla Mobile з підтримкою пуш-сповіщень і логуванням

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Слухач вхідних пуш-сигналів від сервера
self.addEventListener('push', function(event) {
    console.log('[Service Worker] Пуш-сигнал успішно отримано!', event);
    
    let notificationTitle = 'Habla Mobile';
    let notificationOptions = {
        body: 'Нове повідомлення у чаті',
        icon: '/icon.png',
        badge: '/badge.png',
        vibrate: [200, 100, 200]
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
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                    }
                }
                return client.focus();
            }
            return clients.openWindow('/');
        })
    );
});
