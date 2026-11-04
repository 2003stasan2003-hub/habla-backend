import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// Дозвіл для Android та роздача файлів інтерфейсу
app.use('/.well-known', express.static('.well-known'));
app.use(express.static(__dirname));

// --- 1. РОБОЧИЙ МАРШРУТ ПЕРЕКЛАДУ (ЗБЕРЕЖЕНО НА 100%) ---
app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        if (!text) return res.status(400).json({ error: 'Текст відсутній' });

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'API ключ Groq не знайдено на сервері' });
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "qwen/qwen3.8-27b", // Актуальна робоча модель з техпаспорта
                messages: [
                    {
                        role: "system",
                        content: `You are a professional translator. Translate the given text accurately and naturally into ${targetLanguage}. Return ONLY the translated text without any extra notes or formatting.`
                    },
                    { role: "user", content: text }
                ],
                max_tokens: 250 // Захист від перевищення лімітів вихідних токенів
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Помилка Groq API:', data);
            return res.status(500).json({ error: 'Помилка мовної моделі Groq' });
        }

        const translatedText = data.choices && data.choices[0] && data.choices[0].message 
            ? data.choices[0].message.content.trim() 
            : text;

        res.json({ translatedText });

    } catch (error) {
        console.error('Помилка сервера:', error);
        res.status(500).json({ error: 'Помилка сервера при перекладі.' });
    }
});

// --- 2. НОВА ЦЕГЛИНКА: SOCKET.IO ДЛЯ ЗВ'ЯЗКУ МІЖ КОРИСТУВАЧАМИ ---
const activeUsers = {};

io.on('connection', (socket) => {
    console.log(`Користувач підключився: ${socket.id}`);

    // Коли користувач вводить нік і тисне OK
    socket.on('register', (nickname) => {
        if (!nickname) return;
        activeUsers[socket.id] = nickname;
        console.log(`Зареєстровано нік: ${nickname}`);
        // Оновлюємо список онлайн-користувачів для всіх пристроїв
        io.emit('update-users', Object.values(activeUsers));
    });

    // Коли користувач закриває додаток або втрачає зв'язок
    socket.on('disconnect', () => {
        console.log(`Користувач відключився: ${socket.id}`);
        delete activeUsers[socket.id];
        io.emit('update-users', Object.values(activeUsers));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
