async function applyBadge(count) {
    const safeCount = Math.max(0, Number(count) || 0);
    if (self.navigator && 'setAppBadge' in self.navigator) {
        try {
            if (safeCount > 0) {
                await self.navigator.setAppBadge(safeCount);
            } else if ('clearAppBadge' in self.navigator) {
                await self.navigator.clearAppBadge();
            }
        } catch (e) {}
    }
}

async function showUnreadNotification(title, body, badgeCount, soundUrl) {
    const safeCount = Math.max(1, Number(badgeCount) || 1);
    const displayTitle = safeCount > 1 ? `${title} (${safeCount})` : title;

    await applyBadge(safeCount);

    if (self.Notification && Notification.permission === 'granted') {
        await self.registration.showNotification(displayTitle, {
            body: body || 'Нове повідомлення',
            icon: '/icon.png',
            badge: '/icon.png',
            tag: 'habla-unread-badge',
            renotify: true,
            silent: false,
            sound: soundUrl || '/mixkit-retro-game-notification-212.wav',
            data: {
                url: '/',
                badgeCount: safeCount
            }
        });
    }
}

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

    event.waitUntil(
        showUnreadNotification(title, data.body, badgeCount, data.sound)
    );
});

self.addEventListener('message', function (event) {
    if (!event.data) return;

    if (event.data.type === 'SET_BADGE') {
        event.waitUntil(applyBadge(event.data.count));
        return;
    }

    if (event.data.type === 'SHOW_BADGE_NOTIFICATION') {
        event.waitUntil(
            showUnreadNotification(
                event.data.title || 'Habla Mobile',
                event.data.body || 'Нове повідомлення',
                event.data.count || 1,
                event.data.sound
            )
        );
        return;
    }

    if (event.data.type === 'CLEAR_NOTIFICATIONS') {
        event.waitUntil(
            Promise.all([
                applyBadge(0),
                self.registration.getNotifications({ tag: 'habla-unread-badge' }).then((list) => {
                    list.forEach((n) => n.close());
                }).catch(() => {})
            ])
        );
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        Promise.all([
            applyBadge(0),
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
        ])
    );
});
