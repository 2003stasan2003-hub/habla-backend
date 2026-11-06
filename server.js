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

app.post('/api/translate', async (req, res) => {
    try {
        const { text, targetLanguage } = req.body;
        if (!text) return res.status(400).json({ error: 'Текст відсутній' });

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'API ключ Groq не знайдено на сервері' });
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            model: "qwen/qwen3.8-27b",
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "qwen/qwen3.8-27b",
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

const activeSockets = {}; // socket.id -> username
const allKnownUsers = new Set(); // Зберігає всі унікальні нікнейми
const userContacts = {}; // username -> Set of contact usernames added by this user

function updateUsers() {
    const onlineNames = new Set(Object.values(activeSockets));
    
    for (let [id, socket] of io.of("/").sockets) {
        const currentUsername = activeSockets[id];
        if (!currentUsername) continue;

        // Визначаємо чи є користувач адміном (наприклад, Stasan або Admin)
        const isAdmin = (currentUsername === 'Stasan' || currentUsername === 'Admin');

        const usersList = Array.from(allKnownUsers).map(name => {
            if (name === currentUsername) return null; // Не показуємо самого себе у списку контактів

            const isOnline = onlineNames.has(name);
            const myAdd = userContacts[currentUsername]?.has(name) || false;
            const theirAdd = userContacts[name]?.has(currentUsername) || false;
            const isMutual = myAdd && theirAdd;

            // Адмін бачить усіх. Звичайний користувач бачить лише тих, кого взаємно додали
            if (!isAdmin && !isMutual) {
                return null;
            }

            return {
                name: name,
                isOnline: isOnline,
                myAdd: myAdd,
                theirAdd: theirAdd,
                isMutual: isMutual
            };
        }).filter(Boolean);

        socket.emit('update-users', { users: usersList, isAdmin });
    }

    io.emit('onlineCount', onlineNames.size);
}

io.on('connection', (socket) => {
    console.log(`Користувач підключився: ${socket.id}`);

    socket.on('join', (nickname) => {
        if (!nickname) return;
        activeSockets[socket.id] = nickname;
        allKnownUsers.add(nickname);
        if (!userContacts[nickname]) {
            userContacts[nickname] = new Set();
        }
        updateUsers();
    });

    socket.on('add-contact', (targetName) => {
        const username = activeSockets[socket.id];
        if (!username || !targetName || username === targetName) return;

        allKnownUsers.add(targetName);
        if (!userContacts[username]) {
            userContacts[username] = new Set();
        }
        userContacts[username].add(targetName);
        updateUsers();
    });

    socket.on('remove-contact', (targetName) => {
        const username = activeSockets[socket.id];
        if (!username || !targetName) return;

        if (userContacts[username]) {
            userContacts[username].delete(targetName);
        }
        updateUsers();
    });

    socket.on('chatMessage', async (data) => {
        try {
            const apiKey = process.env.GROQ_API_KEY;
            let translatedText = data.text;

            if (apiKey && data.text) {
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: "qwen/qwen3.8-27b",
                        messages: [
                            {
                                role: "system",
                                content: `You are a professional translator. Translate the given text accurately and naturally into ${data.targetLang}. Return ONLY the translated text without any extra notes or formatting.`
                            },
                            { role: "user", content: data.text }
                        ],
                        max_tokens: 250
                    })
                });
                const result = await response.json();
                if (result.choices && result.choices[0] && result.choices[0].message) {
                    translatedText = result.choices[0].message.content.trim();
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
        updateUsers();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
