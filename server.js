import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

let messageHistory = [];
let userDisconnectTimes = {};
let activeUsers = new Map();
let customizations = {};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function cleanExpiredMessages() {
    const now = Date.now();
    const initialLength = messageHistory.length;
    messageHistory = messageHistory.filter(msg => (now - msg.timestamp) < THREE_DAYS_MS);
    if (messageHistory.length !== initialLength) {
        console.log(`[Очищення] Видалено прострочених повідомлень: ${initialLength - messageHistory.length}`);
    }
}

setInterval(cleanExpiredMessages, 60 * 60 * 1000);

io.on('connection', (socket) => {
    console.log('Користувач підключився ID:', socket.id);

    socket.on('join', (userData) => {
        if (!userData || !userData.username) return;
        
        const username = userData.username.trim();
        socket.username = username;
        socket.join(username);

        activeUsers.set(socket.id, {
            name: username,
            isOnline: true,
            lang: userData.lang || 'Spanish'
        });

        cleanExpiredMessages();

        const lastActiveTime = userDisconnectTimes[username] || (Date.now() - THREE_DAYS_MS);

        const missedMessages = messageHistory.filter(msg => {
            const isForMe = (msg.recipientName === username) || (!msg.recipientName && msg.user !== username);
            const isNewerThanDisconnect = msg.timestamp > lastActiveTime;
            return isForMe && isNewerThanDisconnect;
        });

        if (missedMessages.length > 0) {
            console.log(`[Доставка] Відправляємо ${missedMessages.length} пропущених повідомлень для ${username}`);
            missedMessages.forEach(msg => {
                socket.emit('chatMessage', msg);
            });
        }

        socket.emit('sync-customizations', customizations);
        broadcastUsersUpdate();
        io.emit('onlineCount', activeUsers.size);
    });

    socket.on('chatMessage', (data) => {
        if (!data || !data.text || !data.user) return;

        const messageData = {
            id: Date.now() + Math.random().toString(36).substr(2, 5),
            text: data.text,
            user: data.user,
            recipientName: data.recipientName || null,
            isPrivate: !!data.recipientName,
            timestamp: Date.now()
        };

        cleanExpiredMessages();
        messageHistory.push(messageData);

        if (messageData.recipientName) {
            io.to(messageData.recipientName).emit('chatMessage', messageData);
            socket.emit('chatMessage', messageData);
        } else {
            io.emit('chatMessage', messageData);
        }
    });

    socket.on('update-customization', (data) => {
        if (data && data.targetName) {
            customizations[data.targetName] = {
                color: data.color,
                avatar: data.avatar
            };
            io.emit('sync-customizations', customizations);
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            userDisconnectTimes[socket.username] = Date.now();
        }
        activeUsers.delete(socket.id);
        broadcastUsersUpdate();
        io.emit('onlineCount', activeUsers.size);
    });
});

function broadcastUsersUpdate() {
    const usersList = Array.from(activeUsers.values());
    io.emit('update-users', { users: usersList, isAdmin: false });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер успішно запущено на порту ${PORT}`);
});
