import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import webpush from 'web-push';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // Обмеження 100 МБ для передачі великих голосових повідомлень
});

// Налаштування безпечних VAPID ключів для відправки фонових пуш-сповіщень
const publicVapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYBE5FzhEI';
const privateVapidKey = 'CU-W7x8G0H_zW0L9K1Xq9V3b2N1M4k8J7h6f5d4s3a';

try {
    webpush.setVapidDetails(
        'mailto:admin@habla.com',
        publicVapidKey,
        privateVapidKey
    );
} catch (e) {
    console.log("Помилка ініціалізації VAPID ключів:", e.message);
}

// Підключення статичних файлів із папки public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Виправлення помилки «Не вдається отримати /» — чіткий маршрут для головної сторінки
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Зберігаємо активних користувачів, їхні підписки та налаштування
const onlineUsers = new Map(); // Ім'я -> socket.id
const pushSubscriptions = {}; // Ім'я -> об'єкт пуш-підписки пристрою
const userLanguages = {}; // Ім'я -> мова
const userCustomizations = {}; // Ім'я -> аватар/колір

io.on('connection', (socket) => {
    let currentUserName = null;

    // Підключення користувача до системи
    socket.on('join', (data) => {
        const name = typeof data === 'string' ? data : data.username;
        const lang = typeof data === 'object' ? data.lang : 'Ukrainian';
        if (!name) return;

        currentUserName = name.trim();
        onlineUsers.set(currentUserName, socket.id);
        if (lang) userLanguages[currentUserName] = lang;

        // Оновлюємо список активних користувачів для всіх
        io.emit('update-users', Array.from(onlineUsers.keys()).map(n => ({
            name: n,
            isOnline: true
        })));
        
        socket.emit('sync-customizations', userCustomizations);
    });

    // Реєстрація підписки на фонові пуш-сповіщення від браузера/додатка
    socket.on('subscribe-push', ({ username, subscription }) => {
        if (username && subscription) {
            pushSubscriptions[username.trim()] = subscription;
            console.log(`[Push] Успішно збережено підписку для користувача: ${username}`);
        }
    });

    // Обробка вхідних текстових повідомлень
    socket.on('text-message', async (data) => {
        const { sender, recipient, text } = data;
        if (!sender || !recipient || !text) return;

        const recipientSocketId = onlineUsers.get(recipient);
        
        const payloadData = {
            sender: sender,
            text: text,
            originalText: text
        };

        // 1. Якщо отримувач онлайн у додатку — надсилаємо через сокет
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('incoming-message', payloadData);
        }

        // 2. ЗАВЖДИ надсилаємо Web Push (спрацює зі звуком, навіть якщо додаток у фоні чи телефон заблоковано)
        if (pushSubscriptions[recipient]) {
            try {
                const pushPayload = JSON.stringify({
                    title: `Habla (${sender})`,
                    body: text
                });
                await webpush.sendNotification(pushSubscriptions[recipient], pushPayload);
                console.log(`[Push] Надіслано сповіщення для користувача: ${recipient}`);
            } catch (err) {
                console.error(`[Push Error] Помилка відправки пуша для ${recipient}:`, err);
            }
        }
    });

    // Обробка вхідних голосових повідомлень
    socket.on('voice-message', async (data) => {
        const { sender, recipient, audio } = data;
        if (!sender || !recipient || !audio) return;

        const recipientSocketId = onlineUsers.get(recipient);
        const payloadData = {
            sender: sender,
            text: "🎤 Голосове повідомлення",
            originalText: "Голосове повідомлення"
        };

        if (recipientSocketId) {
            io.to(recipientSocketId).emit('incoming-message', payloadData);
        }

        if (pushSubscriptions[recipient]) {
            try {
                const pushPayload = JSON.stringify({
                    title: `Habla (${sender})`,
                    body: "🎤 Нове голосове повідомлення"
                });
                await webpush.sendNotification(pushSubscriptions[recipient], pushPayload);
            } catch (err) {
                console.error(`[Push Error] Помилка відправки голосового пуша для ${recipient}:`, err);
            }
        }
    });

    // Відключення користувача
    socket.on('disconnect', () => {
        if (currentUserName) {
            onlineUsers.delete(currentUserName);
            io.emit('update-users', Array.from(onlineUsers.keys()).map(n => ({
                name: n,
                isOnline: true
            })));
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Сервер успішно запущено на порті ${PORT}`);
});
