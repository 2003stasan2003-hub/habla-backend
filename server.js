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
    maxHttpBufferSize: 1e8 // 100 MB для голосових
});

// Коректні VAPID ключі з правильною довжиною (65 байт у декодованому вигляді)
const publicVapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYBE5FzhEI';
const privateVapidKey = 'CU-W7x8G0H_zW0L9K1Xq9V3b2N1M4k8J7h6f5d4s3a';

try {
    webpush.setVapidDetails(
        'mailto:admin@habla.com',
        publicVapidKey,
        privateVapidKey
    );
} catch (e) {
    console.log("Помилка ініціалізації VAPID:", e.message);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Зберігаємо активних користувачів та їхні пуш-підписки
const onlineUsers = new Map(); // name -> socket.id
const pushSubscriptions = {}; // name -> push subscription object
const userLanguages = {}; // name -> language
const userCustomizations = {}; // name -> { color, avatar }

io.on('connection', (socket) => {
    let currentUserName = null;

    socket.on('join', (data) => {
        const name = typeof data === 'string' ? data : data.username;
        const lang = typeof data === 'object' ? data.lang : 'Ukrainian';
        if (!name) return;

        currentUserName = name.trim();
        onlineUsers.set(currentUserName, socket.id);
        if (lang) userLanguages[currentUserName] = lang;

        io.emit('update-users', Array.from(onlineUsers.keys()).map(n => ({
            name: n,
            isOnline: true
        })));
        
        socket.emit('sync-customizations', userCustomizations);
    });

    // Реєстрація пуш-підписки від клієнта
    socket.on('subscribe-push', ({ username, subscription }) => {
        if (username && subscription) {
            pushSubscriptions[username.trim()] = subscription;
            console.log(`[Push] Підписка успішно збережена для користувача: ${username}`);
        }
    });

    socket.on('text-message', async (data) => {
        const { sender, recipient, text } = data;
        if (!sender || !recipient || !text) return;

        const recipientSocketId = onlineUsers.get(recipient);
        
        const payloadData = {
            sender: sender,
            text: text,
            originalText: text
        };

        // Якщо отримувач в мережі через сокет
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('incoming-message', payloadData);
        }

        // Надсилаємо Web Push (працює у фоні зі звуком і на заблокованому екрані)
        if (pushSubscriptions[recipient]) {
            try {
                const pushPayload = JSON.stringify({
                    title: `Habla (${sender})`,
                    body: text
                });
                await webpush.sendNotification(pushSubscriptions[recipient], pushPayload);
                console.log(`[Push] Успішно надіслано пуш для ${recipient}`);
            } catch (err) {
                console.error(`[Push Error] Помилка відправки для ${recipient}:`, err);
            }
        }
    });

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
                console.error(`[Push Error] Помилка відправки голосового для ${recipient}:`, err);
            }
        }
    });

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
    console.log(`Server is running on port ${PORT}`);
});
