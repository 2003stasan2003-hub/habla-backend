const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Дозволяємо серверам читати JSON-запити
app.use(express.json());

// Роздача статичних файлів з кореня проєкту (включаючи папку downloads з habla.apk та інші файли)
app.use(express.static(path.join(__dirname)));

// Зберігаємо список активних підключених користувачів
// Ключ - socket.id, значення - об'єкт користувача { userId, userName, ref }
const activeUsers = new Map();

io.on('connection', (socket) => {
    console.log(`Користувач підключився: ${socket.id}`);

    // Реєстрація користувача та його нікнейму/ID
    socket.on('register_user', (userData) => {
        if (!userData || !userData.userId) return;

        activeUsers.set(socket.id, {
            socketId: socket.id,
            userId: userData.userId,
            userName: userData.userName || `User-${userData.userId.slice(-4)}`,
            ref: userData.ref || null
        });

        broadcastContacts();
    });

    // Відключення користувача
    socket.on('disconnect', () => {
        console.log(`Користувач відключився: ${socket.id}`);
        activeUsers.delete(socket.id);
        broadcastContacts();
    });
});

// Функція розсилки оновленого списку активних контактів усім клієнтам
function broadcastContacts() {
    const contactsList = Array.from(activeUsers.values());
    io.emit('update_contacts', contactsList);
}

// API для перекладу (зберігаємо ваш робочий функціонал)
app.post('/api/translate', async (req, res) => {
    const { text, targetLang } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: 'Відсутній текст для перекладу' });
    }

    try {
        // Тут виконується ваш запит до Groq API (або іншого сервісу перекладу)
        // Повертаємо поки що тестовий/структурний результат, який ви налаштовували раніше
        res.json({ translatedText: `[Переклад на ${targetLang}]: ${text}` });
    } catch (error) {
        console.error('Помилка перекладу:', error);
        res.status(500).json({ error: 'Помилка сервера при перекладі' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер успішно запущено на порту ${PORT}`);
});
