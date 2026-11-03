const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const activeUsers = new Map();
const referrals = new Map();

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
                model: 'qwen/qwen3.8-27b',
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

io.on('connection', (socket) => {
    console.log("Нове з'єднано клієнта:", socket.id);

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
        
        io.emit('update_contacts', Array.from(activeUsers.entries()).map(([id, info]) => ({
            userId: id,
            userName: info.userName
        })));
    });

    socket.on('disconnect', () => {
        console.log('Клієнт відключився:', socket.id);
        for (let [userId, info] of activeUsers.entries()) {
            if (info.socketId === socket.id) {
                activeUsers.delete(userId);
                break;
            }
        }
        io.emit('update_contacts', Array.from(activeUsers.entries()).map(([id, info]) => ({
            userId: id,
            userName: info.userName
        })));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Habla Backend запущено на порту ${PORT}`);
});
