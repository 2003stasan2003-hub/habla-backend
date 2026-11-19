self.addEventListener('install', function (event) {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
});

async function updateSwBadge(count) {
    try {
        if (self.navigator && 'setAppBadge' in self.navigator) {
            if (count > 0) {
                await self.navigator.setAppBadge(count);
            } else if ('clearAppBadge' in self.navigator) {
                await self.navigator.clearAppBadge();
            }
        }
    } catch (e) {}
}

self.addEventListener('message', function (event) {
    const data = event.data || {};
    if (data.type === 'SET_BADGE') {
        const count = Number(data.count || 0);
        event.waitUntil(updateSwBadge(count));
    } else if (data.type === 'LOCAL_NOTIFY') {
        const title = data.title || 'Habla Mobile';
        const body = data.body || 'Нове повідомлення';
        const count = Number(data.count || 1);

        event.waitUntil(
            Promise.all([
                updateSwBadge(count),
                self.registration.showNotification(title, {
                    body: body,
                    icon: '/icon.png',
                    badge: '/icon.png',
                    tag: 'habla-unread-msg',
                    renotify: true,
                    vibrate: [200, 100, 200],
                    data: { url: '/' }
                })
            ])
        );
    }
});

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

    event.waitUntil(
        Promise.all([
            updateSwBadge(1),
            self.registration.showNotification(title, {
                body: data.body || 'Нове повідомлення',
                icon: '/icon.png',
                badge: '/icon.png',
                tag: data.tag || 'habla-unread-msg',
                renotify: true,
                vibrate: [200, 100, 200],
                data: { url: targetUrl }
            })
        ])
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
        Promise.all([
            updateSwBadge(0),
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
        ])
    );
});
