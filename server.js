const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Обов'язково для читання JSON у POST-запитах від мобільного додатка
app.use(express.json());

// Роздача статичних файлів з кореня
app.use(express.static(__dirname));

const PORT = process.env.PORT || 10000;

// API маршрут для перекладу на льоту
app.post('/api/translate', async (req, res) => {
    const { text, targetLanguage } = req.body;
    if (!text) {
        return res.status(400).json({ error: "Текст не вказано" });
    }

    try {
        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({ error: "GROQ_API_KEY не налаштовано на сервері" });
        }

        const Groq = require('groq-sdk');
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        
        const completion = await groq.chat.completions.create({
            model: "qwen/qwen3.8-27b", // Модель із вашого реального списку доступних
            messages: [
                { role: "system", content: `Translate the following text to ${targetLanguage}. Return ONLY the translated text without extra comments or quotation marks.` },
                { role: "user", content: text }
            ]
        });

        const translatedText = completion.choices[0]?.message?.content?.trim() || text;
        res.json({ translatedText });

    } catch (err) {
        console.error("Помилка перекладу Groq:", err);
        res.status(500).json({ error: "Помилка перекладу на сервері" });
    }
});

// Зберігаємо зареєстровані унікальні нікнейми
const registeredUsers = new Set();

io.on('connection', (socket) => {
    console.log('Користувач підключився:', socket.id);

    socket.on('register-username', (username, callback) => {
        if (!username || typeof username !== 'string') {
            return callback({ success: false, message: "Некоректне ім'я!" });
        }
        const trimmed = username.trim();
        if (registeredUsers.has(trimmed)) {
            return callback({ success: false, message: "Це ім'я вже зайняте!" });
        }
        registeredUsers.add(trimmed);
        socket.username = trimmed;
        callback({ success: true });
    });

    socket.on('join-room', (room) => {
        socket.join(room);
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            registeredUsers.delete(socket.username);
        }
        console.log('Користувач відключився:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Сервер Habla 2.0 успішно запущено на порту ${PORT}`);
});
