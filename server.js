const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Зберігаємо активних користувачів за їхнім нікнеймом
const activeUsers = new Map(); // socket.id -> { socketId, nickname }

io.on('connection', (socket) => {
    console.log(`Користувач підключився: ${socket.id}`);

    // Реєстрація або оновлення нікнейму
    socket.on('register_user', (data) => {
        const nickname = data && data.nickname ? data.nickname.trim() : `User-${socket.id.slice(-4)}`;
        activeUsers.set(socket.id, { socketId: socket.id, nickname });
        broadcastContacts();
    });

    // Пошук іншого користувача за нікнеймом
    socket.on('find_user', (targetNickname, callback) => {
        let found = false;
        const cleanTarget = targetNickname.trim().toLowerCase();

        for (let [sId, user] of activeUsers.entries()) {
            if (user.nickname.toLowerCase() === cleanTarget && sId !== socket.id) {
                found = true;
                break;
            }
        }

        if (found) {
            callback({ success: true, nickname: targetNickname });
        } else {
            callback({ success: false, message: 'Користувача з таким ніком немає в мережі.' });
        }
    });

    socket.on('disconnect', () => {
        activeUsers.delete(socket.id);
        broadcastContacts();
    });
});

function broadcastContacts() {
    const contactsList = Array.from(activeUsers.values());
    io.emit('update_contacts', contactsList);
}

// API для перекладу
app.post('/api/translate', async (req, res) => {
    const { text, targetLang } = req.body;
    if (!text) return res.status(400).json({ error: 'Відсутній текст' });

    try {
        res.json({ translatedText: `[Переклад на ${targetLang}]: ${text}` });
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});
