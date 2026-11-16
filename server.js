// server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import webpush from 'web-push';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'YOUR_PUBLIC_VAPID_KEY';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || 'YOUR_PRIVATE_VAPID_KEY';

if (publicVapidKey !== 'YOUR_PUBLIC_VAPID_KEY') {
    webpush.setVapidDetails('mailto:admin@habla.com', publicVapidKey, privateVapidKey);
}

let activeSockets = {};
let userPushSubscriptions = {};

io.on('connection', (socket) => {
    let currentUsername = null;

    socket.on('join', ({ username, lang }) => {
        if (!username) return;
        currentUsername = username.trim();
        activeSockets[socket.id] = currentUsername;
        broadcastUsers();
    });

    socket.on('subscribe-push', ({ username, subscription }) => {
        if (username) {
            userPushSubscriptions[username.toLowerCase().trim()] = subscription;
        }
    });

    socket.on('text-message', (data) => {
        const cleanRecipient = (data.recipient || '').toLowerCase().trim();
        const recipientSocketId = Object.keys(activeSockets).find(
            id => activeSockets[id] && activeSockets[id].toLowerCase().trim() === cleanRecipient
        );

        if (recipientSocketId) {
            io.to(recipientSocketId).emit('incoming-message', data);
        } else {
            if (userPushSubscriptions[cleanRecipient]) {
                const payload = JSON.stringify({
                    title: `Habla Mobile (${data.sender})`,
                    body: data.text || 'Нове текстове повідомлення'
                });
                webpush.sendNotification(userPushSubscriptions[cleanRecipient], payload).catch(() => {});
            }
        }
    });

    socket.on('voice-message', (data) => {
        const cleanRecipient = (data.recipient || '').toLowerCase().trim();
        const recipientSocketId = Object.keys(activeSockets).find(
            id => activeSockets[id] && activeSockets[id].toLowerCase().trim() === cleanRecipient
        );

        if (recipientSocketId) {
            io.to(recipientSocketId).emit('incoming-message', {
                sender: data.sender,
                text: "🎙️ [Голосове повідомлення]",
                originalText: "Voice message"
            });
        } else if (userPushSubscriptions[cleanRecipient]) {
            const payload = JSON.stringify({
                title: `Habla Mobile (${data.sender})`,
                body: "🎙️ Отримано нове голосове повідомлення"
            });
            webpush.sendNotification(userPushSubscriptions[cleanRecipient], payload).catch(() => {});
        }
    });

    socket.on('disconnect', () => {
        delete activeSockets[socket.id];
        broadcastUsers();
    });
});

function broadcastUsers() {
    const usersList = Object.values(activeSockets).map(name => ({ name, isOnline: true }));
    io.emit('update-users', usersList);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {});
