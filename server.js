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

async function translateText(text, targetLanguage) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || !text || !targetLanguage) return text;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "llama3-8b-8192",
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

        const remReq = response.headers.get('x-ratelimit-remaining-requests');
        const remTok = response.headers.get('x-ratelimit-remaining-tokens');
        if (remReq) {
            currentGroqLimits = { requests: remReq, tokens: remTok };
            io.emit('groq-limits', currentGroqLimits);
        }

        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content.trim();
        }
    } catch (error) {
        console.error('Помилка перекладу Groq:', error);
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

                let translatedTextForRecipient = originalText;
                if (recipientSocketId && userLanguages[recipient]) {
                    const recipientLang = userLanguages[recipient];
                    translatedTextForRecipient = await translateText(originalText, recipientLang);
                }

                // Відправляємо відправнику його оригінальний текст
                socket.emit('chatMessage', {
                    user: sender,
                    text: originalText,
                    recipientName: recipient,
                    isPrivate: true,
                    timestamp: timestamp
                });

                // Відправляємо отримувачу перекладений текст на його мову
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
