const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware для обробки JSON та роздачі статичних файлів з поточної папки
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Сховище активних користувачів та реферальних зв'язків у пам'яті сервера
const activeUsers = new Map(); // userId -> { socketId, userName, referredBy }
const referrals = new Map();   // referrerId -> Set of invited userIds

// Ендпоінт для перекладу текстів через Groq API
app.post('/api/translate', async (req, res) => {
    const { text, sourceLang, targetLang } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    try {
        const GROQ_API_KEY = process.env.GROQ_API_KEY;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'qwen/qwen3.8-27b', // Використовуємо вашу модель із конфігурації проєкту
                messages: [
                    {
                        role: 'system',
                        content: `You are a professional translator. Translate the following text accurately from ${sourceLang} to ${targetLang}. Return ONLY the translated text without any extra notes, formatting or explanations.`
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const errData = await response.text();
            console.error('Groq API error:', errData);
            return res.status(500).json({ error: 'Translation API error' });
        }

        const data = await response.json();
        const translatedText = data.choices && data.choices[0] && data.choices[0].message 
            ? data.choices[0].message.content.trim() 
            : 'Переклад відсутній';

        res.json({ translatedText });
    } catch (error) {
        console.error('Translation server error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Налаштування WebSocket з'єднань через Socket.io
io.on('connection', (socket) => {
    console.log('Нове з'єднано клієнта:', socket.id);

    // Реєстрація користувача та обробка реферального посилання
    socket.on('register_user', (data) => {
        const { userId, userName, ref } = data;
        if (!userId) return;

        activeUsers.set(userId, {
            socketId: socket.id,
            userName: userName || 'Tester',
            referredBy: ref || null
        });

        if (ref) {
            if (!referrals.has(ref)) {
                referrals.set(ref, new Set());
            }
            referrals.get(ref).add(userId);
            console.log(`Користувач ${userId} (${userName}) зареєструвався за рефералом від: ${ref}`);
        }

        console.log(`Зареєстровано активного користувача: ${userId} [${userName}]`);
        
        // Оновлюємо список активних контактів для всіх підключених
        io.emit('update_contacts', Array.from(activeUsers.entries()).map(([id, info]) => ({
            userId: id,
            userName: info.userName
        })));
    });

    // Відключення користувача
    socket.on('disconnect', () => {
        console.log('Клієнт відключився:', socket.id);
        for (let [userId, info] of activeUsers.entries()) {
            if (info.socketId === socket.id) {
                activeUsers.delete(userId);
                break;
            }
        }
        // Оновлюємо список контактів
        io.emit('update_contacts', Array.from(activeUsers.entries()).map(([id, info]) => ({
            userId: id,
            userName: info.userName
        })));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(` Habla Backend запущено на порту ${PORT}`);
});
