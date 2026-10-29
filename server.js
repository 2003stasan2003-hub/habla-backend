const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Головний рядок: роздача статичних файлів (картинок, маніфесту, HTML) з кореня репозиторію
app.use(express.static(__dirname));

const PORT = process.env.PORT || 10000;

// Зберігаємо зареєстровані унікальні нікнейми
const registeredUsers = new Set();

io.on('connection', (socket) => {
    console.log('Користувач підключився:', socket.id);

    // Реєстрація унікального нікнейма
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

    // Приєднання до кімнати чату
    socket.on('join-room', (room) => {
        socket.join(room);
        console.log(`Користувач ${socket.username} увійшов у кімнату: ${room}`);
    });

    // Обробка та переклад повідомлень через Groq API
    socket.on('send-message', async (data) => {
        const { room, text, targetLanguage } = data;
        
        let translatedText = text;
        try {
            if (process.env.GROQ_API_KEY) {
                const Groq = require('groq-sdk');
                const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
                const completion = await groq.chat.completions.create({
                    model: "openai/gpt-oss-20b",
                    messages: [
                        { role: "system", content: `Translate the following text to ${targetLanguage}. Return ONLY the translated text without extra comments.` },
                        { role: "user", content: text }
                    ]
                });
                translatedText = completion.choices[0]?.message?.content || text;
            }
        } catch (err) {
            console.error("Помилка перекладу Groq:", err);
        }

        // Надсилаємо перекладене повідомлення всім у кімнаті
        io.to(room).emit('receive-message', {
            sender: socket.username || 'Гість',
            translatedText: translatedText
        });
    });

    // Відключення користувача
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
