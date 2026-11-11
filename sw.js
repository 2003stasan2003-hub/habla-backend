const CACHE_NAME = 'habla-mobile-v3.2';
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json'
];

// Встановлення сервіс-воркера та кешування базових файлів
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Активація та негайне очищення всіх старих кешів
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Перехоплення мережевих запитів з пріоритетом мережі (Network First, fallback to cache)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Якщо є інтернет, оновлюємо кеш "на льоту"
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // Якщо інтернету немає, беремо з кешу
                return caches.match(event.request);
            })
    );
});
