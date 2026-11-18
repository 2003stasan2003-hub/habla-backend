// Повний файл sw.js для Habla Mobile з підтримкою пуш-сповіщень та звуку

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Перехоплення фонових пуш-сигналів та відтворення аудіо
self.addEventListener('push', function(event) {
    console.log('[Service Worker] Пуш-сигнал успішно отримано!', event);
    
    let notificationTitle = 'Habla Mobile';
    let notificationOptions = {
        body: 'Нове повідомлення у чаті',
        icon: '/icon.png',
        badge: '/badge.png',
        vibrate: [200, 100, 200],
        // Підключаємо твій аудіофайл сповіщення
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

// Клік по сповіщенню відкриває додаток без зависань
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
