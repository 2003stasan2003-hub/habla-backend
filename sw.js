self.addEventListener('push', function(event) {
    let data = { title: 'Habla Mobile', body: 'У вас нове повідомлення!', icon: '/icon.png', sound: '/mixkit-retro-game-notification-212.wav' };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icon.png',
        badge: '/badge.png',
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true,
        // Передаємо кастомний аудіофайл для відтворення у сповіщенні
        data: {
            url: data.url || '/',
            soundUrl: data.sound || '/mixkit-retro-game-notification-212.wav'
        }
    };

    // Спроба відтворити звук через аудіоелемент у воркері, якщо підтримується середовищем
    if (options.data.soundUrl) {
        try {
            const audio = new Audio(options.data.soundUrl);
            audio.play().catch(err => console.log('Audio autoplay restricted:', err));
        } catch (e) {}
    }

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let i = 0; i < windowClients.length; i++) {
                let client = windowClients[i];
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
