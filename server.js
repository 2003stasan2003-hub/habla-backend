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

// Маршрут для запобігання засинанню сервера на Render
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

app.use('/.well-known', express.static('.well-known'));
app.use(express.static(__dirname));

let currentGroqLimits = { requests: '---', tokens: '---' };

const activeSockets = {}; 
const allKnownUsers = new Set(); 
const userContacts = {}; 
const userLanguages = {}; 
const userCustomizations = {}; 

function checkIsAdmin(username) {
    if (!username) return false;
    const lower = username.toLowerCase().trim();
    return lower === 'stasan' || lower === 'admin' || lower === 'стасан';
}

function updateUsers() {
    const onlineNames = new Set(Object.values(activeSockets));
    
    for (let [id, socket] of io.of("/").sockets) {
        const currentUsername = activeSockets[id];
        if (!currentUsername) continue;

        const isAdmin = checkIsAdmin(currentUsername);

        const usersList = Array.from(allKnownUsers).map(name => {
            if (name === currentUsername) return null;

            const isOnline = onlineNames.has(name);
            const myAdd = userContacts[currentUsername]?.has(name) || false;
            const theirAdd = userContacts[name]?.has(currentUsername) || false;
            const isMutual = myAdd && theirAdd;

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

// Інтелектуальний вибір активної чат-моделі з відсіюванням системних (guard, whisper тощо)
async function getActiveModel(apiKey) {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/models', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const data = await response.json();
        if (response.ok && data.data && data.data.length > 0) {
            const chatModels = data.data.filter(m => {
                const id = m.id.toLowerCase();
                const isChat = id.includes('llama') || id.includes('mixtral') || id.includes('gemma') || id.includes('gpt') || id.includes('qwen') || id.includes('allam');
                const isSystem = id.includes('guard') || id.includes('whisper') || id.includes('embed') || id.includes('tool') || id.includes('audio') || id.includes('orpheus') || id.includes('tts');
                return isChat && !isSystem;
            });

            if (chatModels.length > 0) return chatModels[0].id;
            return data.data[0].id;
        }
    } catch (e) {
        console.error("Помилка отримання списку моделей:", e.message);
    }
    return "llama-3.1-70b-versatile";
}

async function translateText(text, targetLanguage) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || !text || !targetLanguage) return text;

    const modelName = await getActiveModel(apiKey);

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelName,
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

        if (response.ok) {
            const remReq = response.headers.get('x-ratelimit-remaining-requests');
            const remTok = response.headers.get('x-ratelimit-remaining-tokens');
            if (remReq) {
                currentGroqLimits = { requests: remReq, tokens: remTok };
                io.emit('groq-limits', currentGroqLimits);
            }

            if (data.choices && data.choices[0] && data.choices[0].message) {
                console.log(`✅ Успішний переклад через модель: ${modelName}`);
                return data.choices[0].message.content.trim();
            }
        } else {
            console.error(`❌ Помилка Groq [Модель: ${modelName}] [Статус: ${response.status}]:`, JSON.stringify(data));
        }
    } catch (error) {
        console.error(`❌ Мережева помилка з моделлю ${modelName}:`, error.message);
    }

    return text;
}

io.on('connection', (socket) => {
    console.log(`Користувач підключився: ${socket.id}`);
    socket.emit('groq-limits', currentGroqLimits);

    socket.on('join', (data) => {
        let username, lang;
        if (typeof data === 'object' && data !== null) {
            username = data.username;
            lang = data.lang || 'Spanish';
        } else {
            username = data;
            lang = 'Spanish';
        }

        if (!username) return;
        activeSockets[socket.id] = username;
        allKnownUsers.add(username);
        userLanguages[username] = lang;

        if (!userContacts[username]) {
            userContacts[username] = new Set();
        }

        if (userCustomizations[username]) {
            socket.emit('sync-customizations', userCustomizations[username]);
        }

        updateUsers();
    });

    // Миттєве оновлення мови на сервері за мілісекунди
    socket.on('update-language', (newLang) => {
        const username = activeSockets[socket.id];
        if (username && newLang) {
            userLanguages[username] = newLang;
            console.log(`🌐 Користувач ${username} оновив мову на льоту: ${newLang}`);
        }
    });

    socket.on('update-customization', ({ targetName, color, avatar }) => {
        const username = activeSockets[socket.id];
        if (!username || !targetName) return;

        if (!userCustomizations[username]) {
            userCustomizations[username] = {};
        }
        userCustomizations[username][targetName] = { color, avatar };

        for (let [id, name] of Object.entries(activeSockets)) {
            if (name === username) {
                io.to(id).emit('sync-customizations', userCustomizations[username]);
            }
        }
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

    socket.on('chatMessage', async (data) => {
        try {
            const sender = data.user;
            const recipient = data.recipientName;
            const originalText = data.text;
            const timestamp = Date.now();

            if (!originalText) return;

            if (recipient) {
                const cleanRecipient = recipient.toLowerCase().trim();
                const recipientSocketId = Object.keys(activeSockets).find(
                    id => activeSockets[id] && activeSockets[id].toLowerCase().trim() === cleanRecipient
                );

                const recipientLang = userLanguages[recipient] || 'Spanish';
                let translatedTextForRecipient = await translateText(originalText, recipientLang);

                socket.emit('chatMessage', {
                    user: sender,
                    text: originalText,
                    recipientName: recipient,
                    isPrivate: true,
                    timestamp: timestamp
                });

                if (recipientSocketId && recipientSocketId !== socket.id) {
                    io.to(recipientSocketId).emit('chatMessage', {
                        user: sender,
                        text: translatedTextForRecipient,
                        recipientName: sender,
                        isPrivate: true,
                        timestamp: timestamp
                    });
                }
            } else {
                const messageObj = {
                    user: sender,
                    text: originalText,
                    isPrivate: false,
                    timestamp: timestamp
                };
                socket.emit('chatMessage', messageObj);
                socket.broadcast.emit('chatMessage', messageObj);
            }
        } catch (e) {
            console.error("Помилка обробки повідомлення:", e);
        }
    });

    socket.on('disconnect', () => {
        delete activeSockets[socket.id];
        updateUsers();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
