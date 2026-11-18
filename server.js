import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import webpush from 'web-push';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // Дозвіл на передачу великих файлів (голосових повідомлень)
});

// Налаштування VAPID ключів для фонових пуш-сповіщень
const publicVapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYBE5FzhEI';
const privateVapidKey = '1111111111111111111111111111111111111111111';

try {
    webpush.setVapidDetails('mailto:admin@habla.com', publicVapidKey, privateVapidKey);
} catch (e) {
    console.log("VAPID init skip:", e.message);
}

// Підключаємо поточну кореневу папку для статичних файлів (index.html, sw.js, картинки тощо лежать тут же)
app.use(express.static(__dirname));
app.use(express.json());

// Головна сторінка
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send('Сервер працює! Але файл index.html ще не знайдено в корені проєкту.');
    }
});

// Зберігаємо активних користувачів та їхні підписки
const onlineUsers = new Map();
const pushSubscriptions = {};
const userCustomizations = {};

io.on('connection', (socket) => {
    let currentUserName = null;

    socket.on('join', (data) => {
        const name = typeof data === 'string' ? data : data.username;
        if (!name) return;

        currentUserName = name.trim();
        onlineUsers.set(currentUserName, socket.id);

        io.emit('update-users', Array.from(onlineUsers.keys()).map(n => ({
            name: n,
            isOnline: true
        })));
        
        socket.emit('sync-customizations', userCustomizations);
    });

    socket.on('subscribe-push', ({ username, subscription }) => {
        if (username && subscription) {
            pushSubscriptions[username.trim()] = subscription;
            console.log(`[Push] Підписка збережена для: ${username}`);
        }
    });

    socket.on('text-message', async (data) => {
        const { sender, recipient, text } = data;
        if (!sender || !recipient || !text) return;

        const recipientSocketId = onlineUsers.get(recipient);
        const payloadData = { sender, text, originalText: text };

        if (recipientSocketId) {
            io.to(recipientSocketId).emit('incoming-message', payloadData);
        }

        if (pushSubscriptions[recipient]) {
            try {
                const pushPayload = JSON.stringify({ title: `Habla (${sender})`, body: text });
                await webpush.sendNotification(pushSubscriptions[recipient], pushPayload);
            } catch (err) {
                console.error(`[Push Error]:`, err);
            }
        }
    });

    socket.on('voice-message', async (data) => {
        const { sender, recipient, audio } = data;
        if (!sender || !recipient || !audio) return;

        const recipientSocketId = onlineUsers.get(recipient);
        const payloadData = { sender, text: "🎤 Голосове повідомлення", originalText: "Голосове повідомлення" };

        if (recipientSocketId) {
            io.to(recipientSocketId).emit('incoming-message', payloadData);
        }

        if (pushSubscriptions[recipient]) {
            try {
                const pushPayload = JSON.stringify({ title: `Habla (${sender})`, body: "🎤 Нове голосове повідомлення" });
                await webpush.sendNotification(pushSubscriptions[recipient], pushPayload);
            } catch (err) {
                console.error(`[Push Error]:`, err);
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
    console.log(`Сервер успішно запущено на порті ${PORT}`);
});
