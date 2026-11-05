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

app.use('/.well-known', express.static('.well-known'));
app.use(express.static(__dirname));

// Універсальна функція перекладу з підтримкою резервних моделей (Fallback)
async function translateWithFallback(apiKey, text, targetLanguage) {
    const models = [
        "qwen/qwen3.8-27b",
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant"
    ];

    for (const model of models) {
        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        {
                            role: "system",
                            content: `You are a professional translator. Translate the given text accurately and naturally into ${targetLanguage}. Return ONLY the translated text without any extra notes or formatting.`
                        },
                        { role: "user", content: text }
                    ],
                    max_tokens: 250
                })
            });

            const data = await response.json();
            
            if (response.ok && data.choices && data.choices[0] && data.choices[0].message) {
                return data.choices[0].message.content.trim();
            } else {
                console.warn(`⚠️ Модель ${model} не відповіла успішно, перемикаємось на наступну...`, data);
            }
        } catch (err) {
            console.warn(`⚠️ Помилка запиту до моделі ${model}:`, err.message);
        }
    }
    return null; // Якщо всі моделі недоступні
}

app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        if (!text) return res.status(400).json({ error: 'Текст відсутній' });

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'API ключ Groq не знайдено на сервері' });
        }

        const translatedText = await translateWithFallback(apiKey, text, targetLanguage || 'English');
        if (!translatedText) {
            return res.status(500).json({ error: 'Помилка всіх мовних моделей Groq' });
        }

        res.json({ translatedText });

    } catch (error) {
        console.error('Помилка сервера:', error);
        res.status(500).json({ error: 'Помилка сервера при перекладі.' });
    }
});

const activeSockets = {}; // socket.id -> username
const allKnownUsers = new Set(); // Зберігає всі унікальні нікнейми, що заходили

function broadcastUsers() {
    const onlineNames = new Set(Object.values(activeSockets));
    
    const usersList = Array.from(allKnownUsers).map(name => ({
        id: name,
        name: name,
        isOnline: onlineNames.has(name)
    }));

    io.emit('update-users', usersList);
    io.emit('onlineCount', onlineNames.size);
}

io.on('connection', (socket) => {
    console.log(`Користувач підключився: ${socket.id}`);

    socket.on('join', (nickname) => {
        if (!nickname) return;
        activeSockets[socket.id] = nickname;
        allKnownUsers.add(nickname);
        broadcastUsers();
    });

    socket.on('chatMessage', async (data) => {
        try {
            const apiKey = process.env.GROQ_API_KEY;
            let translatedText = data.text;

            if (apiKey && data.text) {
                const result = await translateWithFallback(apiKey, data.text, data.targetLang || 'English');
                if (result) {
                    translatedText = result;
                }
            }

            const messagePayload = {
                user: data.user,
                text: translatedText,
                recipientName: data.recipientName || null,
                isPrivate: !!data.recipientName
            };

            if (data.recipientName) {
                socket.emit('chatMessage', messagePayload);
                
                let recipientSocketId = Object.keys(activeSockets).find(
                    id => activeSockets[id] === data.recipientName
                );
                if (recipientSocketId && recipientSocketId !== socket.id) {
                    io.to(recipientSocketId).emit('chatMessage', messagePayload);
                }
            } else {
                io.emit('chatMessage', messagePayload);
            }
        } catch (e) {
            console.error("Помилка сокет-перекладу:", e);
            io.emit('chatMessage', {
                user: data.user,
                text: data.text,
                isPrivate: false
            });
        }
    });

    socket.on('disconnect', () => {
        delete activeSockets[socket.id];
        broadcastUsers();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
