const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// Роздаємо статичні файли фронтенду
app.use(express.static(path.join(__dirname)));

// Перевірка працездатності сервера
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Універсальна функція перекладу через Groq API (модель openai/gpt-oss-20b)
async function translateText(text, targetLanguage) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error("GROQ_API_KEY не налаштовано на сервері");
    }

    const targetLang = targetLanguage || 'English';
    const prompt = `Translate the following text into ${targetLang}. Return ONLY the translated text without any formatting, quotes, or markdown:\n\n${text}`;
    const url = `https://api.groq.com/openai/v1/chat/completions`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "openai/gpt-oss-20b",
            messages: [{ role: "user", content: prompt }]
        })
    });

    const data = await response.json();

    if (response.ok && data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content.trim();
    } else {
        throw new Error(data.error?.message || "Помилка перекладу від Groq");
    }
}

// HTTP ендпоінт для сумісності
app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        if (!text) return res.status(400).json({ error: "Текст відсутній" });

        const translatedText = await translateText(text, targetLanguage);
        res.json({ detectedLanguage: "auto", translatedText });
    } catch (error) {
        console.error("Помилка сервера:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Зберігаємо список активних нікнеймів у пам'яті сервера (захист від однакових імен)
const activeUsers = new Set();

io.on('connection', (socket) => {
    console.log(`Користувач підключився: ${socket.id}`);

    // Перевірка та реєстрація унікального нікнейму
    socket.on('register-username', (username, callback) => {
        if (!username || typeof username !== 'string' || username.trim() === '') {
            return callback({ success: false, message: "Ім'я не може бути порожнім!" });
        }

        const cleanName = username.trim();
        
        if (activeUsers.has(cleanName)) {
            callback({ 
                success: false, 
                message: `Ім'я "${cleanName}" вже зайняте! Спробуйте інше, наприклад, "${cleanName}_01"` 
            });
        } else {
            activeUsers.add(cleanName);
            socket.username = cleanName;
            console.log(`Користувач успішно зареєстрований під ніком: ${cleanName}`);
            callback({ success: true });
        }
    });

    // Приєднання до конкретної кімнати чату
    socket.on('join-room', (room) => {
        socket.join(room);
        console.log(`Користувач [${socket.username || socket.id}] зайшов у кімнату: ${room}`);
    });

    // Отримання повідомлення, переклад і розсилка в кімнату
    socket.on('send-message', async (data) => {
        try {
            const { room, text, targetLanguage } = data;
            if (!text || !room) return;

            const translatedText = await translateText(text, targetLanguage);

            socket.to(room).emit('receive-message', {
                sender: socket.username || "Співрозмовник",
                originalText: text,
                translatedText: translatedText,
                senderId: socket.id
            });
        } catch (error) {
            console.error("Помилка веб-сокета при перекладі:", error.message);
            socket.emit('translation-error', { error: error.message });
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            activeUsers.delete(socket.username);
            console.log(`Користувач ${socket.username} відключився.`);
        } else {
            console.log(`Користувач відключився: ${socket.id}`);
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Сервер Habla 2.0 успішно запущено на порту ${PORT}`);
});
